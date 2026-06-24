'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

interface AvailableModel {
  id: string
  name: string
}

export function SettingsClient({ models: initialModels, keySet }: { models: string[]; keySet: boolean }) {
  const [models, setModels] = useState<string[]>(initialModels.length ? initialModels : [])
  const [available, setAvailable] = useState<AvailableModel[]>([])
  const [loadingModels, setLoadingModels] = useState(true)
  const [modelsError, setModelsError] = useState('')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch('/admin/settings/models')
        const d = await res.json().catch(() => null)
        if (!alive) return
        if (res.ok && d?.ok) setAvailable(d.models)
        else setModelsError(d?.message || 'Could not load the model list.')
      } catch {
        if (alive) setModelsError('Could not load the model list.')
      } finally {
        if (alive) setLoadingModels(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // Close the dropdown on an outside click.
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  function addModel(id: string) {
    if (id && !models.includes(id)) setModels([...models, id])
    setQuery('')
    setOpen(false)
  }

  // Real available models, minus the ones already chosen, filtered by the search box.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pool = available.filter((m) => !models.includes(m.id))
    const matched = q ? pool.filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)) : pool
    return matched.slice(0, 80)
  }, [available, models, query])

  async function save() {
    setBusy(true)
    setMsg('')
    setErr('')
    try {
      const res = await fetch('/admin/settings/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'openrouter', models, apiKey }),
      })
      const d = await res.json().catch(() => null)
      if (res.ok && d?.ok) {
        setMsg('Saved.')
        setApiKey('')
      } else setErr(d?.message || 'Could not save.')
    } catch {
      setErr('Could not save.')
    }
    setBusy(false)
  }

  const label: React.CSSProperties = { fontSize: 13, color: '#475569', marginBottom: 6, fontWeight: 600 }

  return (
    <div style={{ padding: '32px 24px 60px', maxWidth: 560, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, margin: '0 0 18px', textAlign: 'center' }}>Settings</h1>

      <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>AI agent</div>

        {/* 1 — Provider */}
        <div>
          <div style={label}>Provider</div>
          <div style={{ fontSize: 14 }}>OpenRouter</div>
        </div>

        {/* 2 — API key */}
        <div>
          <div style={label}>API key {keySet && <span style={{ color: '#166534', fontWeight: 400 }}>— set ✓</span>}</div>
          <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" placeholder={keySet ? 'Enter a new key to replace' : 'OpenRouter API key (sk-or-…)'} autoComplete="off" style={inp} />
        </div>

        {/* 3 — Models (chosen list, then a + Add model dropdown) */}
        <div>
          <div style={label}>Models</div>

          {/* Chosen models — appear above the Add button */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {models.map((m, i) => (
              <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc' }}>
                <span style={{ color: '#94a3b8', width: 16 }}>{i + 1}.</span>
                <span style={{ flex: 1 }}>{m}</span>
                <button onClick={() => setModels(models.filter((x) => x !== m))} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 999, border: '1px solid #fecaca', background: '#fff', color: '#b42318', cursor: 'pointer' }}>remove</button>
              </div>
            ))}
          </div>

          {/* + Add model — opens a dropdown with the real available models */}
          <div ref={pickerRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setOpen((o) => !o)}
              disabled={loadingModels || !!modelsError}
              style={{ display: 'inline-flex', alignItems: 'center', fontSize: 13, padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: loadingModels || modelsError ? '#94a3b8' : '#334155', fontWeight: 600, cursor: loadingModels || modelsError ? 'default' : 'pointer' }}
            >
              {loadingModels ? 'Loading models…' : '+ Add model ▾'}
            </button>
            {modelsError && <div style={{ fontSize: 12, color: '#dc2626', marginTop: 6 }}>{modelsError}</div>}

            {open && !loadingModels && !modelsError && (
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, width: 360, maxWidth: '90vw', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 12px 30px rgba(0,0,0,0.16)', zIndex: 50, overflow: 'hidden' }}>
                <div style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search models…"
                    autoFocus
                    style={{ ...inp, padding: '8px 10px' }}
                  />
                </div>
                <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                  {results.length === 0 && <div style={{ padding: '10px 12px', fontSize: 13, color: '#94a3b8' }}>No matching models.</div>}
                  {results.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => addModel(m.id)}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13, border: 'none', borderBottom: '1px solid #f6f7f9', background: '#fff', cursor: 'pointer' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#f3f4f6')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
                    >
                      <span style={{ color: '#1f2937' }}>{m.id}</span>
                      {m.name && m.name !== m.id && <span style={{ color: '#94a3b8' }}> — {m.name}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {msg && <div style={{ color: '#166534', fontSize: 13 }}>{msg}</div>}
        {err && <div style={{ color: '#dc2626', fontSize: 13 }}>{err}</div>}

        <div>
          <button onClick={save} disabled={busy} style={{ width: '100%', padding: '10px 18px', borderRadius: 8, border: 'none', background: busy ? '#9ca3af' : '#2563eb', color: '#fff', fontSize: 14, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </section>
    </div>
  )
}

const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }
