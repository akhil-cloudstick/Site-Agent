import type { Payload } from 'payload'

import type { User } from '../payload-types'
import { getBrokerClient } from './payload-client'

/**
 * The audited Local-API adapter (Contract A). Every tenant content write goes
 * through here. It:
 *   - acts as the tenant's minimal-role SERVICE PRINCIPAL (never a human user),
 *   - always uses `overrideAccess: false` so the multi-tenant row filter, field
 *     validation, and the ChangeSet `beforeValidate` hook all run,
 *   - ENSURES an active ChangeSet exists before the write (auto-opens one on the
 *     first edit), with a zero-write backstop so a failed first edit leaves no
 *     ghost ChangeSet.
 *
 * Deferred (logged in PENDING.md): wrapping ensure+write in one DB transaction
 * under a per-Site advisory lock. That hardening lands with Discard, where the
 * write/discard race it guards against first exists. For the single-user slice-1
 * loop the zero-write backstop is sufficient.
 */

export type ServicePrincipal = User

export async function resolveServicePrincipal(payload: Payload, tenantId: number): Promise<ServicePrincipal> {
  const res = await payload.find({
    collection: 'users',
    where: {
      and: [{ isServicePrincipal: { equals: true } }, { 'tenants.tenant': { equals: tenantId } }],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const principal = res.docs[0]
  if (!principal) throw new Error(`No service principal found for tenant ${tenantId}`)
  return principal
}

async function ensureActiveChangeSet(payload: Payload, tenantId: number) {
  const found = await payload.find({
    collection: 'changesets',
    where: { and: [{ tenant: { equals: tenantId } }, { status: { equals: 'active' } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (found.docs[0]) return { changeSet: found.docs[0], created: false }
  const changeSet = await payload.create({
    collection: 'changesets',
    data: { tenant: tenantId, status: 'active', kind: 'content' },
    overrideAccess: true,
  })
  return { changeSet, created: true }
}

/**
 * Ensure the tenant has an active ChangeSet, then run `write` as the tenant's
 * service principal (the caller's `write` performs the actual create/update with
 * `overrideAccess: false` and `user: principal`). Returns whatever `write` returns.
 */
export async function applyContentWrite<T>(
  tenantId: number,
  write: (payload: Payload, principal: ServicePrincipal) => Promise<T>,
): Promise<T> {
  const payload = await getBrokerClient()
  const principal = await resolveServicePrincipal(payload, tenantId)
  const { changeSet, created } = await ensureActiveChangeSet(payload, tenantId)

  try {
    return await write(payload, principal)
  } catch (err) {
    if (created) {
      // Zero-write backstop: a failed first edit must not leave a ghost ChangeSet.
      const pages = await payload.find({
        collection: 'pages',
        where: { changeSetId: { equals: changeSet.id } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      if (pages.totalDocs === 0) {
        await payload.delete({ collection: 'changesets', id: changeSet.id, overrideAccess: true }).catch(() => {})
      }
    }
    throw err
  }
}

/** Read a tenant's pages as its service principal (tenant-scoped, overrideAccess:false). */
export async function listTenantPages(tenantId: number, depth = 0) {
  const payload = await getBrokerClient()
  const principal = await resolveServicePrincipal(payload, tenantId)
  const res = await payload.find({
    collection: 'pages',
    user: principal,
    overrideAccess: false,
    draft: true,
    limit: 50,
    sort: 'navOrder',
    depth,
  })
  return res.docs
}

/** Create a new page for a tenant through the safe write path (auto-opens a ChangeSet, draft). */
export async function createTenantPage(
  tenantId: number,
  data: { title: string; slug: string; navLabel?: string; navOrder?: number; layout?: unknown[] },
) {
  return applyContentWrite(tenantId, (payload, principal) =>
    payload.create({
      collection: 'pages',
      data: { ...data, tenant: tenantId } as any,
      user: principal,
      overrideAccess: false,
      draft: true,
    }),
  )
}

/** Delete one of a tenant's pages through the safe write path (auto-opens a ChangeSet). */
export async function deleteTenantPage(tenantId: number, pageId: number) {
  return applyContentWrite(tenantId, (payload, principal) =>
    payload.delete({
      collection: 'pages',
      id: pageId,
      user: principal,
      overrideAccess: false,
    }),
  )
}

/** Upload an image for a tenant (stored locally in dev; on R2 once deployed). Tenant-scoped. */
export async function uploadTenantMedia(
  tenantId: number,
  file: { buffer: Buffer; filename: string; mimetype: string; alt: string },
) {
  const payload = await getBrokerClient()
  const principal = await resolveServicePrincipal(payload, tenantId)
  return payload.create({
    collection: 'media',
    // The multi-tenant plugin requires the tenant; set it explicitly (it isn't
    // auto-filled on a Local-API create).
    data: { alt: file.alt, tenant: tenantId } as any,
    file: { data: file.buffer, mimetype: file.mimetype, name: file.filename, size: file.buffer.length },
    user: principal,
    overrideAccess: false,
  })
}

/** Update one of a tenant's pages through the safe write path (auto-opens a ChangeSet, draft). */
export async function updateTenantPage(tenantId: number, pageId: number, data: Record<string, unknown>) {
  return applyContentWrite(tenantId, (payload, principal) =>
    payload.update({
      collection: 'pages',
      id: pageId,
      data,
      user: principal,
      overrideAccess: false,
      draft: true,
    }),
  )
}
