import { rm } from 'node:fs/promises'
import path from 'node:path'

import { resolveServicePrincipal } from '../broker/adapter'
import { getBrokerClient } from '../broker/payload-client'
import { getLive, type JobLog, type JobStatus, type JobType } from './registry'

const PUBLISH_DIR = path.join(process.cwd(), '.connected-publish')

/** A row stale enough to reap must be older than this with no live entry (avoid reaping a job mid-spawn). */
const STALE_AGE_MS = 5_000

export interface JobRow {
  id: number
  type: JobType
  siteId: number | null
  status: JobStatus
  percent: number
  stage: string | null
  logs: JobLog[]
  error: string | null
  result: Record<string, unknown> | null
}

function toRow(doc: any): JobRow {
  return {
    id: doc.id,
    type: doc.type,
    siteId: typeof doc.siteId === 'number' ? doc.siteId : null,
    status: doc.status,
    percent: typeof doc.percent === 'number' ? doc.percent : 0,
    stage: doc.stage ?? null,
    logs: Array.isArray(doc.logs) ? doc.logs : [],
    error: doc.error ?? null,
    result: doc.result ?? null,
  }
}

export async function createJob(tenantId: number, type: JobType, siteId: number | null): Promise<number> {
  const payload = await getBrokerClient()
  const principal = await resolveServicePrincipal(payload, tenantId)
  const doc = await payload.create({
    collection: 'jobs',
    data: { tenant: tenantId, type, siteId, status: 'running', percent: 0, logs: [] } as any,
    user: principal,
    overrideAccess: false,
  })
  return doc.id as number
}

// Serialize writes PER JOB. Payload's update is read-modify-write, so a fire-and-forget
// progress write (no status) racing the terminal `done` write could read the row while
// still `running` and clobber the status back. Chaining writes per job keeps the terminal
// state from being overwritten. Kept on globalThis to survive HMR.
const g = globalThis as unknown as { __saJobWrites?: Map<number, Promise<void>> }
const writeChains: Map<number, Promise<void>> = (g.__saJobWrites ??= new Map())

export async function updateJob(tenantId: number, jobId: number, data: Record<string, unknown>): Promise<void> {
  const prev = writeChains.get(jobId) ?? Promise.resolve()
  const next = prev.then(async () => {
    const payload = await getBrokerClient()
    const principal = await resolveServicePrincipal(payload, tenantId)
    await payload
      .update({ collection: 'jobs', id: jobId, data: data as any, user: principal, overrideAccess: false })
      .catch(() => {})
  })
  writeChains.set(jobId, next.catch(() => {}))
  return next
}

/** Read one job (tenant-scoped). Prefer the LIVE entry for smooth progress, fall back to the row. */
export async function getJob(tenantId: number, jobId: number): Promise<JobRow | null> {
  const payload = await getBrokerClient()
  const principal = await resolveServicePrincipal(payload, tenantId)
  const res = await payload.find({
    collection: 'jobs',
    where: { id: { equals: jobId } },
    user: principal,
    overrideAccess: false,
    limit: 1,
    depth: 0,
  })
  const doc = res.docs[0]
  if (!doc) return null
  const row = toRow(doc)
  const live = getLive(jobId)
  if (live && (row.status === 'running' || row.status === 'cancelling')) {
    // Live state is fresher than the at-stage-boundary mirror.
    row.percent = live.percent
    row.stage = live.stage
    if (live.logs.length) row.logs = live.logs
    if (live.cancelRequested && row.status === 'running') row.status = 'cancelling'
  }
  return row
}

/** The newest still-active job for a site (for re-attaching the modal after a refresh). */
export async function findActiveJobForSite(tenantId: number, siteId: number): Promise<JobRow | null> {
  const payload = await getBrokerClient()
  const principal = await resolveServicePrincipal(payload, tenantId)
  const res = await payload.find({
    collection: 'jobs',
    where: {
      and: [{ siteId: { equals: siteId } }, { status: { in: ['running', 'cancelling'] } }],
    },
    user: principal,
    overrideAccess: false,
    limit: 1,
    sort: '-createdAt',
    depth: 0,
  })
  const doc = res.docs[0]
  return doc ? await getJob(tenantId, doc.id as number) : null
}

/**
 * Detect jobs left `running`/`cancelling` with no live entry (a server restart — or, in
 * dev, an HMR that wiped the in-memory registry) and mark them failed so the modal can
 * resolve. Deliberately NON-DESTRUCTIVE: it only removes the publish TEMP folder; it never
 * deletes a site's managed SOURCE folder or its record (a half-finished connect just
 * leaves a removable shell — far safer than auto-deleting a user's site). Skips jobs
 * younger than STALE_AGE_MS (they may be mid-spawn in this process).
 */
export async function reapStaleJobs(tenantId: number): Promise<void> {
  const payload = await getBrokerClient()
  const principal = await resolveServicePrincipal(payload, tenantId)
  const res = await payload.find({
    collection: 'jobs',
    where: { status: { in: ['running', 'cancelling'] } },
    user: principal,
    overrideAccess: false,
    limit: 50,
    depth: 0,
  })
  const now = Date.now()
  for (const doc of res.docs as any[]) {
    if (getLive(doc.id)) continue // still alive in this process
    const age = now - new Date(doc.updatedAt ?? doc.createdAt ?? now).getTime()
    if (age < STALE_AGE_MS) continue
    const siteId = typeof doc.siteId === 'number' ? doc.siteId : null
    // Only the publish temp is safe to drop automatically.
    if (siteId != null && doc.type === 'publish') {
      await rm(path.join(PUBLISH_DIR, String(siteId)), { recursive: true, force: true }).catch(() => {})
    }
    await payload
      .update({
        collection: 'jobs',
        id: doc.id,
        data: { status: 'error', error: 'Interrupted before it finished.', finishedAt: new Date().toISOString() } as any,
        user: principal,
        overrideAccess: false,
      })
      .catch(() => {})
  }
}
