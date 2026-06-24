'use client'

import { useState } from 'react'

import type { ConnectedSiteSummary } from './ConnectedEditor'

const sectionHead: React.CSSProperties = {
  padding: '14px 18px 6px',
  fontSize: 12,
  color: '#9aa0aa',
  fontWeight: 500,
}

const iconWrap = (children: React.ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)
const ConnectIcon = iconWrap(<><path d="M9 15a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" /><path d="M15 9a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" /></>)
const CreateIcon = iconWrap(<><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M12 8v8M8 12h8" /></>)
const BuilderIcon = iconWrap(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></>)
const SiteIcon = iconWrap(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18" /></>)

/** A single drawer nav row — icon + label, with hover + active states (light theme). */
function Row({
  icon,
  label,
  active = false,
  disabled = false,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  const [hover, setHover] = useState(false)
  const bg = active ? '#e8eaed' : hover && !disabled ? '#f2f3f5' : 'transparent'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: 'calc(100% - 16px)',
        margin: '1px 8px',
        textAlign: 'left',
        padding: '7px 10px',
        fontSize: 13,
        borderRadius: 8,
        border: 'none',
        background: bg,
        color: active ? '#1f2430' : '#3f444c',
        fontWeight: active ? 500 : 400,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background .12s ease',
      }}
    >
      <span style={{ display: 'inline-flex', flex: 'none', color: active ? '#374151' : '#6b7280' }}>{icon}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  )
}

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
          <div style={sectionHead}>New</div>
          <Row icon={ConnectIcon} label="Connect a website" disabled={busy} onClick={onConnect} />
          <Row icon={CreateIcon} label="Create from scratch" disabled={busy} onClick={onCreate} />
        </>
      )}

      <div style={sectionHead}>History</div>
      <Row icon={BuilderIcon} label="Builder — my site" active={mode === 'block'} disabled={busy} onClick={onCreate} />
      {history.length === 0 && <div style={{ padding: '7px 18px', fontSize: 13, color: '#aaa' }}>No connected sites yet</div>}
      {history.map((s) => (
        <Row
          key={s.id}
          icon={SiteIcon}
          label={s.name}
          active={mode === 'connected' && s.id === activeConnectedId}
          disabled={busy}
          onClick={() => onOpenConnected(s.id)}
        />
      ))}
    </div>
  )
}
