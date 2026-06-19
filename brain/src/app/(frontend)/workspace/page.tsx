import { headers as nextHeaders } from 'next/headers'

import { getSessionUser, tenantIdOfUser } from '@/auth/session'
import { loadPreviewDto } from '@/workspace/preview'

import { LoginForm } from './LoginForm'
import { WorkspaceClient } from './WorkspaceClient'

export const dynamic = 'force-dynamic'

export default async function WorkspacePage() {
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
  const preview = await loadPreviewDto(tenantId)

  return <WorkspaceClient userEmail={user.email} preview={preview} />
}
