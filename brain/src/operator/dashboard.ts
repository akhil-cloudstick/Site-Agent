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

export interface TenantDetailDto {
  id: number
  name: string
  slug: string
  status: string
  liveUrl: string | null
  allowOperatorEdit: boolean
  members: number
  activeJobs: number
  builtPages: number
  publishedSites: number
  sites: OperatorSiteDto[]
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

  const [sitesRes, jobsRes, usersRes, pagesRes] = await Promise.all([
    payload.find({ collection: 'connectedSites', where: { tenant: { equals: tenantId } }, overrideAccess: true, limit: 2000, depth: 0 }),
    payload.find({ collection: 'jobs', where: { and: [{ tenant: { equals: tenantId } }, { status: { in: ['running', 'cancelling'] } }] }, overrideAccess: true, limit: 1000, depth: 0 }),
    payload.find({ collection: 'users', where: { 'tenants.tenant': { equals: tenantId } }, overrideAccess: true, limit: 2000, depth: 0 }),
    payload.find({ collection: 'pages', where: { tenant: { equals: tenantId } }, overrideAccess: true, limit: 1, depth: 0, draft: true }),
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

  return {
    id: tenant.id,
    name: tenant.name ?? '(unnamed)',
    slug: tenant.slug ?? '',
    status: tenant.status ?? 'active',
    liveUrl: cleanUrl(tenant.liveUrl),
    allowOperatorEdit: Boolean(tenant.allowOperatorEdit),
    members,
    activeJobs: jobsRes.totalDocs ?? jobsRes.docs.length,
    builtPages: pagesRes.totalDocs ?? 0,
    publishedSites: sites.filter((s) => s.liveUrl).length,
    sites,
  }
}
