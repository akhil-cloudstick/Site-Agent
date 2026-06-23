'use client'

import { useEffect, useState } from 'react'

export type JobStatus = 'running' | 'cancelling' | 'done' | 'error' | 'cancelled'
export interface JobLogLine {
  text: string
  flavor: 'info' | 'ok' | 'error'
}

const isTerminal = (s: JobStatus) => s === 'done' || s === 'error' || s === 'cancelled'

/** Animated trailing dots for the active (in-progress) log line. */
function Dots() {
  const [n, setN] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setN((x) => (x + 1) % 4), 350)
    return () => clearInterval(id)
  }, [])
  return <span style={{ color: '#94a3b8' }}>{'.'.repeat(n)}</span>
}

/**
 * A progress modal for a long operation (connect / publish / delete). Blurred backdrop,
 * an honest stage-based % bar, and a small growing feed of one-line human logs where the
 * CURRENT line animates its trailing dots and finished lines freeze with a ✓ (or ✗ on
 * error). Survives a refresh because the parent re-attaches by polling the job.
 */
export function ProgressModal({
  open,
  title,
  percent,
  status,
  logs,
  error,
  onCancel,
  onClose,
}: {
  open: boolean
  title: string
  percent: number
  status: JobStatus
  logs: JobLogLine[]
  error?: string | null
  onCancel: () => void
  onClose: () => void
}) {
  if (!open) return null
  const terminal = isTerminal(status)
  const last = logs.length - 1
  // Show the last few lines so it reads as a small live feed.
  const visible = logs.slice(-4)
  const baseIndex = logs.length - visible.length
  const fillColor = status === 'error' ? '#dc2626' : status === 'cancelled' ? '#9ca3af' : '#2563eb'

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, fontFamily: 'system-ui, sans-serif' }}
    >
      <div style={{ width: 460, maxWidth: '92vw', background: '#fff', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', padding: 22 }}>
        <div style={{ fontWeight: 600, fontSize: 16, color: '#111827', marginBottom: 14 }}>{title}</div>

        {/* Progress bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1, height: 8, borderRadius: 999, background: '#e5e7eb', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, percent))}%`, background: fillColor, borderRadius: 999, transition: 'width .4s ease' }} />
          </div>
          <span style={{ fontSize: 13, color: '#475467', minWidth: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Math.round(percent)}%</span>
        </div>

        {/* Live log feed */}
        <div style={{ background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 8, padding: '10px 12px', minHeight: 70, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {visible.length === 0 && <span style={{ fontSize: 13, color: '#94a3b8' }}>Starting…</span>}
          {visible.map((l, i) => {
            const idx = baseIndex + i
            const isLast = idx === last
            // Only an unfinished (info) last line animates; an ok/error line reads as done.
            const active = isLast && !terminal && l.flavor === 'info'
            const ok = l.flavor === 'ok' || (isLast && status === 'done')
            // Only a line that itself errored is marked ✗; an overall failure is shown
            // as the red error message below the feed, leaving reached stages as ✓.
            const err = l.flavor === 'error'
            const color = err ? '#dc2626' : ok ? '#16a34a' : active ? '#1e293b' : '#94a3b8'
            const mark = err ? '✗' : ok ? '✓' : active ? '' : '✓'
            return (
              <span key={idx} style={{ fontSize: 13, color, display: 'flex', gap: 6, alignItems: 'baseline' }}>
                {mark && <span style={{ width: 12, flexShrink: 0 }}>{mark}</span>}
                <span style={{ opacity: active || isLast ? 1 : 0.7 }}>
                  {l.text}
                  {active && <Dots />}
                </span>
              </span>
            )
          })}
        </div>

        {status === 'error' && error && <div style={{ marginTop: 10, fontSize: 13, color: '#dc2626' }}>{error}</div>}

        {/* Action */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          {terminal || percent >= 100 ? (
            // Terminal, or finished (100%) but the done-status poll hasn't landed yet —
            // always give an escape so the modal can never get stuck on "Cancel".
            <button onClick={onClose} style={{ fontSize: 13, padding: '7px 18px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>
              {status === 'error' ? 'Close' : 'Done'}
            </button>
          ) : (
            <button
              onClick={onCancel}
              disabled={status === 'cancelling'}
              style={{ fontSize: 13, padding: '7px 16px', borderRadius: 6, border: '1px solid #dc2626', background: '#fff', color: '#dc2626', cursor: status === 'cancelling' ? 'default' : 'pointer', opacity: status === 'cancelling' ? 0.6 : 1 }}
            >
              {status === 'cancelling' ? 'Cancelling…' : 'Cancel'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
