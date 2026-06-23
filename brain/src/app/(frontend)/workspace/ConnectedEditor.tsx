'use client'

import { useEffect, useRef, useState } from 'react'

import { ProgressModal, type JobLogLine, type JobStatus } from './ProgressModal'
import { Switch } from './WorkspaceClient'

type JobType = 'connect' | 'publish' | 'delete'
const SKELETON = '__skeleton__'
const CHAT_STAGES = ['Reading the page…', 'Asking the model…', 'Applying the change…']

/** A shimmering placeholder reply, shown while the AI works (with a cycling status). */
function SkeletonReply() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setI((x) => Math.min(x + 1, CHAT_STAGES.length - 1)), 1400)
    return () => clearInterval(id)
  }, [])
  return (
    <div style={{ alignSelf: 'flex-start', maxWidth: '85%', padding: '10px 12px', borderRadius: 12, background: '#fff', border: '1px solid #e2e2e2', minWidth: 180 }}>
      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>{CHAT_STAGES[i]}</div>
      {[92, 78, 64].map((w, k) => (
        <div key={k} style={{ height: 9, width: `${w}%`, borderRadius: 6, marginBottom: k === 2 ? 0 : 7, background: 'linear-gradient(90deg,#eceff3 25%,#f6f8fa 37%,#eceff3 63%)', backgroundSize: '400% 100%', animation: 'saShimmer 1.4s ease infinite' }} />
      ))}
    </div>
  )
}

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
  // A long operation (connect/publish/delete) shown in the progress modal. The modal
  // overlays + blocks the page; progress is polled from the server so it survives a refresh.
  const [job, setJob] = useState<{ id: number; type: JobType; title: string; siteId?: number; name?: string; originUrl?: string; cloudflareProject?: string; rollback?: boolean } | null>(null)
  const [jp, setJp] = useState<{ percent: number; status: JobStatus; logs: JobLogLine[]; error?: string | null; result?: any }>({ percent: 0, status: 'running', logs: [] })
  const jobHandled = useRef(false)
  const [confirmRemove, setConfirmRemove] = useState<{ id: number; name: string } | null>(null)

  const startJobModal = (j: NonNullable<typeof job>) => {
    jobHandled.current = false
    setJp({ percent: 0, status: 'running', logs: [] })
    setJob(j)
  }
  const closeJob = () => setJob(null)
  const [messages, setMessages] = useState<{ role: 'you' | 'agent'; text: string }[]>([])
  const addMsg = (role: 'you' | 'agent', text: string) => setMessages((m) => [...m, { role, text }])
  const [input, setInput] = useState('')
  const [activePath, setActivePath] = useState('/')
  const [editMode, setEditMode] = useState(true)
  const [target, setTarget] = useState<{ label: string } | null>(null) // "Edit with AI" target
  const [refImage, setRefImage] = useState<File | null>(null) // reference image for the AI
  const [cfProject, setCfProject] = useState('') // editable Cloudflare project for the active site
  const [showSettings, setShowSettings] = useState(false)
  const imgInputRef = useRef<HTMLInputElement>(null)
  const refInputRef = useRef<HTMLInputElement>(null)
  // Keep-alive preview: one iframe per VISITED page, kept mounted so switching back is
  // instant (no refetch). The visible page is `shownPath`; when switching to a page that
  // isn't loaded yet we keep the old one showing until the new one paints (no flash).
  const [mounted, setMounted] = useState<string[]>(['/']) // paths that have an iframe
  const [shownPath, setShownPath] = useState('') // page currently painted/visible
  const [reload, setReload] = useState<Record<string, number>>({}) // per-page refresh token
  const frameRefs = useRef<Record<string, HTMLIFrameElement | null>>({})
  const loadedRef = useRef<Set<string>>(new Set()) // srcs that have finished loading
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
  // Per-page preview URL. The ?r token forces a fresh load only when we need to show a
  // saved image / chat / undo change for that page.
  const srcFor = (p: string) => (active ? `/connected/${active.id}${p === '/' ? '/' : p}?r=${reload[p] ?? 0}` : '')
  const bumpReload = (p: string) => setReload((r) => ({ ...r, [p]: (r[p] ?? 0) + 1 }))
  // Refresh several pages at once (a shared footer/nav/logo edit changes every page it
  // appears on). Background iframes reload immediately; not-yet-visited pages pick up the
  // new token when opened — so a shared edit shows everywhere without a manual refresh.
  const bumpPaths = (paths: string[], exclude?: string) =>
    setReload((r) => {
      const next = { ...r }
      for (const p of paths) if (p !== exclude) next[p] = (next[p] ?? 0) + 1
      return next
    })

  // When the active site changes, go back to its home page and reset the preview cache
  // (the mounted iframes belong to the previous site). Adjust state during render.
  const [prevActiveId, setPrevActiveId] = useState(activeId)
  if (activeId !== prevActiveId) {
    setPrevActiveId(activeId)
    setActivePath('/')
    setMounted(['/'])
    setShownPath('')
    setCfProject(active?.cloudflareProject ?? '')
    setShowSettings(false)
  }
  // Reset the preview load-cache when the active site changes (refs must be mutated
  // outside render). Stale entries are site-id-prefixed, so this is just housekeeping.
  useEffect(() => {
    loadedRef.current = new Set()
  }, [activeId])
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
      // A link clicked inside the preview → switch pages via the smooth crossfade
      // (the iframe never reloads itself, so no white flash).
      const nav = (e.data as any)?.saNav
      if (typeof nav === 'string') {
        const prefix = `/connected/${activeId}`
        if (nav.startsWith(prefix)) {
          let route = nav.slice(prefix.length) || '/'
          if (route !== '/' && route.endsWith('/')) route = route.slice(0, -1)
          setActivePath(route)
        }
        return
      }
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
          .then((r) => r.json())
          .then((data) => {
            // The current page already shows the inline edit; refresh OTHER pages a shared
            // component appears on so the change shows there too (no manual reload).
            if (data?.ok && Array.isArray(data.paths)) bumpPaths(data.paths, activePath)
          })
          .catch(() => {})
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [activeId, activePath])

  // Apply a finished job to the UI. Only `done` mutates state + auto-closes; `error` /
  // `cancelled` leave the modal open so the user reads the message (then clicks Close).
  function handleJobTerminal(jb: NonNullable<typeof job>, j: any) {
    if (j.status !== 'done') return
    if (jb.type === 'connect' && jb.siteId) {
      const pagePaths = Array.isArray(j.result?.pagePaths) && j.result.pagePaths.length ? j.result.pagePaths : ['/']
      const ns: ConnectedSiteSummary = { id: jb.siteId, name: jb.name || 'New site', originUrl: jb.originUrl || '', liveUrl: null, pagePaths, cloudflareProject: jb.cloudflareProject || '' }
      setSites((s) => (s.some((x) => x.id === ns.id) ? s.map((x) => (x.id === ns.id ? ns : x)) : [...s, ns]))
      onConnected(ns)
      setShowConnect(false)
      setCName(''); setCUrl(''); setCProject(''); setCSource('')
    } else if (jb.type === 'publish' && jb.siteId) {
      if (j.result?.url) setSites((s) => s.map((x) => (x.id === jb.siteId ? { ...x, liveUrl: j.result.url } : x)))
      addMsg('agent', jb.rollback ? 'Rolled back and republished.' : 'Published — your site is live.')
    } else if (jb.type === 'delete' && jb.siteId) {
      setSites((s) => s.filter((x) => x.id !== jb.siteId))
      if (jb.siteId === activeId) onSelect(0)
    }
    setTimeout(() => setJob(null), 600) // let the 100% ✓ show briefly, then close
  }

  // Poll the active job for progress (≈700ms). Survives a refresh: the modal is re-opened
  // by the re-attach effect below, then this resumes polling the same job id.
  useEffect(() => {
    if (!job) return
    let alive = true
    const poll = async () => {
      try {
        const res = await fetch(`/workspace/connected/job?id=${job.id}`)
        const j = (await res.json())?.job
        if (!alive || !j) return
        setJp({ percent: j.percent ?? 0, status: j.status, logs: Array.isArray(j.logs) ? j.logs.map((l: any) => ({ text: l.text, flavor: l.flavor })) : [], error: j.error, result: j.result })
        if ((j.status === 'done' || j.status === 'error' || j.status === 'cancelled') && !jobHandled.current) {
          jobHandled.current = true
          handleJobTerminal(job, j)
        }
      } catch {
        /* transient — keep polling */
      }
    }
    void poll()
    const id = setInterval(poll, 700)
    return () => { alive = false; clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id])

  async function cancelJob() {
    if (!job) return
    setJp((p) => ({ ...p, status: 'cancelling' }))
    await fetch('/workspace/connected/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId: job.id }) }).catch(() => {})
  }

  // Re-attach to an in-flight job for the active site after a page refresh.
  useEffect(() => {
    if (!activeId || job) return
    let alive = true
    void (async () => {
      try {
        const res = await fetch(`/workspace/connected/job?siteId=${activeId}`)
        const j = (await res.json())?.job
        if (!alive || !j) return
        const titles: Record<JobType, string> = { connect: 'Connecting…', publish: 'Publishing your site…', delete: 'Removing…' }
        const site = sites.find((s) => s.id === activeId)
        startJobModal({ id: j.id, type: j.type, title: titles[j.type as JobType] ?? 'Working…', siteId: activeId, name: site?.name, originUrl: site?.originUrl ?? undefined, cloudflareProject: site?.cloudflareProject })
      } catch {
        /* ignore */
      }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId])

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
      const data = await res.json()
      if (data.ok) bumpPaths(Array.isArray(data.paths) && data.paths.length ? data.paths : [activePath])
    } finally {
      setBusy(false)
    }
  }

  async function connect() {
    if ((!cUrl.trim() && !cSource.trim()) || busy || job) return
    setBusy(true)
    try {
      const res = await fetch('/workspace/connected/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cName, originUrl: cUrl, cloudflareProject: cProject, sourcePath: cSource }),
      })
      const data = await res.json()
      if (data.jobId) {
        // Slow folder/repo connect → track progress in the modal; the site is added on done.
        startJobModal({ id: data.jobId, type: 'connect', title: `Connecting ${cName || cUrl || 'the site'}`, siteId: data.siteId, name: cName || cUrl || 'New site', originUrl: cUrl, cloudflareProject: cProject })
      } else if (data.ok) {
        // Fast URL-only connect completed synchronously.
        const newSite: ConnectedSiteSummary = { id: data.siteId, name: cName || cUrl || 'New site', originUrl: cUrl, liveUrl: null, pagePaths: Array.isArray(data.pagePaths) && data.pagePaths.length ? data.pagePaths : ['/'], cloudflareProject: cProject }
        setSites((s) => [...s, newSite])
        onConnected(newSite)
        setShowConnect(false)
        setCName(''); setCUrl(''); setCProject(''); setCSource('')
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
    addMsg('agent', SKELETON) // shimmering placeholder reply
    setBusy(true)
    let refImageUrl: string | undefined
    try {
      if (refImage) refImageUrl = await fileToDataUrl(refImage)
    } catch {
      /* ignore a bad image */
    }
    setRefImage(null)
    // Replace the most recent skeleton placeholder with the given text.
    const replaceSkeleton = (text: string) =>
      setMessages((m) => {
        const c = [...m]
        const idx = c.map((x) => x.text).lastIndexOf(SKELETON)
        if (idx >= 0) c[idx] = { role: 'agent', text }
        else c.push({ role: 'agent', text })
        return c
      })
    try {
      const res = await fetch('/workspace/connected/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: activeId, path: activePath, message, refImage: refImageUrl }),
      })
      const data = await res.json()
      replaceSkeleton(data.message ?? 'Done.')
      if (data.ok && data.count > 0) bumpPaths(Array.isArray(data.paths) && data.paths.length ? data.paths : [activePath])
    } catch {
      replaceSkeleton('Something went wrong. Please try again.')
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

  // When the target page changes: ensure it has a (kept-alive) iframe, and if it's
  // already loaded show it instantly. If not, leave the previous page visible until the
  // new one finishes painting (handled in handleLoad) — so there's no white flash.
  useEffect(() => {
    if (!active || !activePath) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted((m) => (m.includes(activePath) ? m : [...m, activePath]))
    if (loadedRef.current.has(srcFor(activePath))) setShownPath(activePath)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath, activeId, reload])

  // When a page's iframe finishes loading: mark it loaded, reveal it if it's the page we
  // want to show (crossfade in), and reflect the current edit-mode state.
  function handleLoad(p: string) {
    loadedRef.current.add(srcFor(p))
    if (p === activePath) setShownPath(p)
    frameRefs.current[p]?.contentWindow?.postMessage({ saEditMode: editMode }, '*')
  }

  async function publish(rollback = false) {
    if (!activeId || busy || job) return
    setBusy(true)
    try {
      const res = await fetch('/workspace/connected/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: activeId, rollback }),
      })
      const data = await res.json()
      if (data.jobId) startJobModal({ id: data.jobId, type: 'publish', title: rollback ? 'Rolling back' : 'Publishing your site', siteId: activeId, rollback })
      else if (!data.ok) addMsg('agent', data.message ?? 'Publish failed.')
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
      if (data.ok && data.undone) bumpReload(activePath)
      else if (data.ok) addMsg('agent', 'Nothing left to undo.')
    } finally {
      setBusy(false)
    }
  }

  function removeSite(id: number, name: string) {
    if (busy || job) return
    setConfirmRemove({ id, name }) // themed confirm (replaces the native window.confirm)
  }

  async function doRemove() {
    const r = confirmRemove
    setConfirmRemove(null)
    if (!r) return
    setBusy(true)
    try {
      const res = await fetch('/workspace/connected/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: r.id }),
      })
      const data = await res.json()
      if (data.jobId) startJobModal({ id: data.jobId, type: 'delete', title: `Removing “${r.name}”`, siteId: r.id })
    } finally {
      setBusy(false)
    }
  }

  function postEditMode(on: boolean) {
    // Broadcast to every kept-alive page so backgrounded ones don't show stale edit state.
    Object.values(frameRefs.current).forEach((el) => el?.contentWindow?.postMessage({ saEditMode: on }, '*'))
  }
  function toggleEdit() {
    setEditMode((v) => {
      postEditMode(!v)
      return !v
    })
  }

  const btn: React.CSSProperties = { fontSize: 13, padding: '6px 12px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: busy ? 'default' : 'pointer' }
  const pages = active?.pagePaths?.length ? active.pagePaths : ['/']

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

        {/* Live URL — pinned at the top of the chat once the site has been published. */}
        {active?.liveUrl && (
          <div style={{ padding: '8px 14px', borderBottom: '1px solid #eee', background: '#f0fdf4', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, minWidth: 0 }}>
            <span style={{ color: '#16a34a', fontWeight: 600, whiteSpace: 'nowrap' }}>● Live</span>
            <a href={active.liveUrl} target="_blank" rel="noreferrer" title={active.liveUrl} style={{ color: '#15803d', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {active.liveUrl.replace(/^https?:\/\//, '')} ↗
            </a>
          </div>
        )}

        {/* Conversation (same bubble style as the builder) */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.length === 0 && active && (
            <p style={{ color: '#888', fontSize: 13 }}>With Edit mode on, click any text or image in the preview to change it — or describe a change below. Text &amp; images only.</p>
          )}
          {messages.map((m, i) =>
            m.text === SKELETON ? (
              <SkeletonReply key={i} />
            ) : (
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
            ),
          )}
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
                  <button key={p} onClick={() => setActivePath(p)} disabled={busy} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid ' + (on ? '#2563eb' : '#ccc'), background: on ? '#2563eb' : '#fff', color: on ? '#fff' : '#333', cursor: busy ? 'default' : 'pointer' }}>{pageLabel(p)}</button>
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
            <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
              {mounted.map((p) => {
                const visible = p === shownPath
                return (
                  <iframe
                    key={p}
                    ref={(el) => { frameRefs.current[p] = el }}
                    src={srcFor(p)}
                    onLoad={() => handleLoad(p)}
                    title="preview"
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', background: 'transparent', opacity: visible ? 1 : 0, transition: 'opacity .15s ease', pointerEvents: visible ? 'auto' : 'none' }}
                    sandbox="allow-same-origin allow-scripts"
                  />
                )
              })}
            </div>
          </>
        ) : (
          <p style={{ padding: 48, color: '#888' }}>Connect a website to start.</p>
        )}
      </div>

      <input ref={imgInputRef} type="file" accept="image/*" onChange={onImagePicked} style={{ display: 'none' }} />

      {/* Shimmer animation for the skeleton chat reply. */}
      <style>{`@keyframes saShimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}`}</style>

      {/* Progress modal for connect / publish / delete (blurred page, % bar, live logs). */}
      {job && (
        <ProgressModal
          open
          title={job.title}
          percent={jp.percent}
          status={jp.status}
          logs={jp.logs}
          error={jp.error}
          onCancel={cancelJob}
          onClose={closeJob}
        />
      )}

      {/* Themed confirm for removing a connected site (replaces the native popup). */}
      {confirmRemove && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setConfirmRemove(null)}>
          <div style={{ width: 400, maxWidth: '92vw', background: '#fff', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', padding: 22 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600, fontSize: 16, color: '#111827', marginBottom: 8 }}>Remove “{confirmRemove.name}”?</div>
            <p style={{ fontSize: 13, color: '#475467', margin: '0 0 18px' }}>This removes the site from SiteAgent and deletes its local files. It does not change the live website.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setConfirmRemove(null)} style={{ fontSize: 13, padding: '7px 16px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', color: '#111', cursor: 'pointer' }}>Cancel</button>
              <button onClick={doRemove} style={{ fontSize: 13, padding: '7px 16px', borderRadius: 6, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer' }}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
