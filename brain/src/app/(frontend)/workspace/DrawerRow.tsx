'use client'

import { useState } from 'react'

const svg = (children: React.ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

/** One small icon set so every drawer row reads the same. */
export const DrawerIcons = {
  connect: svg(<><path d="M9 15a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" /><path d="M15 9a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" /></>),
  create: svg(<><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M12 8v8M8 12h8" /></>),
  builder: svg(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></>),
  site: svg(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18" /></>),
  publish: svg(<><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></>),
  rollback: svg(<><path d="M9 14 4 9l5-5" /><path d="M4 9h11a6 6 0 0 1 0 12h-3" /></>),
  gitpull: svg(<><path d="M12 5v10" /><path d="m7 12 5 5 5-5" /><path d="M5 21h14" /></>),
  cloud: svg(<path d="M17.5 19a4.5 4.5 0 0 0 .5-9 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 6.5 19Z" />),
  remove: svg(<><path d="M4 7h16" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /><path d="M6 7l1 13h10l1-13" /></>),
  chevron: svg(<path d="m9 6 6 6-6 6" />),
}

/** Section header used above every group of rows (New · History · the active site). */
export const drawerSectionHead: React.CSSProperties = {
  padding: '14px 18px 6px',
  fontSize: 12,
  color: '#9aa0aa',
  fontWeight: 500,
}

type Accent = 'default' | 'success' | 'danger'

/**
 * The one and only drawer row: a compact icon + label button with hover / active
 * states, matching the reference sidebar's size in the project's light theme. Used by
 * the launcher AND every per-site action so they all read identically.
 */
export function DrawerRow({
  icon,
  label,
  onClick,
  active = false,
  disabled = false,
  accent = 'default',
  trailing,
}: {
  icon?: React.ReactNode
  label: React.ReactNode
  onClick?: () => void
  active?: boolean
  disabled?: boolean
  accent?: Accent
  trailing?: React.ReactNode
}) {
  const [hover, setHover] = useState(false)
  const text = accent === 'success' ? '#15803d' : accent === 'danger' ? '#b42318' : active ? '#1f2430' : '#3f444c'
  const iconColor = accent === 'success' ? '#16a34a' : accent === 'danger' ? '#dc2626' : active ? '#374151' : '#6b7280'
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
        padding: '8px 10px',
        fontSize: 13,
        borderRadius: 8,
        border: 'none',
        background: bg,
        color: text,
        fontWeight: active ? 500 : 400,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background .12s ease',
      }}
    >
      {icon && <span style={{ display: 'inline-flex', flex: 'none', color: iconColor }}>{icon}</span>}
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {trailing}
    </button>
  )
}
