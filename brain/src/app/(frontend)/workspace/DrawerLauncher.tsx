'use client'

import type { ConnectedSiteSummary } from './ConnectedEditor'
import { DrawerIcons, DrawerRow, drawerSectionHead } from './DrawerRow'

/**
 * The launcher section of the workspace drawer: start a new project (builder / connect)
 * and reopen anything from history. Shared by both modes (the block builder and the
 * connected editor) so the list stays identical wherever the drawer is rendered.
 */
export function DrawerLauncher({
  mode,
  history,
  activeConnectedId,
  busy = false,
  canEdit = true,
  onCreate,
  onConnect,
  onOpenConnected,
}: {
  mode: 'block' | 'connected'
  history: ConnectedSiteSummary[]
  activeConnectedId: number | null
  busy?: boolean
  canEdit?: boolean
  onCreate: () => void
  onConnect: () => void
  onOpenConnected: (id: number) => void
}) {
  return (
    <div style={{ borderBottom: '1px solid #eee', paddingBottom: 8 }}>
      {/* Creating/connecting are writes — hidden for view-only operator impersonation. */}
      {canEdit && (
        <>
          <div style={drawerSectionHead}>New</div>
          <DrawerRow icon={DrawerIcons.connect} label="Connect a website" disabled={busy} onClick={onConnect} />
          <DrawerRow icon={DrawerIcons.create} label="Create from scratch" disabled={busy} onClick={onCreate} />
        </>
      )}

      <div style={drawerSectionHead}>History</div>
      <DrawerRow icon={DrawerIcons.builder} label="Builder — my site" active={mode === 'block'} disabled={busy} onClick={onCreate} />
      {history.length === 0 && <div style={{ padding: '7px 18px', fontSize: 13, color: '#aaa' }}>No connected sites yet</div>}
      {history.map((s) => (
        <DrawerRow
          key={s.id}
          icon={DrawerIcons.site}
          label={s.name}
          active={mode === 'connected' && s.id === activeConnectedId}
          disabled={busy}
          onClick={() => onOpenConnected(s.id)}
        />
      ))}
    </div>
  )
}
