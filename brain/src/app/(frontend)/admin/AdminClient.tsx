'use client'

import Link from 'next/link'
import { useState } from 'react'

import type { OperatorDashboardDto } from '@/operator/dashboard'

import { EnterButton } from './EnterButton'

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  active: { bg: '#dcfce7', fg: '#166534' },
  provisioning: { bg: '#fef9c3', fg: '#854d0e' },
  suspended: { bg: '#fee2e2', fg: '#991b1b' },
  failed: { bg: '#fee2e2', fg: '#991b1b' },
}

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] ?? { bg: '#eef2ff', fg: '#3730a3' }
  return <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: c.bg, color: c.fg, fontWeight: 600 }}>{status}</span>
}

function Card({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px', minWidth: 130 }}>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#64748b' }}>{label}</div>
    </div>
  )
}

export function AdminClient({ data }: { data: OperatorDashboardDto }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      const res = await fetch('/admin/tenants/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      })
      const d = await res.json().catch(() => null)
      if (res.ok && d?.ok) {
        window.location.reload()
        return
      }
      setErr(d?.message || 'Could not create the tenant.')
    } catch {
      setErr('Could not create the tenant.')
    }
    setBusy(false)
  }

  const th: React.CSSProperties = { textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: '#94a3b8', padding: '0 12px 8px', fontWeight: 600 }
  const td: React.CSSProperties = { padding: '12px', fontSize: 14, borderTop: '1px solid #eef2f7', verticalAlign: 'middle' }

  return (
    <div style={{ padding: '24px 28px 60px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Tenants</h1>
        <button
          onClick={() => { setOpen(true); setErr('') }}
          style={{ marginLeft: 'auto', fontSize: 14, padding: '8px 16px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
        >
          + Add tenant
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 22 }}>
        <Card label="Tenants" value={data.totals.tenants} />
        <Card label="Connected sites" value={data.totals.sites} />
        <Card label="Published" value={data.totals.published} />
        <Card label="Active jobs" value={data.totals.activeJobs} />
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 8px 8px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Tenant</th>
              <th style={th}>Status</th>
              <th style={th}>Members</th>
              <th style={th}>Sites</th>
              <th style={th}>Published</th>
              <th style={th}>Jobs</th>
              <th style={th}>Edit access</th>
              <th style={{ ...th, textAlign: 'right' }}></th>
            </tr>
          </thead>
          <tbody>
            {data.tenants.length === 0 && (
              <tr><td style={td} colSpan={8}>No tenants yet. Add your first one.</td></tr>
            )}
            {data.tenants.map((t) => (
              <tr key={t.id}>
                <td style={td}>
                  <Link href={`/admin/tenants/${t.id}`} style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>{t.name}</Link>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>/{t.slug}</div>
                </td>
                <td style={td}><StatusBadge status={t.status} /></td>
                <td style={td}>{t.members}</td>
                <td style={td}>{t.sites.length}</td>
                <td style={td}>{t.sites.filter((s) => s.liveUrl).length}</td>
                <td style={td}>{t.activeJobs}</td>
                <td style={td}>{t.allowOperatorEdit ? <span style={{ color: '#166534' }}>editable</span> : <span style={{ color: '#94a3b8' }}>view-only</span>}</td>
                <td style={{ ...td, textAlign: 'right' }}><EnterButton tenantId={t.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={submit} style={{ width: 380, maxWidth: '90vw', background: '#fff', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Add a tenant</div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Site name (e.g. Acme)" autoFocus style={inp} />
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Login email" autoComplete="off" style={inp} />
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Initial password (min 8 chars)" autoComplete="new-password" style={inp} />
            {err && <div style={{ color: '#dc2626', fontSize: 13 }}>{err}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
              <button type="button" onClick={() => setOpen(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', color: '#374151', fontSize: 14, cursor: 'pointer' }}>Cancel</button>
              <button type="submit" disabled={busy} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: busy ? '#9ca3af' : '#2563eb', color: '#fff', fontSize: 14, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}>{busy ? 'Creating…' : 'Create'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }
