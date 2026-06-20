import { getBrokerClient } from '../broker/payload-client'
import { resolveServicePrincipal } from '../broker/adapter'

/**
 * Simple publish (slice of Module 9): freeze the tenant's current drafts as the
 * PUBLISHED version of each page. The full publish saga (snapshot → media stage →
 * protected merge → deploy → publish-last, with rollback) lands later; this marks
 * the draft content published so the public site route can serve it.
 *
 * Writes go through the tenant's service principal with overrideAccess:false so the
 * multi-tenant scoping + ChangeSet hook still apply.
 */
export async function publishTenantPages(tenantId: number): Promise<{ count: number; slug: string }> {
  const payload = await getBrokerClient()
  const principal = await resolveServicePrincipal(payload, tenantId)

  const pages = await payload.find({
    collection: 'pages',
    where: { tenant: { equals: tenantId } },
    draft: true,
    depth: 0,
    limit: 50,
    overrideAccess: false,
    user: principal,
  })

  let count = 0
  for (const p of pages.docs) {
    // Publishing the latest draft: update with _status:'published' (not draft:true).
    await payload.update({
      collection: 'pages',
      id: p.id,
      data: { _status: 'published' } as any,
      overrideAccess: false,
      user: principal,
    })
    count++
  }

  const tenant = (await payload.find({ collection: 'tenants', where: { id: { equals: tenantId } }, limit: 1, overrideAccess: true })).docs[0]
  return { count, slug: (tenant as any)?.slug ?? '' }
}

/** Record the published site's public URL on the tenant (system write). */
export async function saveTenantLiveUrl(tenantId: number, liveUrl: string): Promise<void> {
  const payload = await getBrokerClient()
  await payload.update({ collection: 'tenants', id: tenantId, data: { liveUrl } as any, overrideAccess: true })
}

/** The tenant's saved live URL (shown persistently in the workspace). */
export async function getTenantLiveUrl(tenantId: number): Promise<string | null> {
  const payload = await getBrokerClient()
  const tenant = (await payload.find({ collection: 'tenants', where: { id: { equals: tenantId } }, limit: 1, overrideAccess: true })).docs[0]
  const url = (tenant as any)?.liveUrl
  return typeof url === 'string' && url ? url : null
}
