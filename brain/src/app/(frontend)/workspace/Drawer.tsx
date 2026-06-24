'use client'

import { useEffect } from 'react'

/**
 * A themed left off-canvas drawer (slide-in panel with a dim backdrop). Presentational
 * only — the caller owns `open` and `onClose`. Always mounted so it can animate; when
 * closed it slides off-screen and stops receiving pointer events. Closes on backdrop
 * click and on Escape. Sits below the app's modals (z 1000) so a ProgressModal / confirm
 * dialog still overlays it.
 */
export function Drawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
}) {
  // Close on Escape while open.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <>
      {/* Backdrop — click outside to close. Plain dim (no blur, so the slide stays smooth). */}
      <div
        onClick={onClose}
        aria-hidden={!open}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15,23,42,0.42)',
          zIndex: 40,
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          willChange: 'opacity',
          transition: 'opacity .24s ease',
        }}
      />
      {/* Panel — GPU-promoted transform slide so it opens/closes smoothly. */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title ?? 'Menu'}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          height: '100vh',
          width: 320,
          maxWidth: '90vw',
          background: '#fff',
          borderRight: '1px solid #e2e2e2',
          boxShadow: '0 10px 28px rgba(0,0,0,0.16)',
          zIndex: 41,
          display: 'flex',
          flexDirection: 'column',
          transform: open ? 'translate3d(0,0,0)' : 'translate3d(-100%,0,0)',
          willChange: 'transform',
          transition: 'transform .28s cubic-bezier(.32,.72,0,1)',
          fontFamily: 'system-ui, sans-serif',
          color: '#111',
        }}
      >
        <div
          style={{
            flex: 'none',
            height: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 8px 0 14px',
            borderBottom: '1px solid #eee',
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{title ?? 'Menu'}</span>
          <button
            onClick={onClose}
            title="Close"
            aria-label="Close"
            style={{
              width: 28,
              height: 28,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 6,
              border: 'none',
              background: 'transparent',
              color: '#888',
              fontSize: 18,
              lineHeight: 1,
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>{children}</div>
      </aside>
    </>
  )
}
