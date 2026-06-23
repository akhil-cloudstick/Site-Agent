'use client'

import { useEffect, useRef, useState } from 'react'

import { Switch } from './WorkspaceClient'

/** Friendly label for a page route: "/" → Home, "/about" → About. */
const pageLabel = (p: string) => (p === '/' ? 'Home' : p.replace(/^\//, '').replace(/\/$/, '').split('/').pop() || p)

export interface ConnectedSiteSummary {
  id: number
  name: string
  originUrl: string
  liveUrl: string | null
  pagePaths: string[]
  cloudflareProject: string
}

const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 6, border: '1px solid #ccc', fontSize: 13 }

/**
 * Edit a CONNECTED site (a real, already-built website): multi-page preview, click /
 * chat to edit text & images, publish to the same URL. Content-only — no structural
 * controls. All edits go through Payload; the site's code is never touched.
 */
export function ConnectedEditor({
  sites: initialSites,
  activeId,
  onConnected,
  onSelect,
  openConnectSignal = 0,
}: {
  sites: ConnectedSiteSummary[]
  activeId: number | null
  onConnected: (site: ConnectedSiteSummary) => void
  onSelect: (id: number) => void
  openConnectSignal?: number
}) {
  const [sites, setSites] = useState(initialSites)
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState<{ role: 'you' | 'agent'; text: string }[]>([])
  const addMsg = (role: 'you' | 'agent', text: string) => setMessages((m) => [...m, { role, text }])
  const [input, setInput] = useState('')
  const [activePath, setActivePath] = useState('/')
  const [editMode, setEditMode] = useState(true)
  const [previewKey, setPreviewKey] = useState(0)
  const [target, setTarget] = useState<{ label: string } | null>(null) // "Edit with AI" target
  const [refImage, setRefImage] = useState<File | null>(null) // reference image for the AI
  const [cfProject, setCfProject] = useState('') // editable Cloudflare project for the active site
  const [showSettings, setShowSettings] = useState(false)
  const imgInputRef = useRef<HTMLInputElement>(null)
  const refInputRef = useRef<HTMLInputElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const chatRef = useRef<HTMLTextAreaElement>(null)
  const pendingImg = useRef<{ id: string } | null>(null)

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.onerror = reject
      r.readAsDataURL(file)
    })

  // connect form
  const [showConnect, setShowConnect] = useState(initialSites.length === 0)
  const [cName, setCName] = useState('')
  const [cUrl, setCUrl] = useState('')
  const [cProject, setCProject] = useState('')
  const [cSource, setCSource] = useState('')

  const active = sites.find((s) => s.id === activeId) ?? null

  // When the active site changes, go back to its home page (adjust state during render).
  const [prevActiveId, setPrevActiveId] = useState(activeId)
  if (activeId !== prevActiveId) {
    setPrevActiveId(activeId)
    setActivePath('/')
    setCfProject(active?.cloudflareProject ?? '')
    setShowSettings(false)
  }
  // The launcher's "Connect a website" opens the connect form.
  const [prevSignal, setPrevSignal] = useState(openConnectSignal)
  if (openConnectSignal !== prevSignal) {
    setPrevSignal(openConnectSignal)
    if (openConnectSignal > 0) setShowConnect(true)
  }

  // Receive click-to-edit events from the preview iframe (for the active page).
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (!activeId) return
      // "Edit with AI" on one item → ask what to change, route through chat with the
      // item's current text as context so the AI targets the right thing.
      const ai = (e.data as any)?.saAi
      if (ai && typeof ai.value === 'string') {
        // Like the builder: set this item as the chat target, then type in the chat.
        setTarget({ label: ai.value })
        setTimeout(() => chatRef.current?.focus(), 0)
        return
      }
      const edit = (e.data as any)?.saEdit
      if (!edit) return
      if (edit.kind === 'image') {
        pendingImg.current = { id: edit.id }
        imgInputRef.current?.click()
      } else if (edit.kind === 'text' && typeof edit.value === 'string') {
        void fetch('/workspace/connected/edit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteId: activeId, path: activePath, id: edit.id, value: edit.value }),
        })
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [activeId, activePath])

  async function onImagePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    const target = pendingImg.current
    pendingImg.current = null
    if (!file || !target || !activeId) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('siteId', String(activeId))
      fd.append('path', activePath)
      fd.append('id', target.id)
      fd.append('file', file)
      const res = await fetch('/workspace/connected/edit', { method: 'POST', body: fd })
      if ((await res.json()).ok) setPreviewKey((k) => k + 1)
    } finally {
      setBusy(false)
    }
  }

  async function connect() {
    if ((!cUrl.trim() && !cSource.trim()) || busy) return
    setBusy(true)
    addMsg('agent', 'Connecting… (building/reading the whole site)')
    try {
      const res = await fetch('/workspace/connected/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cName, originUrl: cUrl, cloudflareProject: cProject, sourcePath: cSource }),
      })
      const data = await res.json()
      if (data.ok) {
        const newSite: ConnectedSiteSummary = { id: data.siteId, name: cName || cUrl || 'New site', originUrl: cUrl, liveUrl: null, pagePaths: Array.isArray(data.pagePaths) && data.pagePaths.length ? data.pagePaths : ['/'], cloudflareProject: cProject }
        setSites((s) => [...s, newSite])
        onConnected(newSite)
        setShowConnect(false)
        setCName(''); setCUrl(''); setCProject(''); setCSource('')
        addMsg('agent', 'Connected. Loading the pages…')
      } else {
        addMsg('agent', data.message ?? 'Could not connect.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function sendChat(message: string) {
    if (!message.trim() || !activeId || busy) return
    addMsg('you', refImage ? `${message}  [+ reference image]` : message)
    setBusy(true)
    let refImageUrl: string | undefined
    try {
      if (refImage) refImageUrl = await fileToDataUrl(refImage)
    } catch {
      /* ignore a bad image */
    }
    setRefImage(null)
    try {
      const res = await fetch('/workspace/connected/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: activeId, path: activePath, message, refImage: refImageUrl }),
      })
      const data = await res.json()
      addMsg('agent', data.message ?? 'Done.')
      if (data.ok && data.count > 0) setPreviewKey((k) => k + 1)
    } finally {
      setBusy(false)
    }
  }

  function send() {
    const message = input.trim()
    if (!message) return
    setInput('')
    if (chatRef.current) chatRef.current.style.height = 'auto'
    const full = target ? `For the text "${target.label}", ${message}` : message
    setTarget(null)
    void sendChat(full)
  }

  // Keep the active page in sync with whatever the preview is actually showing (covers
  // links clicked inside the site), so toggling Edit mode stays on the current page.
  function onIframeLoad() {
    try {
      const p = iframeRef.current?.contentWindow?.location?.pathname ?? ''
      const prefix = `/connected/${active?.id}`
      if (!p.startsWith(prefix)) return
      let route = p.slice(prefix.length) || '/'
      if (route !== '/' && route.endsWith('/')) route = route.slice(0, -1)
      if (route && route !== activePath) setActivePath(route)
    } catch {
      /* cross-origin or not ready — ignore */
    }
    // Reflect the current edit-mode state on the freshly loaded page.
    postEditMode(editMode)
  }

  async function publish(rollback = false) {
    if (!activeId || busy) return
    setBusy(true)
    addMsg('agent', rollback ? 'Rolling back…' : 'Publishing the whole site…')
    try {
      const res = await fetch('/workspace/connected/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: activeId, rollback }),
      })
      const data = await res.json()
      if (data.ok) {
        setSites((s) => s.map((x) => (x.id === activeId ? { ...x, liveUrl: data.url } : x)))
        addMsg('agent', rollback ? 'Rolled back and republished.' : 'Published — your site is live.')
      } else {
        addMsg('agent', data.message ?? 'Publish failed.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function saveSettings() {
    if (!activeId || busy) return
    setBusy(true)
    try {
      const res = await fetch('/workspace/connected/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: activeId, cloudflareProject: cfProject }),
      })
      if ((await res.json()).ok) {
        setSites((s) => s.map((x) => (x.id === activeId ? { ...x, cloudflareProject: cfProject } : x)))
        addMsg('agent', `Cloudflare project saved${cfProject ? `: ${cfProject}` : ''}.`)
        setShowSettings(false)
      }
    } finally {
      setBusy(false)
    }
  }

  async function undo() {
    if (!activeId || busy) return
    setBusy(true)
    try {
      const res = await fetch('/workspace/connected/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: activeId }),
      })
      const data = await res.json()
      if (data.ok && data.undone) setPreviewKey((k) => k + 1)
      else if (data.ok) addMsg('agent', 'Nothing left to undo.')
    } finally {
      setBusy(false)
    }
  }

  async function removeSite(id: number, name: string) {
    if (busy || !window.confirm(`Remove “${name}” from SiteAgent? This does not change the live website.`)) return
    setBusy(true)
    try {
      const res = await fetch('/workspace/connected/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: id }),
      })
      if ((await res.json()).ok) {
        setSites((s) => s.filter((x) => x.id !== id))
        if (id === activeId) onSelect(0) // clear selection
      }
    } finally {
      setBusy(false)
    }
  }

  function postEditMode(on: boolean) {
    iframeRef.current?.contentWindow?.postMessage({ saEditMode: on }, '*')
  }
  function toggleEdit() {
    setEditMode((v) => {
      postEditMode(!v)
      return !v
    })
  }

  const btn: React.CSSProperties = { fontSize: 13, padding: '6px 12px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: busy ? 'default' : 'pointer' }
  const pages = active?.pagePaths?.length ? active.pagePaths : ['/']
  // The editor is always present; edit mode is toggled by message (no reload). The ?r
  // token forces a reload only when we need to show a saved image/chat/undo change.
  const previewSrc = active ? `/connected/${active.id}${activePath === '/' ? '/' : activePath}?r=${previewKey}` : ''

  return (
    <div style={{ display: 'flex', height: '100%', fontFamily: 'system-ui, sans-serif', color: '#111' }}>
      {/* Left panel */}
      <div style={{ width: 360, minWidth: 300, borderRight: '1px solid #e2e2e2', display: 'flex', flexDirection: 'column', background: '#fafafa' }}>
        <div style={{ padding: 12, display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: '1px solid #eee' }}>
          {sites.map((s) => {
            const on = s.id === activeId
            return (
              <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 6, border: '1px solid ' + (on ? '#2563eb' : '#ccc'), background: on ? '#2563eb' : '#fff', overflow: 'hidden' }}>
                <button onClick={() => onSelect(s.id)} style={{ fontSize: 13, padding: '6px 10px', border: 'none', background: 'transparent', cursor: busy ? 'default' : 'pointer', color: on ? '#fff' : '#333' }}>{s.name}</button>
                <button onClick={() => removeSite(s.id, s.name)} disabled={busy} title={`Remove “${s.name}”`} style={{ fontSize: 12, lineHeight: 1, padding: '6px 7px', border: 'none', borderLeft: '1px solid ' + (on ? 'rgba(255,255,255,0.4)' : '#e0e0e0'), background: 'transparent', cursor: busy ? 'default' : 'pointer', color: on ? '#fff' : '#999' }}>×</button>
              </span>
            )
          })}
          <button onClick={() => setShowConnect((v) => !v)} style={{ ...btn, borderStyle: 'dashed' }}>+ Connect a website</button>
        </div>

        {showConnect && (
          <div style={{ padding: 14, borderBottom: '1px solid #eee', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Name (e.g. Acme)" style={inp} />
            <input value={cSource} onChange={(e) => setCSource(e.target.value)} placeholder="GitHub repo URL, or a folder path on this machine" style={inp} />
            <input value={cUrl} onChange={(e) => setCUrl(e.target.value)} placeholder="Live address (optional — leave blank if not deployed yet)" style={inp} />
            <input value={cProject} onChange={(e) => setCProject(e.target.value)} placeholder="Cloudflare project (needed to publish)" style={inp} />
            <button onClick={connect} disabled={busy} style={{ ...btn, background: '#2563eb', color: '#fff', borderColor: '#2563eb' }}>Connect</button>
            <span style={{ fontSize: 11, color: '#888' }}>Give a GitHub repo (we clone + build it), or a built-site/repo folder on this machine. Not deployed yet? Leave the live address blank — Publish will create the Cloudflare site and fill it in.</span>
          </div>
        )}

        {active && (
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #eee', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => publish(false)} disabled={busy} style={{ ...btn, background: busy ? '#9ca3af' : '#16a34a', color: '#fff', border: 'none', fontWeight: 600 }}>Publish</button>
            <button onClick={undo} disabled={busy} title="Undo the last edit" style={btn}>↶ Undo</button>
            <button onClick={() => publish(true)} disabled={busy} title="Restore the previously published version" style={btn}>Roll back</button>
            <button onClick={() => setShowSettings((v) => !v)} disabled={busy} title="Cloudflare settings" style={btn}>⚙</button>
            {active.liveUrl && <a href={active.liveUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#16a34a' }}>View live ↗</a>}
          </div>
        )}

        {active && (showSettings || !active.cloudflareProject) && (
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #eee', display: 'flex', flexDirection: 'column', gap: 6, background: '#fff' }}>
            <span style={{ fontSize: 12, color: '#555' }}>Cloudflare project {active.cloudflareProject ? '' : '(needed to publish)'}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={cfProject} onChange={(e) => setCfProject(e.target.value)} placeholder="cloudflare-project-name" style={{ ...inp, flex: 1 }} />
              <button onClick={saveSettings} disabled={busy} style={{ ...btn, background: '#2563eb', color: '#fff', borderColor: '#2563eb' }}>Save</button>
            </div>
          </div>
        )}

        {/* Conversation (same bubble style as the builder) */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.length === 0 && active && (
            <p style={{ color: '#888', fontSize: 13 }}>With Edit mode on, click any text or image in the preview to change it — or describe a change below. Text &amp; images only.</p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                alignSelf: m.role === 'you' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                padding: '8px 12px',
                borderRadius: 12,
                background: m.role === 'you' ? '#2563eb' : '#fff',
                color: m.role === 'you' ? '#fff' : '#111',
                border: m.role === 'you' ? 'none' : '1px solid #e2e2e2',
                fontSize: 14,
                whiteSpace: 'pre-wrap',
              }}
            >
              {m.text}
            </div>
          ))}
        </div>

        {active && target && (
          <div style={{ padding: '8px 12px 0', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#1e40af' }}>
            <span>Editing &ldquo;<strong>{target.label}</strong>&rdquo; — your next message applies here</span>
            <button onClick={() => setTarget(null)} title="Clear" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#888' }}>✕</button>
          </div>
        )}
        {active && refImage && (
          <div style={{ padding: '8px 12px 0', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#555' }}>
            <span>Reference image for the AI: <strong>{refImage.name || 'pasted image'}</strong></span>
            <button onClick={() => setRefImage(null)} title="Remove" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#888' }}>✕</button>
          </div>
        )}

        {active && (
          <div style={{ padding: 12, borderTop: '1px solid #e2e2e2' }}>
            <input ref={refInputRef} type="file" accept="image/*" onChange={(e) => { setRefImage(e.target.files?.[0] ?? null); e.target.value = '' }} style={{ display: 'none' }} />
            <div style={{ border: '1px solid #ccc', borderRadius: 12, padding: 8, background: '#fff', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <textarea
                ref={chatRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                  const t = e.target
                  t.style.height = 'auto'
                  t.style.height = Math.min(t.scrollHeight, 160) + 'px'
                  t.style.overflowY = t.scrollHeight > 160 ? 'auto' : 'hidden'
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send()
                  }
                }}
                onPaste={(e) => {
                  const img = Array.from(e.clipboardData?.items ?? []).find((it) => it.type.startsWith('image/'))
                  const file = img?.getAsFile()
                  if (file) { setRefImage(file); e.preventDefault() }
                }}
                rows={1}
                placeholder="Describe a change… (paste or attach a reference image)"
                disabled={busy}
                style={{ width: '100%', padding: '4px 6px', border: 'none', outline: 'none', fontSize: 14, resize: 'none', fontFamily: 'inherit', lineHeight: 1.4, maxHeight: 160, overflowY: 'hidden', background: 'transparent', boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <button
                  onClick={() => refInputRef.current?.click()}
                  disabled={busy}
                  title="Attach a reference image (or paste one with Ctrl+V)"
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e2e2', background: refImage ? '#eef2ff' : '#fff', color: refImage ? '#2563eb' : '#475467', cursor: busy ? 'default' : 'pointer' }}
                >
                  📎
                </button>
                <button onClick={send} disabled={busy} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: busy ? '#9ca3af' : '#2563eb', color: '#fff', fontSize: 14, cursor: busy ? 'default' : 'pointer' }}>
                  {busy ? '…' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Preview — same chrome as the builder: page tabs + edit-mode toggle, then address bar */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff' }}>
        {active ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: '8px 12px', borderBottom: '1px solid #eee' }}>
              {pages.map((p) => {
                const on = p === activePath
                return (
                  <button key={p} onClick={() => { setActivePath(p); setPreviewKey((k) => k + 1) }} disabled={busy} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid ' + (on ? '#2563eb' : '#ccc'), background: on ? '#2563eb' : '#fff', color: on ? '#fff' : '#333', cursor: busy ? 'default' : 'pointer' }}>{pageLabel(p)}</button>
                )
              })}
              <span style={{ marginLeft: 'auto' }}>
                <Switch on={editMode} onChange={toggleEdit} label="Edit mode" />
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderBottom: '1px solid #eee', background: '#f6f6f6' }}>
              <span style={{ flex: 1, fontSize: 12, color: '#777', background: '#fff', border: '1px solid #e0e0e0', borderRadius: 14, padding: '4px 12px' }}>
                {active.originUrl && !active.originUrl.startsWith('pending:') ? active.originUrl.replace(/^https?:\/\//, '') : 'yoursite.com'}
                <strong style={{ color: '#111' }}>{activePath === '/' ? '/' : activePath}</strong>
              </span>
              <span style={{ fontSize: 11, color: '#aaa' }}>{editMode ? 'draft · click text to edit' : 'draft · preview'}</span>
            </div>
            <iframe ref={iframeRef} key={active.id} src={previewSrc} onLoad={onIframeLoad} title="preview" style={{ flex: 1, border: 'none', width: '100%', background: 'transparent' }} sandbox="allow-same-origin allow-scripts" />
          </>
        ) : (
          <p style={{ padding: 48, color: '#888' }}>Connect a website to start.</p>
        )}
      </div>

      <input ref={imgInputRef} type="file" accept="image/*" onChange={onImagePicked} style={{ display: 'none' }} />
    </div>
  )
}
