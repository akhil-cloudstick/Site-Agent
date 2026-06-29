import type { User } from '../payload-types'
import { getBrokerClient } from '../broker/payload-client'
import { assertOperator } from './dashboard'

/**
 * Tenant error log — write side + operator read side.
 *
 * `logTenantError` is called from every failure seam (and the job runner) to record WHAT a
 * tenant tried and WHY it failed. It is **best-effort**: it never throws, so a logging failure
 * can never break the user's request. The operator views these on /admin/errors.
 */

/** Collapse a message to a single clean line (no raw stack/terminal dump). */
const oneLine = (s: unknown): string =>
  String(s ?? '')
    .split('\n')[0]
    .replace(/\s+/g, ' ')
    .trim()

export async function logTenantError(
  tenantId: number | null | undefined,
  action: string,
  message: unknown,
  opts: { siteId?: number | null; detail?: string; userId?: number } = {},
): Promise<void> {
  try {
    if (!tenantId) return
    const payload = await getBrokerClient()
    await payload.create({
      collection: 'errorLogs',
      data: {
        tenant: tenantId,
        action: String(action).slice(0, 60),
        message: oneLine(message).slice(0, 300) || 'Unknown error',
        ...(opts.detail ? { detail: String(opts.detail).slice(0, 1000) } : {}),
        ...(opts.siteId != null ? { siteId: opts.siteId } : {}),
        ...(opts.userId != null ? { userId: opts.userId } : {}),
      } as any,
      overrideAccess: true,
    })
  } catch {
    // best-effort: telemetry must never surface to the user or abort a flow.
  }
}

export interface ErrorLogDto {
  id: string
  source: 'log' | 'task'
  tenantId: number | null
  tenantName: string
  action: string
  message: string
  detail: string | null
  siteId: number | null
  userId: number | null
  createdAt: string
}

const tenantIdOf = (rel: unknown): number | null => (typeof rel === 'object' && rel ? (rel as any).id : (rel as any)) ?? null
const JOB_ACTION: Record<string, string> = { connect: 'connect_site', publish: 'publish', delete: 'delete_site' }

/**
 * Operator read: a UNIFIED list of failures a tenant hit — the non-job error log (AI/page/connect
 * etc., from `logTenantError`) AND failed background TASKS (connect/publish/delete jobs that ended
 * in `error`, read straight from the Jobs row so old failures show too) — newest first, cross-tenant
 * or filtered to one tenant.
 */
export async function loadOperatorErrors(
  user: User | null,
  opts: { tenantId?: number; limit?: number } = {},
): Promise<ErrorLogDto[]> {
  assertOperator(user)
  const payload = await getBrokerClient()
  const limit = opts.limit ?? 250
  const tenantWhere: any = opts.tenantId ? { tenant: { equals: opts.tenantId } } : {}
  const [logsRes, jobsRes, tenantsRes] = await Promise.all([
    payload.find({ collection: 'errorLogs', where: tenantWhere, overrideAccess: true, sort: '-createdAt', limit, depth: 0 }),
    payload.find({
      collection: 'jobs',
      where: opts.tenantId ? { and: [{ tenant: { equals: opts.tenantId } }, { status: { equals: 'error' } }] } : { status: { equals: 'error' } },
      overrideAccess: true,
      sort: '-finishedAt',
      limit,
      depth: 0,
    }),
    payload.find({ collection: 'tenants', overrideAccess: true, limit: 2000, depth: 0 }),
  ])
  const names = new Map<number, string>()
  for (const t of tenantsRes.docs as any[]) names.set(t.id, t.name ?? '(unnamed)')
  const nameOf = (tid: number | null) => (tid != null ? (names.get(tid) ?? `#${tid}`) : '(unknown)')

  const fromLogs: ErrorLogDto[] = (logsRes.docs as any[]).map((e) => {
    const tid = tenantIdOf(e.tenant)
    return {
      id: `log-${e.id}`,
      source: 'log',
      tenantId: tid,
      tenantName: nameOf(tid),
      action: e.action ?? '',
      message: e.message ?? '',
      detail: e.detail ?? null,
      siteId: typeof e.siteId === 'number' ? e.siteId : null,
      userId: typeof e.userId === 'number' ? e.userId : null,
      createdAt: e.createdAt ?? '',
    }
  })

  const fromJobs: ErrorLogDto[] = (jobsRes.docs as any[]).map((j) => {
    const tid = tenantIdOf(j.tenant)
    // The last error line from the job's logs gives extra "why" context beyond the one-liner.
    const errLog = Array.isArray(j.logs) ? [...j.logs].reverse().find((l: any) => l?.flavor === 'error') : null
    return {
      id: `task-${j.id}`,
      source: 'task',
      tenantId: tid,
      tenantName: nameOf(tid),
      action: JOB_ACTION[j.type] ?? j.type ?? 'task',
      message: j.error || 'The task failed.',
      detail: [j.stage ? `stage: ${j.stage}` : '', errLog?.text ?? ''].filter(Boolean).join(' · ') || null,
      siteId: typeof j.siteId === 'number' ? j.siteId : null,
      userId: null,
      createdAt: j.finishedAt ?? j.updatedAt ?? '',
    }
  })

  return [...fromLogs, ...fromJobs].sort((a, b) => (b.createdAt > a.createdAt ? 1 : b.createdAt < a.createdAt ? -1 : 0)).slice(0, limit)
}
