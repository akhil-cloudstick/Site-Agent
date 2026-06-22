import { headers as nextHeaders } from 'next/headers'

import { getSessionUser, tenantIdOfUser } from '@/auth/session'
import { listConnectedSites } from '@/connected/store'
import { getTenantLiveUrl } from '@/publish/publish'
import { loadWorkspaceDto } from '@/workspace/preview'

import { LoginForm } from './LoginForm'
import { UnifiedWorkspace } from './UnifiedWorkspace'

export const dynamic = 'force-dynamic'

export default async function WorkspacePage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const reqHeaders = (await nextHeaders()) as unknown as Headers
  const user = await getSessionUser(reqHeaders)

  if (!user) return <LoginForm />

  const tenantId = tenantIdOfUser(user)
  if (!tenantId) {
    return (
      <main style={{ fontFamily: 'system-ui', padding: 40, maxWidth: 560 }}>
        <h2>No site linked to this account</h2>
        <p>
          You are signed in as <strong>{user.email}</strong>, but this account is not linked to a
          site. Operators manage sites in the admin.
        </p>
      </main>
    )
  }

  // In-Brain preview: tenant derived from the SESSION (never client input),
  // and only allowlisted public fields are exposed (a public DTO).
  const workspace = await loadWorkspaceDto(tenantId)
  const liveUrl = await getTenantLiveUrl(tenantId)
  const connectedSites = (await listConnectedSites(tenantId)).map((s: any) => ({
    id: s.id as number,
    name: s.name as string,
    originUrl: s.originUrl as string,
    liveUrl: (s.liveUrl as string) ?? null,
    pagePaths: (Array.isArray(s.pagePaths) ? s.pagePaths : ['/']) as string[],
    cloudflareProject: (s.cloudflareProject as string) ?? '',
  }))

  // Which view to open: a connected site if ?site=<name>-<id> matches one (so a refresh
  // stays on the site you were editing), otherwise the builder. We read the trailing id.
  const siteParam = (await searchParams)?.site ?? ''
  const wanted = Number(siteParam.split('-').pop())
  const initialConnectedId = connectedSites.some((s) => s.id === wanted) ? wanted : null

  return (
    <UnifiedWorkspace
      userEmail={user.email}
      workspace={workspace}
      initialLiveUrl={liveUrl}
      connectedSites={connectedSites}
      initialConnectedId={initialConnectedId}
    />
  )
}
