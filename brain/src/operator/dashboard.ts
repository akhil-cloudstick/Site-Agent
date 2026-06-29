import type { User } from '../payload-types'
import { getBrokerClient } from '../broker/payload-client'

/**
 * Operator-only dashboard data: a cross-tenant view of every tenant, their connected
 * sites, and usage. Read with overrideAccess:true (operator scope). Authorization is
 * enforced INSIDE these loaders (Codex R2 #23) — not only in the page — so a future
 * un-gated caller can't leak cross-tenant data.
 */

/** Throw unless the caller is an operator. Used by every loader before any overrideAccess read. */
export function assertOperator(user: User | null): asserts user is User {
  if (!user?.isOperator) {
    const err: any = new Error('Operators only.')
    err.status = 403
    throw err
  }
}

export interface OperatorSiteDto {
  id: number
  name: string
  originUrl: string
  liveUrl: string | null
  status: string
  pages: number
}
export interface OperatorTenantDto {
  id: number
  name: string
  slug: string
  status: string
  planLabel: string | null
  liveUrl: string | null
  members: number
  activeJobs: number
  allowOperatorEdit: boolean
  sites: OperatorSiteDto[]
}
export interface OperatorDashboardDto {
  totals: { tenants: number; sites: number; published: number; activeJobs: number }
  tenants: OperatorTenantDto[]
}

export interface TenantUsageDto {
  pages: number
  mediaCount: number
  storageMb: number
  publishedTotal: number
  published30d: number
  jobsDone30d: number
  jobsFailed30d: number
  errors30d: number
}
export interface TenantDetailDto {
  id: number
  name: string
  slug: string
  status: string
  planLabel: string | null
  liveUrl: string | null
  allowOperatorEdit: boolean
  members: number
  activeJobs: number
  builtPages: number
  publishedSites: number
  sites: OperatorSiteDto[]
  usage: TenantUsageDto
}

const cleanUrl = (u: unknown): string | null => {
  const s = typeof u === 'string' ? u.trim() : ''
  return s && !s.startsWith('pending:') ? s : null
}

const tenantIdOf = (rel: unknown): number | null => (typeof rel === 'object' && rel ? (rel as any).id : (rel as any)) ?? null

export async function loadOperatorDashboard(user: User | null): Promise<OperatorDashboardDto> {
  assertOperator(user)
  const payload = await getBrokerClient()
  const [tenantsRes, sitesRes, jobsRes, usersRes] = await Promise.all([
    payload.find({ collection: 'tenants', overrideAccess: true, limit: 1000, depth: 0 }),
    payload.find({ collection: 'connectedSites', overrideAccess: true, limit: 2000, depth: 0 }),
    payload.find({ collection: 'jobs', where: { status: { in: ['running', 'cancelling'] } }, overrideAccess: true, limit: 1000, depth: 0 }),
    payload.find({ collection: 'users', overrideAccess: true, limit: 2000, depth: 0 }),
  ])

  const sitesByTenant = new Map<number, OperatorSiteDto[]>()
  for (const s of sitesRes.docs as any[]) {
    const tid = tenantIdOf(s.tenant)
    if (tid == null) continue
    const list = sitesByTenant.get(tid) ?? []
    list.push({
      id: s.id,
      name: s.name ?? '(unnamed)',
      originUrl: cleanUrl(s.originUrl) ?? '',
      liveUrl: cleanUrl(s.liveUrl),
      status: s.status ?? 'connected',
      pages: Array.isArray(s.pagePaths) ? s.pagePaths.length : 0,
    })
    sitesByTenant.set(tid, list)
  }

  const jobsByTenant = new Map<number, number>()
  for (const j of jobsRes.docs as any[]) {
    const tid = tenantIdOf(j.tenant)
    if (tid == null) continue
    jobsByTenant.set(tid, (jobsByTenant.get(tid) ?? 0) + 1)
  }

  const membersByTenant = new Map<number, number>()
  for (const u of usersRes.docs as any[]) {
    if (u.isServicePrincipal) continue
    for (const t of Array.isArray(u.tenants) ? u.tenants : []) {
      const tid = tenantIdOf(t?.tenant)
      if (tid == null) continue
      membersByTenant.set(tid, (membersByTenant.get(tid) ?? 0) + 1)
    }
  }

  const tenants: OperatorTenantDto[] = (tenantsRes.docs as any[]).map((t) => ({
    id: t.id,
    name: t.name ?? '(unnamed)',
    slug: t.slug ?? '',
    status: t.status ?? 'active',
    planLabel: (typeof t.planLabel === 'string' && t.planLabel.trim()) || null,
    liveUrl: cleanUrl(t.liveUrl),
    members: membersByTenant.get(t.id) ?? 0,
    activeJobs: jobsByTenant.get(t.id) ?? 0,
    allowOperatorEdit: Boolean(t.allowOperatorEdit),
    sites: sitesByTenant.get(t.id) ?? [],
  }))
  tenants.sort((a, b) => b.sites.length - a.sites.length)

  const allSites = [...sitesByTenant.values()].flat()
  return {
    totals: {
      tenants: tenants.length,
      sites: allSites.length,
      published: allSites.filter((s) => s.liveUrl).length,
      activeJobs: jobsRes.totalDocs ?? jobsRes.docs.length,
    },
    tenants,
  }
}

/** Per-tenant detail: live, already-queryable usage counts (Codex grill: live counts only). */
export async function loadTenantDetail(user: User | null, tenantId: number): Promise<TenantDetailDto | null> {
  assertOperator(user)
  const payload = await getBrokerClient()
  const tenant: any = await payload.findByID({ collection: 'tenants', id: tenantId, overrideAccess: true, depth: 0 }).catch(() => null)
  if (!tenant) return null

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const ofTenant = (extra: any = {}) => ({ and: [{ tenant: { equals: tenantId } }, extra] })
  const [sitesRes, jobsRes, usersRes, pagesRes, mediaRes, pubTotalRes, pub30Res, jobsDoneRes, jobsFailRes, errors30Res] = await Promise.all([
    payload.find({ collection: 'connectedSites', where: { tenant: { equals: tenantId } }, overrideAccess: true, limit: 2000, depth: 0 }),
    payload.find({ collection: 'jobs', where: ofTenant({ status: { in: ['running', 'cancelling'] } }), overrideAccess: true, limit: 1000, depth: 0 }),
    payload.find({ collection: 'users', where: { 'tenants.tenant': { equals: tenantId } }, overrideAccess: true, limit: 2000, depth: 0 }),
    payload.find({ collection: 'pages', where: { tenant: { equals: tenantId } }, overrideAccess: true, limit: 1, depth: 0, draft: true }),
    payload.find({ collection: 'media', where: { tenant: { equals: tenantId } }, overrideAccess: true, limit: 5000, depth: 0 }),
    payload.find({ collection: 'jobs', where: ofTenant({ and: [{ type: { equals: 'publish' } }, { status: { equals: 'done' } }] }), overrideAccess: true, limit: 1, depth: 0 }),
    payload.find({ collection: 'jobs', where: ofTenant({ and: [{ type: { equals: 'publish' } }, { status: { equals: 'done' } }, { finishedAt: { greater_than: since } }] }), overrideAccess: true, limit: 1, depth: 0 }),
    payload.find({ collection: 'jobs', where: ofTenant({ and: [{ status: { equals: 'done' } }, { finishedAt: { greater_than: since } }] }), overrideAccess: true, limit: 1, depth: 0 }),
    payload.find({ collection: 'jobs', where: ofTenant({ and: [{ status: { equals: 'error' } }, { finishedAt: { greater_than: since } }] }), overrideAccess: true, limit: 1, depth: 0 }),
    payload.find({ collection: 'errorLogs', where: ofTenant({ createdAt: { greater_than: since } }), overrideAccess: true, limit: 1, depth: 0 }),
  ])

  const sites: OperatorSiteDto[] = (sitesRes.docs as any[]).map((s) => ({
    id: s.id,
    name: s.name ?? '(unnamed)',
    originUrl: cleanUrl(s.originUrl) ?? '',
    liveUrl: cleanUrl(s.liveUrl),
    status: s.status ?? 'connected',
    pages: Array.isArray(s.pagePaths) ? s.pagePaths.length : 0,
  }))
  const members = (usersRes.docs as any[]).filter((u) => !u.isServicePrincipal).length
  const storageBytes = (mediaRes.docs as any[]).reduce((sum, m) => sum + (typeof m.filesize === 'number' ? m.filesize : 0), 0)

  return {
    id: tenant.id,
    name: tenant.name ?? '(unnamed)',
    slug: tenant.slug ?? '',
    status: tenant.status ?? 'active',
    planLabel: (typeof tenant.planLabel === 'string' && tenant.planLabel.trim()) || null,
    liveUrl: cleanUrl(tenant.liveUrl),
    allowOperatorEdit: Boolean(tenant.allowOperatorEdit),
    members,
    activeJobs: jobsRes.totalDocs ?? jobsRes.docs.length,
    builtPages: pagesRes.totalDocs ?? 0,
    publishedSites: sites.filter((s) => s.liveUrl).length,
    sites,
    usage: {
      pages: pagesRes.totalDocs ?? 0,
      mediaCount: mediaRes.totalDocs ?? (mediaRes.docs as any[]).length,
      storageMb: Math.round((storageBytes / (1024 * 1024)) * 10) / 10,
      publishedTotal: pubTotalRes.totalDocs ?? 0,
      published30d: pub30Res.totalDocs ?? 0,
      jobsDone30d: jobsDoneRes.totalDocs ?? 0,
      jobsFailed30d: jobsFailRes.totalDocs ?? 0,
      errors30d: errors30Res.totalDocs ?? 0,
    },
  }
}
