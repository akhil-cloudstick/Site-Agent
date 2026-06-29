import type { User } from '../payload-types'
import { getBrokerClient } from '../broker/payload-client'
import { deleteConnectedSite } from '../connected/store'
import { deleteCloudflareProject } from '../publish/deploy-cloudflare'
import { assertOperator } from './dashboard'

/**
 * Permanently remove a tenant and everything it owns. Operator-only. Order matters: delete
 * connected sites first (rows + on-disk folders, and optionally their Cloudflare projects),
 * then the tenant-scoped collections (pages before changesets so the FK is satisfied), media,
 * jobs, error logs, the tenant's users, and finally the tenant row.
 *
 * `deleteCloudflare` is opt-in (the operator ticks a box) — it takes the live sites down.
 */
export async function removeTenant(
  user: User | null,
  tenantId: number,
  opts: { deleteCloudflare?: boolean } = {},
): Promise<{ sitesRemoved: number; cloudflareDeleted: number }> {
  assertOperator(user)
  const payload = await getBrokerClient()

  // 1. Connected sites — delete each via the store helper (removes the row + managed folders),
  //    optionally deleting its Cloudflare Pages project first.
  const sites = await payload.find({ collection: 'connectedSites', where: { tenant: { equals: tenantId } }, overrideAccess: true, limit: 2000, depth: 0 })
  let cloudflareDeleted = 0
  for (const s of sites.docs as any[]) {
    if (opts.deleteCloudflare && typeof s.cloudflareProject === 'string' && s.cloudflareProject.trim()) {
      if (await deleteCloudflareProject(s.cloudflareProject)) cloudflareDeleted += 1
    }
    await deleteConnectedSite(tenantId, s.id).catch(() => {})
  }

  // 2. Tenant-scoped collections (pages before changesets to respect the changeSetId FK).
  for (const collection of ['pages', 'changesets', 'media', 'jobs', 'errorLogs'] as const) {
    await payload.delete({ collection, where: { tenant: { equals: tenantId } }, overrideAccess: true }).catch(() => {})
  }

  // 3. The tenant's users (members + service principal), then the tenant row itself.
  const users = await payload.find({ collection: 'users', where: { 'tenants.tenant': { equals: tenantId } }, overrideAccess: true, limit: 2000, depth: 0 })
  for (const u of users.docs as any[]) {
    await payload.delete({ collection: 'users', id: u.id, overrideAccess: true }).catch(() => {})
  }
  await payload.delete({ collection: 'tenants', id: tenantId, overrideAccess: true })

  return { sitesRemoved: sites.docs.length, cloudflareDeleted }
}
