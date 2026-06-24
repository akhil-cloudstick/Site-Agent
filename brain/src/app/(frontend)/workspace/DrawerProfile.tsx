'use client'

import { Switch } from './WorkspaceClient'

/**
 * The account section, pinned to the bottom of the workspace drawer (it used to be the
 * top-right avatar dropdown): the signed-in email, the tenant's "Admin can edit" toggle
 * (or an operator's "Back to admin"), and Log out.
 */
export function DrawerProfile({
  userEmail,
  impersonating,
  allowEdit,
  onToggleAllowEdit,
  onSignOut,
}: {
  userEmail: string
  impersonating: boolean
  allowEdit: boolean
  onToggleAllowEdit: () => void
  onSignOut: () => void
}) {
  return (
    <div style={{ marginTop: 'auto', borderTop: '1px solid #eee', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 12, color: '#888', padding: '2px 2px 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userEmail}</div>
      {impersonating ? (
        <a
          href="/exit-impersonation?to=/admin"
          style={{ display: 'block', padding: '9px 8px', borderRadius: 8, fontSize: 13, color: '#2563eb', textDecoration: 'none' }}
        >
          ← Back to admin
        </a>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 8px' }}>
          <Switch on={allowEdit} onChange={onToggleAllowEdit} label="Admin can edit" />
        </div>
      )}
      <button
        onClick={onSignOut}
        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 8px', borderRadius: 8, fontSize: 13, border: 'none', background: 'transparent', color: '#b42318', cursor: 'pointer' }}
      >
        Log out
      </button>
    </div>
  )
}
