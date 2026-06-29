import { headers as nextHeaders } from 'next/headers'
import { redirect } from 'next/navigation'

import { getSessionUser } from '@/auth/session'

import { AdminShell } from './AdminShell'

export const dynamic = 'force-dynamic'

/** Operator-gated admin shell — sidebar (Tenants · Settings) + content. Non-operators bounced. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const reqHeaders = (await nextHeaders()) as unknown as Headers
  const user = await getSessionUser(reqHeaders)
  if (!user) redirect('/')
  if (!user.isOperator) {
    return (
      <main style={{ fontFamily: 'system-ui, sans-serif', padding: 40, maxWidth: 560, color: '#111' }}>
        <h2>Operators only</h2>
        <p>
          You are signed in as <strong>{user.email}</strong>, but this area is for platform operators. If you
          manage a site, go to <a href="/workspace">your workspace</a>.
        </p>
      </main>
    )
  }

  return <AdminShell email={user.email}>{children}</AdminShell>
}
