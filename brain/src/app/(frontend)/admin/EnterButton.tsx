'use client'

import { useState } from 'react'

/** Operator "Enter" — sets the impersonation cookie via /admin/impersonate then opens the
 *  tenant's workspace (view-only unless the tenant enabled operator editing). */
export function EnterButton({ tenantId, label = 'Enter →' }: { tenantId: number; label?: string }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function enter() {
    setBusy(true)
    setErr('')
    try {
      const res = await fetch('/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.ok) {
        window.location.href = data.redirect || '/workspace'
        return
      }
      setErr(data?.message || 'Could not enter that workspace.')
    } catch {
      setErr('Could not enter that workspace.')
    }
    setBusy(false)
  }

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
      <button
        onClick={enter}
        disabled={busy}
        style={{ fontSize: 13, padding: '5px 12px', borderRadius: 6, border: '1px solid #2563eb', background: '#2563eb', color: '#fff', cursor: busy ? 'default' : 'pointer', fontWeight: 600 }}
      >
        {busy ? '…' : label}
      </button>
      {err && <span style={{ fontSize: 11, color: '#dc2626' }}>{err}</span>}
    </span>
  )
}
