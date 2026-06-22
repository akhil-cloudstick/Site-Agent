'use client'

import { useState } from 'react'

import { ConnectedEditor, type ConnectedSiteSummary } from './ConnectedEditor'
import { WorkspaceClient } from './WorkspaceClient'

/**
 * One workspace. A single "New ▾" launcher chooses between Connect a website (edit a
 * real existing site — content only) and Create from scratch (the block builder); the
 * History list reopens anything already connected or the builder. Both render in the
 * same shell below the top bar.
 */
export function UnifiedWorkspace({
  userEmail,
  workspace,
  initialLiveUrl,
  connectedSites,
  initialConnectedId = null,
}: {
  userEmail: string
  workspace: any
  initialLiveUrl: any
  connectedSites: ConnectedSiteSummary[]
  initialConnectedId?: number | null
}) {
  const [mode, setMode] = useState<'block' | 'connected'>(initialConnectedId ? 'connected' : 'block')
  const [menuOpen, setMenuOpen] = useState(false)
  const [history, setHistory] = useState(connectedSites)
  const [activeConnectedId, setActiveConnectedId] = useState<number | null>(initialConnectedId ?? connectedSites[0]?.id ?? null)
  const [connectSignal, setConnectSignal] = useState(0)

  // Keep ?site=<name>-<id> in the URL so a refresh reopens the same view (the readable
  // name is for you; the trailing id is what we actually use).
  function syncUrl(id: number | null) {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (id) {
      const name = history.find((s) => s.id === id)?.name ?? 'site'
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'site'
      url.searchParams.set('site', `${slug}-${id}`)
    } else {
      url.searchParams.delete('site')
    }
    window.history.replaceState(null, '', url.toString())
  }

  function openConnect() {
    setMode('connected')
    setMenuOpen(false)
    setConnectSignal((n) => n + 1)
  }
  function createNew() {
    setMode('block')
    setMenuOpen(false)
    syncUrl(null)
  }
  function openConnected(id: number) {
    setActiveConnectedId(id)
    setMode('connected')
    setMenuOpen(false)
    syncUrl(id || null)
  }
  function onConnected(site: ConnectedSiteSummary) {
    setHistory((h) => [...h, site])
    setActiveConnectedId(site.id)
    setMode('connected')
    syncUrl(site.id)
  }

  const label = mode === 'block' ? 'Builder — my site' : history.find((s) => s.id === activeConnectedId)?.name ?? 'Connect a website'

  const item: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', color: '#222' }
  const head: React.CSSProperties = { padding: '8px 12px 2px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: '#999' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, sans-serif', color: '#111' }}>
      {/* Top bar */}
      <div style={{ height: 44, flex: 'none', borderBottom: '1px solid #e2e2e2', display: 'flex', alignItems: 'center', padding: '0 12px', gap: 10, position: 'relative', background: '#fff', zIndex: 5 }}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          style={{ fontSize: 13, padding: '6px 12px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer', fontWeight: 600 }}
        >
          New ▾
        </button>
        <span style={{ fontSize: 13, color: '#555' }}>{label}</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#888' }}>{userEmail}</span>

        {menuOpen && (
          <>
            <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9 }} />
            <div style={{ position: 'absolute', top: 42, left: 12, width: 260, background: '#fff', border: '1px solid #ddd', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.12)', zIndex: 10, padding: '6px 0' }}>
              <div style={head}>New</div>
              <button style={item} onClick={openConnect}>Connect a website</button>
              <button style={item} onClick={createNew}>Create from scratch</button>
              <div style={{ borderTop: '1px solid #eee', margin: '6px 0' }} />
              <div style={head}>History</div>
              <button style={{ ...item, fontWeight: mode === 'block' ? 600 : 400 }} onClick={createNew}>Builder — my site</button>
              {history.length === 0 && <div style={{ ...item, color: '#aaa', cursor: 'default' }}>No connected sites yet</div>}
              {history.map((s) => (
                <button key={s.id} style={{ ...item, fontWeight: mode === 'connected' && s.id === activeConnectedId ? 600 : 400 }} onClick={() => openConnected(s.id)}>
                  {s.name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {mode === 'block' ? (
          <WorkspaceClient userEmail={userEmail} workspace={workspace} initialLiveUrl={initialLiveUrl} />
        ) : (
          <ConnectedEditor sites={history} activeId={activeConnectedId} onConnected={onConnected} onSelect={openConnected} openConnectSignal={connectSignal} />
        )}
      </div>
    </div>
  )
}
