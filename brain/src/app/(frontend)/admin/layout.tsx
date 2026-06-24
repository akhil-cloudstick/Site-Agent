import { headers as nextHeaders } from 'next/headers'
import { redirect } from 'next/navigation'

import { getSessionUser } from '@/auth/session'

import { AdminProfile } from './AdminProfile'
import { NavLink } from './NavLink'

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

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', color: '#111', background: '#f8fafc' }}>
      <aside style={{ width: 220, flex: 'none', background: '#fff', borderRight: '1px solid #e2e8f0', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontWeight: 700, fontSize: 16, padding: '4px 10px 14px' }}>
          SiteAgent <span style={{ color: '#64748b', fontWeight: 400 }}>admin</span>
        </div>
        <NavLink href="/admin" label="Tenants" />
        <NavLink href="/admin/settings" label="Settings" />
        <div style={{ marginTop: 'auto', paddingTop: 14, borderTop: '1px solid #eef2f7' }}>
          <AdminProfile email={user.email} />
        </div>
      </aside>
      <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
    </div>
  )
}
