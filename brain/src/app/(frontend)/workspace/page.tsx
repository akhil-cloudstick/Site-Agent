import { headers as nextHeaders } from 'next/headers'
import { redirect } from 'next/navigation'

import { resolveEffectiveTenant } from '@/auth/session'
import { getBrokerClient } from '@/broker/payload-client'
import { listConnectedSites } from '@/connected/store'
import { getTenantLiveUrl } from '@/publish/publish'
import { loadWorkspaceDto } from '@/workspace/preview'

import { UnifiedWorkspace } from './UnifiedWorkspace'

export const dynamic = 'force-dynamic'

export default async function WorkspacePage({ searchParams }: { searchParams: Promise<{ site?: string; view?: string }> }) {
  const reqHeaders = (await nextHeaders()) as unknown as Headers
  const eff = await resolveEffectiveTenant(reqHeaders)

  // Not signed in → shared login at /. Enact the resolver's action (Server Components
  // can't clear cookies, so we redirect to a route handler that does).
  if (!eff.user) redirect('/')
  if (eff.action === 'redirect-admin') redirect('/admin')
  if (eff.action === 'clear-cookie-redirect-admin') redirect('/exit-impersonation?to=/admin')
  if (eff.action === 'clear-cookie-resolve-tenant') redirect('/exit-impersonation?to=/workspace')

  const tenantId = eff.tenantId
  if (!tenantId) {
    return (
      <main style={{ fontFamily: 'system-ui', padding: 40, maxWidth: 560 }}>
        <h2>No site linked to this account</h2>
        <p>
          You are signed in as <strong>{eff.user.email}</strong>, but this account is not linked to a site.
        </p>
      </main>
    )
  }

  const payload = await getBrokerClient()
  const tenant: any = await payload
    .findByID({ collection: 'tenants', id: tenantId, overrideAccess: true, depth: 0 })
    .catch(() => null)

  // In-Brain preview: tenant is the EFFECTIVE tenant (session, or an operator's validated
  // impersonation) — never client input — and only allowlisted public fields are exposed.
  const workspace = await loadWorkspaceDto(tenantId)
  const liveUrl = await getTenantLiveUrl(tenantId)
  const connectedSites = (await listConnectedSites(tenantId)).map((s: any) => ({
    id: s.id as number,
    name: s.name as string,
    originUrl: s.originUrl as string,
    liveUrl: (s.liveUrl as string) ?? null,
    pagePaths: (Array.isArray(s.pagePaths) ? s.pagePaths : ['/']) as string[],
    cloudflareProject: (s.cloudflareProject as string) ?? '',
    repo: (s.repo as string) ?? null,
  }))

  // Which view to restore on load: a connected site if ?site=<name>-<id> matches one, the
  // block builder if ?view=builder, otherwise the defaults are decided client-side.
  const sp = await searchParams
  const siteParam = sp?.site ?? ''
  const wanted = Number(siteParam.split('-').pop())
  const initialConnectedId = connectedSites.some((s) => s.id === wanted) ? wanted : null
  const initialView = sp?.view === 'builder' ? 'builder' : null

  return (
    <UnifiedWorkspace
      userEmail={eff.user.email}
      tenantId={tenantId}
      workspace={workspace}
      initialLiveUrl={liveUrl}
      connectedSites={connectedSites}
      initialConnectedId={initialConnectedId}
      initialView={initialView}
      impersonating={eff.isImpersonating ? { tenantName: tenant?.name ?? `tenant ${tenantId}`, canEdit: eff.canEdit } : null}
      initialAllowOperatorEdit={Boolean(tenant?.allowOperatorEdit)}
    />
  )
}
