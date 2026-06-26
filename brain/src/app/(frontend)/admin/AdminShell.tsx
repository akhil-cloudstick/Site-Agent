'use client'

import { useState } from 'react'

import { useIsMobile } from '../workspace/useIsMobile'
import { AdminProfile } from './AdminProfile'
import { NavLink } from './NavLink'

const links = (
  <>
    <NavLink href="/admin" label="Tenants" />
    <NavLink href="/admin/errors" label="Errors" />
    <NavLink href="/admin/settings" label="Settings" />
  </>
)

/** Operator admin shell: a fixed sidebar on desktop, a collapsing top bar on narrow screens (B2). */
export function AdminShell({ email, children }: { email: string; children: React.ReactNode }) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)

  if (isMobile) {
    return (
      <div style={{ minHeight: '100vh', fontFamily: 'system-ui, sans-serif', color: '#111', background: '#f8fafc' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#fff', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 30 }}>
          <button onClick={() => setOpen((o) => !o)} aria-label="Menu" style={{ fontSize: 20, lineHeight: 1, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}>☰</button>
          <div style={{ fontWeight: 700, fontSize: 15 }}>SiteAgent <span style={{ color: '#64748b', fontWeight: 400 }}>admin</span></div>
        </div>
        {open && (
          <div onClick={() => setOpen(false)} style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {links}
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #eef2f7' }}><AdminProfile email={email} /></div>
          </div>
        )}
        <main>{children}</main>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', color: '#111', background: '#f8fafc' }}>
      {/* Sticky full-height sidebar — stays put while the main content scrolls. */}
      <aside style={{ width: 220, flex: 'none', background: '#fff', borderRight: '1px solid #e2e8f0', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 2, position: 'sticky', top: 0, height: '100vh', alignSelf: 'flex-start', overflowY: 'auto' }}>
        <div style={{ fontWeight: 700, fontSize: 16, padding: '4px 10px 14px' }}>
          SiteAgent <span style={{ color: '#64748b', fontWeight: 400 }}>admin</span>
        </div>
        {links}
        <div style={{ marginTop: 'auto', paddingTop: 14, borderTop: '1px solid #eef2f7' }}>
          <AdminProfile email={email} />
        </div>
      </aside>
      <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
    </div>
  )
}
