'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * One themed dropdown menu for the whole app — generalizes the hand-rolled KebabMenu +
 * MenuRow so every dropdown is on the project theme, never a native menu (Codex/grill).
 * Items can be actions, links, a divider, or a custom node (e.g. a Switch row).
 */
export type MenuEntry =
  | 'divider'
  | { label: string; onClick?: () => void; href?: string; danger?: boolean }
  | { node: React.ReactNode }

function Row({ label, danger, onClick, href }: { label: string; danger?: boolean; onClick?: () => void; href?: string }) {
  const [hover, setHover] = useState(false)
  const style: React.CSSProperties = {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '7px 14px',
    fontSize: 13,
    border: 'none',
    background: hover ? '#f3f4f6' : 'transparent',
    color: danger ? '#b42318' : '#1f2937',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    textDecoration: 'none',
  }
  if (href) {
    return (
      <a href={href} style={style} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        {label}
      </a>
    )
  }
  return (
    <button style={style} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onClick={onClick}>
      {label}
    </button>
  )
}

export function Menu({
  trigger,
  items,
  align = 'right',
  minWidth = 200,
}: {
  trigger: React.ReactNode
  items: MenuEntry[]
  align?: 'left' | 'right'
  minWidth?: number
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ display: 'inline-flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        {trigger}
      </button>
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: align === 'left' ? 0 : undefined,
            right: align === 'right' ? 0 : undefined,
            minWidth,
            background: '#fff',
            borderRadius: 8,
            border: '1px solid #e5e7eb',
            boxShadow: '0 10px 28px rgba(0,0,0,0.16)',
            padding: '4px 0',
            zIndex: 50,
          }}
        >
          {items.map((it, i) => {
            if (it === 'divider') return <div key={i} style={{ borderTop: '1px solid #eee', margin: '4px 0' }} />
            if ('node' in it) return (
              <div key={i} onClick={(e) => e.stopPropagation()} style={{ padding: '6px 14px' }}>
                {it.node}
              </div>
            )
            return <Row key={i} label={it.label} danger={it.danger} href={it.href} onClick={it.onClick} />
          })}
        </div>
      )}
    </div>
  )
}
