'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

const btn: React.CSSProperties = { fontSize: 13, padding: '7px 12px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 600 }
const inp: React.CSSProperties = { padding: '7px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }

/** Operator controls for one tenant: plan label, suspend/resume, and permanent remove. */
export function TenantAdminPanel({ tenantId, slug, status, planLabel }: { tenantId: number; slug: string; status: string; planLabel: string | null }) {
  const router = useRouter()
  const [plan, setPlan] = useState(planLabel ?? '')
  const [savingPlan, setSavingPlan] = useState(false)
  const [busy, setBusy] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [deleteCf, setDeleteCf] = useState(false)
  const [err, setErr] = useState('')

  async function savePlan() {
    setSavingPlan(true)
    await fetch(`/admin/tenants/${tenantId}/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planLabel: plan }) }).catch(() => null)
    setSavingPlan(false)
    router.refresh()
  }

  async function setStatus(next: 'active' | 'suspended') {
    setBusy(true)
    await fetch(`/admin/tenants/${tenantId}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }) }).catch(() => null)
    setBusy(false)
    setRemoveOpen(false)
    router.refresh()
  }

  async function remove() {
    setBusy(true)
    setErr('')
    const res = await fetch(`/admin/tenants/${tenantId}/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm, deleteCloudflare: deleteCf }),
    }).catch(() => null)
    const d = await res?.json().catch(() => null)
    setBusy(false)
    if (res?.ok && d?.ok) {
      router.push('/admin')
      return
    }
    setErr(d?.message || 'Could not remove the tenant.')
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, margin: '8px 0 24px', display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
      <div>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Plan label</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="e.g. Free / Pro" style={{ ...inp, width: 160 }} />
          <button onClick={savePlan} disabled={savingPlan} style={{ ...btn, color: '#2563eb' }}>{savingPlan ? 'Saving…' : 'Save'}</button>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Account</div>
        {status === 'suspended' ? (
          <button onClick={() => setStatus('active')} disabled={busy} style={{ ...btn, color: '#166534' }}>Resume account</button>
        ) : (
          <button onClick={() => setStatus('suspended')} disabled={busy} style={{ ...btn, color: '#b45309' }}>Suspend account</button>
        )}
      </div>

      <div style={{ marginLeft: 'auto' }}>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Danger zone</div>
        <button onClick={() => { setRemoveOpen(true); setConfirm(''); setDeleteCf(false); setErr('') }} style={{ ...btn, color: '#b91c1c', borderColor: '#fecaca' }}>Remove tenant…</button>
      </div>

      {removeOpen && (
        <div onClick={() => !busy && setRemoveOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 460, maxWidth: '92vw', background: '#fff', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', padding: 22 }}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>Remove “{slug}”?</div>
            <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, marginTop: 0 }}>
              This permanently deletes the tenant's sites, pages, media, jobs and logins, plus the local site files. This cannot be undone.
              If you only want to pause access, <strong>suspend</strong> it instead.
            </p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#334155', margin: '10px 0' }}>
              <input type="checkbox" checked={deleteCf} onChange={(e) => setDeleteCf(e.target.checked)} />
              Also delete the Cloudflare project(s) — <span style={{ color: '#b91c1c' }}>takes the live site(s) down</span>
            </label>
            <div style={{ fontSize: 12, color: '#64748b', margin: '12px 0 4px' }}>Type the slug <code style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: 4 }}>{slug}</code> to confirm:</div>
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={slug} autoFocus style={{ ...inp, width: '100%' }} />
            {err && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 8 }}>{err}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 18, alignItems: 'center' }}>
              <button onClick={() => setStatus('suspended')} disabled={busy} style={{ ...btn, color: '#b45309' }}>Suspend instead</button>
              <span style={{ marginLeft: 'auto' }} />
              <button onClick={() => setRemoveOpen(false)} disabled={busy} style={btn}>Cancel</button>
              <button
                onClick={remove}
                disabled={busy || confirm !== slug}
                style={{ ...btn, border: 'none', background: busy || confirm !== slug ? '#fca5a5' : '#dc2626', color: '#fff', cursor: busy || confirm !== slug ? 'default' : 'pointer' }}
              >
                {busy ? 'Removing…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
