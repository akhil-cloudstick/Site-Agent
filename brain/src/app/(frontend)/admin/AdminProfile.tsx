'use client'

/** Sidebar footer for the admin shell: who's signed in, a Payload CMS link, and a
 *  clearly-visible Log out button (no dropdown — it sits at the bottom of the sidebar). */
export function AdminProfile({ email }: { email: string }) {
  async function signOut() {
    await fetch('/logout', { method: 'POST' }).catch(() => {})
    window.location.href = '/'
  }
  const initial = (email?.[0] ?? '?').toUpperCase()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flex: 'none' }}>
          {initial}
        </span>
        <span style={{ fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</span>
      </div>
      <a href="/admin/payload" style={{ fontSize: 13, color: '#2563eb', textDecoration: 'none' }}>Payload CMS ↗</a>
      <button
        onClick={signOut}
        style={{ fontSize: 13, padding: '8px 12px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#b42318', cursor: 'pointer', fontWeight: 600, textAlign: 'left' }}
      >
        Log out
      </button>
    </div>
  )
}
