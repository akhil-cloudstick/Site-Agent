'use client'

import { useEffect, useRef, useState } from 'react'

import { Drawer } from './Drawer'
import { DrawerLauncher } from './DrawerLauncher'
import { DrawerIcons, DrawerRow, drawerSectionHead } from './DrawerRow'
import { ProgressModal, type JobLogLine, type JobStatus } from './ProgressModal'

type JobType = 'connect' | 'publish' | 'delete'
const SKELETON = '__skeleton__'
const CHAT_STAGES = ['Reading the page…', 'Asking the AI…', 'Designing it…', 'Styling it to look great…', 'Almost there…']

/** A shimmering placeholder reply, shown while the AI works (with a looping status — so a
 *  longer build like a full page never looks frozen). */
function SkeletonReply() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setI((x) => (x + 1) % CHAT_STAGES.length), 1600)
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

// ── Chat persistence ──────────────────────────────────────────────────────────
// The chat lives in React state, so a reload / logout wipes it. Persist each connected
// site's conversation in localStorage (keyed by the globally-unique site id) so it
// survives reload AND logout/login in the same browser. Transient skeletons aren't saved.
type ChatMsg = { role: 'you' | 'agent'; text: string }
const chatKey = (id: number) => `sa-connected-chat-${id}`
function loadChat(id: number | null): ChatMsg[] {
  if (!id || typeof window === 'undefined') return []
  try {
    const arr = JSON.parse(window.localStorage.getItem(chatKey(id)) || '[]')
    return Array.isArray(arr)
      ? arr.filter((m: unknown): m is ChatMsg => !!m && ((m as ChatMsg).role === 'you' || (m as ChatMsg).role === 'agent') && typeof (m as ChatMsg).text === 'string' && (m as ChatMsg).text !== SKELETON)
      : []
  } catch {
    return []
  }
}
function saveChat(id: number | null, msgs: ChatMsg[]) {
  if (!id || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(chatKey(id), JSON.stringify(msgs.filter((m) => m.text !== SKELETON).slice(-120)))
  } catch {
    /* quota / private mode — best-effort */
  }
}
function clearChat(id: number) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(chatKey(id))
  } catch {
    /* ignore */
  }
}

const modalOverlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }

/** The "+ Add section" palette — pick a section kind; the AI builds it to match the site. */
function AddSectionPalette({ onPick, onClose }: { onPick: (kind: string) => void; onClose: () => void }) {
  const kinds: [string, string][] = [
    ['hero', 'Hero'], ['features', 'Features'], ['gallery', 'Gallery'],
    ['pricing', 'Pricing'], ['faq', 'FAQ'], ['cta', 'Call to action'],
    ['testimonials', 'Testimonials'], ['logos', 'Logos'], ['contact', 'Contact'],
  ]
  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={{ width: 460, maxWidth: '92vw', background: '#fff', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', padding: 22 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 600, fontSize: 16, color: '#111827', marginBottom: 4 }}>Add a section</div>
        <p style={{ fontSize: 13, color: '#475467', margin: '0 0 16px' }}>Pick a type — the AI builds it to match your site’s design. You’ll preview it before it’s added.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {kinds.map(([k, label]) => (
            <button key={k} onClick={() => onPick(k)} style={{ padding: '14px 8px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fafafa', cursor: 'pointer', fontSize: 13, color: '#111' }}>{label}</button>
          ))}
        </div>
        <p style={{ fontSize: 12, color: '#94a3b8', margin: '12px 0 0' }}>Tip: you can also just describe it in the chat (“add a pricing section”).</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button onClick={onClose} style={{ fontSize: 13, padding: '8px 16px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', color: '#111', cursor: 'pointer' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

/** Preview-before-commit overlay for a generated section/page (rendered with the site's
 *  own stylesheets so it looks real). Nothing is saved until "Keep it". */
function GeneratedPreview({ html, head, message, busy, onKeep, onDiscard }: { html: string; head?: string; message: string; busy: boolean; onKeep: () => void; onDiscard: () => void }) {
  const srcDoc = `<!doctype html><html><head><meta charset="utf-8">${head ?? ''}</head><body>${html}</body></html>`
  return (
    <div style={modalOverlay} onClick={onDiscard}>
      <div style={{ width: 'min(900px, 94vw)', background: '#fff', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 16, color: '#111827' }}>Preview</div>
          <p style={{ fontSize: 13, color: '#475467', margin: '4px 0 0' }}>{message} It isn’t added until you keep it.</p>
        </div>
        <iframe title="generated preview" srcDoc={srcDoc} sandbox="allow-same-origin" style={{ width: '100%', height: '58vh', border: '1px solid #eee', borderRadius: 8, background: '#fff' }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onDiscard} disabled={busy} style={{ fontSize: 13, padding: '8px 16px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', color: '#111', cursor: busy ? 'default' : 'pointer' }}>Discard</button>
          <button onClick={onKeep} disabled={busy} style={{ fontSize: 13, padding: '8px 16px', borderRadius: 6, border: 'none', background: busy ? '#9ca3af' : '#16a34a', color: '#fff', fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}>{busy ? 'Adding…' : 'Keep it'}</button>
        </div>
      </div>
    </div>
  )
}

export interface ConnectedSiteSummary {
  id: number
  name: string
  originUrl: string
  liveUrl: string | null
  pagePaths: string[]
  cloudflareProject: string
  repo: string | null
}

/** Does this site come from a git repo (so a Git-pull / sync makes sense)? */
const isRepoSite = (repo?: string | null) =>
  !!repo && (/^https?:\/\//.test(repo) || repo.endsWith('.git') || repo.includes('github.com'))

const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 6, border: '1px solid #ccc', fontSize: 13 }
const note: React.CSSProperties = { fontSize: 11, color: '#888' }

/**
 * Edit a CONNECTED site (a real, already-built website): multi-page preview, click /
 * chat to edit text & images, move/delete/add sections, manage pages, and generate new
 * sections/pages with AI (preview-before-commit), then publish to the same URL. All
 * edits go through Payload; generated HTML is sanitised before it ever touches the page.
 *
 * The left panel is the conversation; every site-lifecycle control (connect, publish,
 * roll back, remove, Cloudflare project, git-pull) lives in the left off-canvas drawer.
 */
export function ConnectedEditor({
  sites: initialSites,
  activeId,
  onConnected,
  onSelect,
  openConnectSignal = 0,
  drawerOpen = false,
  onCloseDrawer = () => {},
  onCreate = () => {},
  onRemoved,
  canEdit = true,
  profile,
  onTopBar,
}: {
  sites: ConnectedSiteSummary[]
  activeId: number | null
  onConnected: (site: ConnectedSiteSummary) => void
  onSelect: (id: number) => void
  openConnectSignal?: number
  drawerOpen?: boolean
  onCloseDrawer?: () => void
  onCreate?: () => void
  onRemoved?: (id: number) => void
  canEdit?: boolean
  profile?: React.ReactNode
  onTopBar?: (c: { liveUrl: string | null; editMode: boolean; onToggleEdit: () => void; showToggle: boolean }) => void
}) {
  const [sites, setSites] = useState(initialSites)
  const [busy, setBusy] = useState(false)
  // A long operation (connect/publish/delete) shown in the progress modal. The modal
  // overlays + blocks the page; progress is polled from the server so it survives a refresh.
  const [job, setJob] = useState<{ id: number; type: JobType; title: string; siteId?: number; name?: string; originUrl?: string; cloudflareProject?: string; repo?: string | null; rollback?: boolean } | null>(null)
  const [jp, setJp] = useState<{ percent: number; status: JobStatus; logs: JobLogLine[]; error?: string | null; result?: any }>({ percent: 0, status: 'running', logs: [] })
  const jobHandled = useRef(false)
  const [confirmRemove, setConfirmRemove] = useState<{ id: number; name: string } | null>(null)

  const startJobModal = (j: NonNullable<typeof job>) => {
    jobHandled.current = false
    setJp({ percent: 0, status: 'running', logs: [] })
    setJob(j)
  }
  const closeJob = () => setJob(null)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  // Which site `messages` currently belong to — keeps the save effect from writing one
  // site's chat under another's key during a switch. null until the first load runs.
  const [chatSite, setChatSite] = useState<number | null>(null)
  const addMsg = (role: 'you' | 'agent', text: string) => setMessages((m) => [...m, { role, text }])
  // Replace the most recent shimmering placeholder reply with final text (append if none).
  const replaceSkeleton = (text: string) =>
    setMessages((m) => {
      const idx = m.map((x) => x.text).lastIndexOf(SKELETON)
      if (idx < 0) return [...m, { role: 'agent' as const, text }]
      const c = [...m]
      c[idx] = { role: 'agent', text }
      return c
    })
  const [input, setInput] = useState('')
  const [activePath, setActivePath] = useState('/')
  const [editMode, setEditMode] = useState(true)
  const [target, setTarget] = useState<{ kind: 'item' | 'item-ai' | 'section' | 'page'; label: string; index?: number } | null>(null) // "Edit with AI" target
  const [refImage, setRefImage] = useState<File | null>(null) // reference image for the AI
  const [refDoc, setRefDoc] = useState<File | null>(null) // reference template/HTML file (e.g. .astro/.html) for the AI
  const [addSectionAt, setAddSectionAt] = useState<number | null>(null) // open the add-section palette at this index
  const [genBusy, setGenBusy] = useState(false) // generating a section/page
  // A generated block awaiting "keep it / discard" (preview-before-commit overlay). `action`
  // is what committing it does: insert a section, replace one, make a new page, or replace
  // the current page's content.
  const [genPreview, setGenPreview] = useState<{ html: string; message: string; head?: string; action: 'insert-section' | 'replace-section' | 'replace-item' | 'new-page' | 'replace-page'; index?: number; title?: string } | null>(null)
  const [addingPage, setAddingPage] = useState(false)
  const [newPageName, setNewPageName] = useState('')
  const [confirmDelPage, setConfirmDelPage] = useState<string | null>(null)
  // Deterministic button/link editor: set a redirect, or add a button to a section.
  const [linkEditor, setLinkEditor] = useState<{ mode: 'set' | 'add' | 'after'; index?: number; sectionIndex?: number; text: string; target: string; customUrl: string; name?: string } | null>(null)
  const pagesRef = useRef<string[]>([]) // latest page list, for use inside the message effect
  const [cfProject, setCfProject] = useState('') // editable Cloudflare project for the active site
  const [showSettings, setShowSettings] = useState(false)
  const [savedNote, setSavedNote] = useState(false) // "Cloudflare saved ✓" inline note
  const [gitNote, setGitNote] = useState(false) // "git pull coming soon" inline note
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

  // connect form (shown in its own modal)
  const [showConnect, setShowConnect] = useState(initialSites.length === 0)
  const [connectError, setConnectError] = useState<string | null>(null)
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
    setSavedNote(false)
    setGitNote(false)
    // The chat is per-site: load THIS site's saved conversation (empty when it's a new
    // site or after removal), and clear any pending input/targets. Runs only on a real
    // switch (client-side, post-hydration), so reading localStorage here is safe.
    setMessages(loadChat(activeId))
    setChatSite(activeId)
    setInput('')
    setTarget(null)
    setRefImage(null)
    setRefDoc(null)
  }
  // Reset the preview load-cache when the active site changes (refs must be mutated
  // outside render). Stale entries are site-id-prefixed, so this is just housekeeping.
  useEffect(() => {
    loadedRef.current = new Set()
  }, [activeId])
  // Load the initial site's saved chat once, on mount (the switch block above only fires
  // on a CHANGE). Done in an effect (not useState init) so SSR and client agree → no
  // hydration mismatch from localStorage.
  useEffect(() => {
    setMessages(loadChat(activeId))
    setChatSite(activeId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Persist the chat whenever it changes — keyed by the site the messages belong to
  // (chatSite), never the live activeId, so a switch can't save the old chat under the
  // new site's key. Skeletons are filtered out by saveChat.
  useEffect(() => {
    if (chatSite != null) saveChat(chatSite, messages)
  }, [messages, chatSite])
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
      if (!canEdit) return // operator view-only: ignore edit/AI events
      // Section structure controls (move/delete a whole band) from the preview toolbars.
      const section = (e.data as any)?.saSection
      if (section && (section.op === 'move' || section.op === 'delete') && typeof section.index === 'number') {
        addMsg('agent', SKELETON)
        void fetch('/workspace/connected/structure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteId: activeId, path: activePath, op: section.op, index: section.index, dir: section.dir }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data?.ok) {
              if (Array.isArray(data.paths) && data.paths.length) bumpPaths(data.paths)
              else bumpReload(activePath)
              const shared = Array.isArray(data.paths) && data.paths.length > 1
              const sec = typeof section.name === 'string' && section.name ? `the “${section.name}” section` : 'the section'
              const verb = section.op === 'delete' ? `Deleted ${sec}` : `Moved ${sec} ${section.dir === 'up' ? 'up' : 'down'}`
              replaceSkeleton(`${verb} in “${pageLabel(activePath)}”${shared ? ' (on every page)' : ''}.`)
            } else replaceSkeleton(data?.message ?? 'Could not apply that change.')
          })
          .catch(() => replaceSkeleton('Something went wrong — please try again.'))
        return
      }
      // Repeated-item controls (a card / nav link / button): reorder, duplicate, remove.
      const item = (e.data as any)?.saItem
      if (item && (item.op === 'move' || item.op === 'duplicate' || item.op === 'remove') && typeof item.index === 'number') {
        addMsg('agent', SKELETON)
        const nm = typeof item.name === 'string' && item.name ? `“${item.name}”` : 'the item'
        const dir = typeof item.dirLabel === 'string' ? item.dirLabel : ''
        const page = `“${pageLabel(activePath)}”`
        void fetch('/workspace/connected/item', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteId: activeId, path: activePath, op: item.op, index: item.index, dir: item.dir }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data?.ok) {
              if (Array.isArray(data.paths) && data.paths.length) bumpPaths(data.paths)
              else bumpReload(activePath)
              const shared = Array.isArray(data.paths) && data.paths.length > 1
              const where = shared ? 'every page' : page
              const base =
                item.op === 'duplicate'
                  ? `Duplicated ${nm} in ${where} — edit the copy to change its content.`
                  : item.op === 'remove'
                    ? `Removed ${nm} from ${where}.`
                    : `Moved ${nm}${dir ? ` ${dir}` : ''} in ${where}.`
              replaceSkeleton(base)
            } else replaceSkeleton(data?.message ?? 'Could not apply that change.')
          })
          .catch(() => replaceSkeleton('Something went wrong — please try again.'))
        return
      }
      // "+ Add section here" → open the palette at this insert position.
      const addAt = (e.data as any)?.saAddSection
      if (addAt && typeof addAt.index === 'number') {
        setAddSectionAt(addAt.index)
        return
      }
      // Deterministic button/link controls from the preview.
      const setLink = (e.data as any)?.saSetLink
      if (setLink && typeof setLink.index === 'number') {
        const cur = typeof setLink.href === 'string' ? setLink.href : ''
        const isPage = pagesRef.current.includes(cur)
        setLinkEditor({ mode: 'set', index: setLink.index, text: '', target: isPage ? cur : pagesRef.current[0] ?? '/', customUrl: isPage ? '' : cur, name: typeof setLink.name === 'string' ? setLink.name : undefined })
        return
      }
      const removeEl = (e.data as any)?.saRemoveEl
      if (removeEl && typeof removeEl.index === 'number') {
        const nm = typeof removeEl.name === 'string' && removeEl.name ? `“${removeEl.name}”` : 'that'
        void elementOp({ op: 'remove', index: removeEl.index }, `Removed ${nm} from “${pageLabel(activePath)}”.`)
        return
      }
      const addBtn = (e.data as any)?.saAddButton
      if (addBtn && typeof addBtn.sectionIndex === 'number') {
        setLinkEditor({ mode: 'add', sectionIndex: addBtn.sectionIndex, text: 'Learn more', target: pagesRef.current.find((p) => p !== activePath) ?? activePath, customUrl: '' })
        return
      }
      // "Add a link/button after this" → clone the clicked element's style + position.
      const addAfter = (e.data as any)?.saAddAfter
      if (addAfter && typeof addAfter.index === 'number') {
        setLinkEditor({ mode: 'after', index: addAfter.index, text: 'New link', target: pagesRef.current.find((p) => p !== activePath) ?? pagesRef.current[0] ?? '/', customUrl: '', name: typeof addAfter.name === 'string' ? addAfter.name : undefined })
        return
      }
      // Section "Edit with AI" → target this whole section; the next chat message edits it.
      const secAi = (e.data as any)?.saSectionAi
      if (secAi && typeof secAi.index === 'number') {
        setTarget({ kind: 'section', index: secAi.index, label: 'this section' })
        setTimeout(() => chatRef.current?.focus(), 0)
        return
      }
      // Item "Edit with AI" (a card / icon / nav item) → target it; the next message regenerates
      // just that item (preview-before-commit), styled to the site.
      const itemAi = (e.data as any)?.saItemAi
      if (itemAi && typeof itemAi.index === 'number') {
        setTarget({ kind: 'item-ai', index: itemAi.index, label: typeof itemAi.name === 'string' && itemAi.name ? `“${itemAi.name}”` : 'this item' })
        setTimeout(() => chatRef.current?.focus(), 0)
        return
      }
      // "Edit with AI" on one item → ask what to change, route through chat with the
      // item's current text as context so the AI targets the right thing.
      const ai = (e.data as any)?.saAi
      if (ai && typeof ai.value === 'string') {
        // Like the builder: set this item as the chat target, then type in the chat.
        setTarget({ kind: 'item', label: ai.value })
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
  }, [activeId, activePath, canEdit])

  // Apply a finished job to the UI. Only `done` mutates state + auto-closes; `error` /
  // `cancelled` leave the modal open so the user reads the message (then clicks Close).
  function handleJobTerminal(jb: NonNullable<typeof job>, j: any) {
    if (j.status !== 'done') return
    if (jb.type === 'connect' && jb.siteId) {
      const pagePaths = Array.isArray(j.result?.pagePaths) && j.result.pagePaths.length ? j.result.pagePaths : ['/']
      const ns: ConnectedSiteSummary = { id: jb.siteId, name: jb.name || 'New site', originUrl: jb.originUrl || '', liveUrl: null, pagePaths, cloudflareProject: jb.cloudflareProject || '', repo: jb.repo ?? null }
      setSites((s) => (s.some((x) => x.id === ns.id) ? s.map((x) => (x.id === ns.id ? ns : x)) : [...s, ns]))
      onConnected(ns)
      setShowConnect(false)
      setCName(''); setCUrl(''); setCProject(''); setCSource('')
    } else if (jb.type === 'publish' && jb.siteId) {
      if (j.result?.url) setSites((s) => s.map((x) => (x.id === jb.siteId ? { ...x, liveUrl: j.result.url } : x)))
      addMsg('agent', jb.rollback ? 'Rolled back and republished.' : 'Published — your site is live.')
    } else if (jb.type === 'delete' && jb.siteId) {
      setSites((s) => s.filter((x) => x.id !== jb.siteId))
      clearChat(jb.siteId) // drop the removed site's saved conversation
      onRemoved?.(jb.siteId)
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
        startJobModal({ id: j.id, type: j.type, title: titles[j.type as JobType] ?? 'Working…', siteId: activeId, name: site?.name, originUrl: site?.originUrl ?? undefined, cloudflareProject: site?.cloudflareProject, repo: site?.repo })
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
    setConnectError(null)
    setBusy(true)
    try {
      const res = await fetch('/workspace/connected/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cName, originUrl: cUrl, cloudflareProject: cProject, sourcePath: cSource }),
      })
      const data = await res.json()
      if (data.jobId) {
        // Slow folder/repo connect → close the connect modal and let the progress modal take over.
        setShowConnect(false)
        onCloseDrawer()
        startJobModal({ id: data.jobId, type: 'connect', title: `Connecting ${cName || cUrl || 'the site'}`, siteId: data.siteId, name: cName || cUrl || 'New site', originUrl: cUrl, cloudflareProject: cProject, repo: cSource || null })
      } else if (data.ok) {
        // Fast URL-only connect completed synchronously.
        const newSite: ConnectedSiteSummary = { id: data.siteId, name: cName || cUrl || 'New site', originUrl: cUrl, liveUrl: null, pagePaths: Array.isArray(data.pagePaths) && data.pagePaths.length ? data.pagePaths : ['/'], cloudflareProject: cProject, repo: cSource || null }
        setSites((s) => [...s, newSite])
        onConnected(newSite)
        setShowConnect(false)
        setCName(''); setCUrl(''); setCProject(''); setCSource('')
      } else {
        // Keep the modal open and show the error inline.
        setConnectError(data.message ?? 'Could not connect.')
      }
    } catch {
      setConnectError('Could not connect. Please try again.')
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
    // Targeted "Edit with AI" on a whole section or page → regenerate it (preview-before-commit).
    if (target?.kind === 'section' && typeof target.index === 'number') {
      const idx = target.index
      setTarget(null)
      void editSectionWithAI(message, idx)
      return
    }
    if (target?.kind === 'item-ai' && typeof target.index === 'number') {
      const idx = target.index
      setTarget(null)
      void editItemWithAI(message, idx)
      return
    }
    if (target?.kind === 'page') {
      setTarget(null)
      void editPageWithAI(message)
      return
    }
    // A reference template was attached → treat the message as build/reproduce (page if mentioned).
    if (refDoc) {
      setTarget(null)
      void generateFromChat(message, { mode: /\bpage\b/i.test(message) ? 'page' : 'section' })
      return
    }
    // A clear "add/build a section or page" request → generate (preview-before-commit),
    // unless the user is targeting a specific text item (that's a content edit).
    const gen = !target ? detectGenerateIntent(message) : null
    if (gen) {
      void generateFromChat(message, gen)
      return
    }
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
    if (loadedRef.current.has(srcFor(activePath))) {
      setShownPath(activePath)
      return
    }
    // Fallback so the preview never stays blank-white: sometimes the iframe's onLoad doesn't
    // fire (it was cached / raced on a reload). Poll its ready state and reveal it as soon as
    // it's done, and HARD-reveal after ~3.5s no matter what — so the user never has to switch
    // pages to "unstick" the preview.
    let tries = 0
    const id = setInterval(() => {
      if (loadedRef.current.has(srcFor(activePath))) {
        clearInterval(id) // onLoad already handled it
        return
      }
      tries++
      let ready = false
      try {
        ready = frameRefs.current[activePath]?.contentDocument?.readyState === 'complete'
      } catch {
        /* cross-doc access — ignore */
      }
      if (ready || tries >= 14) {
        loadedRef.current.add(srcFor(activePath))
        setShownPath(activePath)
        clearInterval(id)
      }
    }, 250)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath, activeId, reload])

  // When a page's iframe finishes loading: mark it loaded, reveal it if it's the page we
  // want to show (crossfade in), and reflect the current edit-mode state.
  function handleLoad(p: string) {
    loadedRef.current.add(srcFor(p))
    if (p === activePath) setShownPath(p)
    frameRefs.current[p]?.contentWindow?.postMessage({ saEditMode: canEdit && editMode }, '*')
  }

  // Whenever the visible page changes (incl. when the reveal FALLBACK shows it without onLoad
  // firing) — or edit mode toggles — push the current edit-mode into the shown iframe. Without
  // this, a page revealed by the fallback stays in plain view-mode (no edit controls) until the
  // user toggled edit mode off/on.
  useEffect(() => {
    if (!shownPath) return
    frameRefs.current[shownPath]?.contentWindow?.postMessage({ saEditMode: canEdit && editMode }, '*')
  }, [shownPath, editMode, canEdit])

  async function publish(rollback = false) {
    if (!activeId || busy || job) return
    onCloseDrawer() // the progress modal takes over
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
        setShowSettings(false)
        setSavedNote(true) // inline note; drawer stays open
      }
    } finally {
      setBusy(false)
    }
  }

  // Git pull (sync from the repo) is not wired up yet — show a "coming soon" note.
  function gitPull() {
    setGitNote(true)
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

  // ── Pages (add / delete / reorder) ────────────────────────────────────────
  const patchSitePages = (pagePaths: string[]) => setSites((s) => s.map((x) => (x.id === activeId ? { ...x, pagePaths } : x)))

  async function addPage() {
    const title = newPageName.trim()
    if (!title || !activeId || busy) return
    setBusy(true)
    try {
      const res = await fetch('/workspace/connected/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: activeId, fromPath: activePath, title }),
      })
      const data = await res.json()
      if (data.ok && Array.isArray(data.pagePaths)) {
        patchSitePages(data.pagePaths)
        setAddingPage(false)
        setNewPageName('')
        if (data.path) {
          setMounted((m) => (m.includes(data.path) ? m : [...m, data.path]))
          setActivePath(data.path)
          bumpPaths(data.pagePaths) // other pages got a nav link → refresh them
        }
      } else addMsg('agent', data.message ?? 'Could not add the page.')
    } finally {
      setBusy(false)
    }
  }

  async function deletePage(p: string) {
    setConfirmDelPage(null)
    if (!activeId || busy) return
    setBusy(true)
    try {
      const res = await fetch('/workspace/connected/pages', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: activeId, path: p }),
      })
      const data = await res.json()
      if (data.ok && Array.isArray(data.pagePaths)) {
        patchSitePages(data.pagePaths)
        if (activePath === p) setActivePath('/')
        bumpPaths(data.pagePaths) // remaining pages had nav links stripped → refresh
      } else addMsg('agent', data.message ?? 'Could not remove the page.')
    } finally {
      setBusy(false)
    }
  }

  async function movePage(p: string, dir: -1 | 1) {
    if (!activeId || busy) return
    const cur = active?.pagePaths ?? []
    const i = cur.indexOf(p)
    const j = i + dir
    if (i < 0 || j < 0 || j >= cur.length) return
    const order = [...cur]
    ;[order[i], order[j]] = [order[j], order[i]]
    setBusy(true)
    try {
      const res = await fetch('/workspace/connected/pages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: activeId, order }),
      })
      const data = await res.json()
      if (data.ok && Array.isArray(data.pagePaths)) patchSitePages(data.pagePaths)
    } finally {
      setBusy(false)
    }
  }

  // Deterministic button/link op (set redirect / remove / add a button) — no AI, but it
  // takes a moment: show the in-chat skeleton, then a specific result message.
  async function elementOp(payload: Record<string, unknown>, baseMsg: string) {
    if (!activeId || busy) return
    addMsg('agent', SKELETON)
    setBusy(true)
    try {
      const res = await fetch('/workspace/connected/element', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: activeId, path: activePath, ...payload }),
      })
      const data = await res.json()
      if (data.ok) {
        // Shared-component edits affect every page → refresh them all.
        if (Array.isArray(data.paths) && data.paths.length) bumpPaths(data.paths)
        else bumpReload(activePath)
        const shared = Array.isArray(data.paths) && data.paths.length > 1
        replaceSkeleton(baseMsg + (shared ? ' (on every page)' : ''))
      } else replaceSkeleton(data.message ?? 'Could not apply that change.')
    } catch {
      replaceSkeleton('Something went wrong — please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function applyLinkEditor() {
    if (!linkEditor) return
    const le = linkEditor
    const href = le.customUrl.trim() || le.target || '#'
    const targetName = le.customUrl.trim() || (le.target ? pageLabel(le.target) : 'the page')
    const page = pageLabel(activePath)
    setLinkEditor(null)
    if (le.mode === 'add') {
      const t = le.text.trim() || 'Button'
      await elementOp({ op: 'add-button', sectionIndex: le.sectionIndex, text: t, href }, `Added a “${t}” button to “${page}”.`)
    } else if (le.mode === 'after') {
      const t = le.text.trim() || 'Link'
      await elementOp({ op: 'add-after', index: le.index, text: t, href }, `Added “${t}” to “${page}”.`)
    } else {
      await elementOp({ op: 'set-link', index: le.index, href }, `Linked ${le.name ? `“${le.name}”` : 'that'} to ${targetName}.`)
    }
  }

  // ── Generate UI (add a section / build a page) ────────────────────────────
  // Capture the live preview's stylesheets so the generated block previews STYLED
  // (the page is served same-origin, so its <link>/<style> hrefs are already correct).
  function captureHead(): string {
    try {
      const doc = frameRefs.current[shownPath || activePath]?.contentDocument
      if (!doc) return ''
      const parts: string[] = []
      doc.querySelectorAll('link[rel="stylesheet"], style').forEach((n) => parts.push((n as HTMLElement).outerHTML))
      return parts.join('\n')
    } catch {
      return '' // cross-origin (shouldn't happen) — preview just shows unstyled structure
    }
  }

  // Conservative intent detection: only treat a chat message as "generate UI" when it
  // clearly asks to add/create/build a page, a section, or a known section kind.
  const SECTION_KINDS = ['hero', 'pricing', 'faq', 'gallery', 'testimonials', 'testimonial', 'cta', 'call to action', 'features', 'feature', 'contact', 'footer', 'header', 'logos', 'team', 'about']
  function detectGenerateIntent(msg: string): { mode: 'section' | 'page'; kind?: string } | null {
    const m = msg.toLowerCase()
    if (!/\b(add|create|make|build|generate|design|insert)\b/.test(m)) return null
    const kind = SECTION_KINDS.find((k) => m.includes(k))
    if (/\bpage\b/.test(m)) return { mode: 'page', kind }
    if (/\bsection\b/.test(m) || kind) return { mode: 'section', kind }
    return null
  }
  function deriveTitle(msg: string): string {
    let raw = ''
    // 1. an explicitly QUOTED name wins: 'product' / "product" / smart quotes
    let m = msg.match(/["'‘“]([^"'‘’“”]{1,40})["'’”]/)
    if (m) raw = m[1]
    // 2. named / called / titled X
    if (!raw) {
      m = msg.match(/\b(?:named|called|titled)\s+([A-Za-z0-9][A-Za-z0-9 \-]{0,38})/i)
      if (m) raw = m[1].split(/\s+/).slice(0, 3).join(' ')
    }
    // 3. a single word right before "page" (e.g. "a pricing page")
    if (!raw) {
      m = msg.match(/\b([A-Za-z][A-Za-z0-9]{1,30})\s+page\b/i)
      if (m) raw = m[1]
    }
    raw = raw
      .replace(/\b(a|an|the|me|my|new|this|that|like|page|named|called|titled|want|create|make|build|generate|design|add|for|i)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return raw ? raw.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 40) : 'New Page'
  }

  // Read the site's RENDERED theme from the live preview so generated HTML matches it
  // (background/text/accent/font) — without this the model invents off-brand colors.
  function captureTheme(): { bg?: string; color?: string; accent?: string; font?: string } | undefined {
    try {
      const f = frameRefs.current[shownPath || activePath]
      const doc = f?.contentDocument
      const win = f?.contentWindow
      if (!doc || !win || !doc.body) return undefined
      const bs = win.getComputedStyle(doc.body)
      const parse = (s: string): [number, number, number, number] | null => {
        const m = s && s.match(/rgba?\(([^)]+)\)/)
        if (!m) return null
        const p = m[1].split(',').map((x) => parseFloat(x))
        return p.length < 3 ? null : [p[0], p[1], p[2], p[3] === undefined ? 1 : p[3]]
      }
      // Accent = the most SATURATED, mid-lightness color used on buttons/links/badges
      // (so we pick the brand colour, e.g. red — not a white or black button).
      let accent: string | undefined
      let bestSat = 0.28
      const els = Array.prototype.slice.call(doc.querySelectorAll('button, a, [class*="btn"], [class*="cta"], [class*="badge"], [class*="accent"], [class*="primary"]'), 0, 250)
      for (const el of els as Element[]) {
        const cs = win.getComputedStyle(el)
        for (const v of [cs.backgroundColor, cs.color, cs.borderColor]) {
          const c = parse(v)
          if (!c || c[3] === 0) continue
          const mx = Math.max(c[0], c[1], c[2])
          const mn = Math.min(c[0], c[1], c[2])
          const sat = (mx - mn) / 255
          const light = (mx + mn) / 2 / 255
          if (light < 0.12 || light > 0.9) continue
          if (sat > bestSat) {
            bestSat = sat
            accent = `rgb(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])})`
          }
        }
      }
      return { bg: bs.backgroundColor, color: bs.color, font: bs.fontFamily, accent }
    } catch {
      return undefined
    }
  }

  // POST to /generate with the site theme attached + a hard timeout so a stuck model can
  // never freeze the overlay. Whole-page generation is much heavier than a section, so it
  // gets a longer budget.
  async function genFetch(body: Record<string, unknown>): Promise<any> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), body.mode === 'page' ? 240000 : 150000)
    try {
      const res = await fetch('/workspace/connected/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: captureTheme(), ...body }),
        signal: ctrl.signal,
      })
      return await res.json()
    } finally {
      clearTimeout(timer)
    }
  }

  // From the "+ Add section" palette: generate one section to insert at `atIndex`.
  async function generateSection(kind: string, atIndex: number) {
    if (!activeId || genBusy) return
    addMsg('you', `Add a ${kind} section`)
    addMsg('agent', SKELETON)
    setGenBusy(true)
    try {
      const data = await genFetch({ siteId: activeId, path: activePath, mode: 'section', kind })
      if (data.ok) {
        setGenPreview({ html: data.html, message: data.message, head: captureHead(), action: 'insert-section', index: atIndex })
        replaceSkeleton('Here’s a draft — review it in the preview, then keep or discard.')
      } else replaceSkeleton(data.message ?? 'Could not generate that section.')
    } catch (e) {
      replaceSkeleton((e as any)?.name === 'AbortError' ? 'That took too long — please try again.' : 'Something went wrong generating that section.')
    } finally {
      setGenBusy(false)
    }
  }

  // From the chat: generate a section or whole page from a description (+ optional ref image).
  async function generateFromChat(message: string, gen: { mode: 'section' | 'page'; kind?: string }) {
    if (!activeId) return
    addMsg('you', refImage || refDoc ? `${message}  [+ reference]` : message)
    addMsg('agent', SKELETON)
    let refImageUrl: string | undefined
    let referenceHtml: string | undefined
    try {
      if (refImage) refImageUrl = await fileToDataUrl(refImage)
    } catch {
      /* ignore */
    }
    try {
      if (refDoc) referenceHtml = (await refDoc.text()).slice(0, 20000)
    } catch {
      /* ignore */
    }
    setRefImage(null)
    setRefDoc(null)
    setGenBusy(true)
    try {
      const data = await genFetch({ siteId: activeId, path: activePath, mode: gen.mode, kind: gen.kind, prompt: message, refImage: refImageUrl, referenceHtml })
      if (data.ok) {
        setGenPreview({
          html: data.html,
          message: data.message,
          head: captureHead(),
          action: gen.mode === 'page' ? 'new-page' : 'insert-section',
          index: gen.mode === 'page' ? undefined : 99999, // chat sections append at the end
          title: gen.mode === 'page' ? deriveTitle(message) : undefined,
        })
        replaceSkeleton('I drafted that — review it in the preview, then keep or discard.')
      } else replaceSkeleton(data.message ?? 'Could not generate that.')
    } catch (e) {
      replaceSkeleton((e as any)?.name === 'AbortError' ? 'That took too long — please try again.' : 'Something went wrong generating that.')
    } finally {
      setGenBusy(false)
    }
  }

  // Section "Edit with AI": regenerate THIS section from the user's instruction (its current
  // HTML is the edit context server-side), then preview-before-commit and replace it.
  async function editSectionWithAI(message: string, index: number) {
    if (!activeId) return
    addMsg('you', refImage || refDoc ? `${message}  [+ reference]` : message)
    addMsg('agent', SKELETON)
    let refImageUrl: string | undefined
    let referenceHtml: string | undefined
    try {
      if (refImage) refImageUrl = await fileToDataUrl(refImage)
    } catch {
      /* ignore */
    }
    try {
      if (refDoc) referenceHtml = (await refDoc.text()).slice(0, 20000)
    } catch {
      /* ignore */
    }
    setRefImage(null)
    setRefDoc(null)
    setGenBusy(true)
    try {
      const data = await genFetch({ siteId: activeId, path: activePath, mode: 'section', prompt: message, editIndex: index, refImage: refImageUrl, referenceHtml })
      if (data.ok) {
        setGenPreview({ html: data.html, message: data.message, head: captureHead(), action: 'replace-section', index })
        replaceSkeleton('I updated that section — review it, then keep or discard.')
      } else replaceSkeleton(data.message ?? 'Could not edit that section.')
    } catch (e) {
      replaceSkeleton((e as any)?.name === 'AbortError' ? 'That took too long — please try again.' : 'Something went wrong editing that section.')
    } finally {
      setGenBusy(false)
    }
  }

  // Item "Edit with AI": regenerate just one card / icon / nav item, then preview-and-replace.
  async function editItemWithAI(message: string, index: number) {
    if (!activeId) return
    addMsg('you', refImage || refDoc ? `${message}  [+ reference]` : message)
    addMsg('agent', SKELETON)
    let refImageUrl: string | undefined
    let referenceHtml: string | undefined
    try {
      if (refImage) refImageUrl = await fileToDataUrl(refImage)
    } catch {
      /* ignore */
    }
    try {
      if (refDoc) referenceHtml = (await refDoc.text()).slice(0, 20000)
    } catch {
      /* ignore */
    }
    setRefImage(null)
    setRefDoc(null)
    setGenBusy(true)
    try {
      const data = await genFetch({ siteId: activeId, path: activePath, mode: 'item', prompt: message, editIndex: index, refImage: refImageUrl, referenceHtml })
      if (data.ok) {
        setGenPreview({ html: data.html, message: data.message, head: captureHead(), action: 'replace-item', index })
        replaceSkeleton('I updated that — review it, then keep or discard.')
      } else replaceSkeleton(data.message ?? 'Could not edit that.')
    } catch (e) {
      replaceSkeleton((e as any)?.name === 'AbortError' ? 'That took too long — please try again.' : 'Something went wrong editing that.')
    } finally {
      setGenBusy(false)
    }
  }

  // Page "Edit with AI": regenerate the whole current page's content, then preview-and-replace.
  async function editPageWithAI(message: string) {
    if (!activeId) return
    addMsg('you', refImage || refDoc ? `${message}  [+ reference]` : message)
    addMsg('agent', SKELETON)
    let refImageUrl: string | undefined
    let referenceHtml: string | undefined
    try {
      if (refImage) refImageUrl = await fileToDataUrl(refImage)
    } catch {
      /* ignore */
    }
    try {
      if (refDoc) referenceHtml = (await refDoc.text()).slice(0, 20000)
    } catch {
      /* ignore */
    }
    setRefImage(null)
    setRefDoc(null)
    setGenBusy(true)
    try {
      const data = await genFetch({ siteId: activeId, path: activePath, mode: 'page', prompt: message, editPage: true, refImage: refImageUrl, referenceHtml })
      if (data.ok) {
        setGenPreview({ html: data.html, message: data.message, head: captureHead(), action: 'replace-page' })
        replaceSkeleton('I updated this page — review it, then keep or discard.')
      } else replaceSkeleton(data.message ?? 'Could not edit this page.')
    } catch (e) {
      replaceSkeleton((e as any)?.name === 'AbortError' ? 'That took too long — please try again.' : 'Something went wrong editing this page.')
    } finally {
      setGenBusy(false)
    }
  }

  // "Keep it" → commit the generated block (re-sanitised server-side) per its action.
  async function keepGenerated() {
    if (!genPreview || !activeId || busy) return
    const g = genPreview
    const mode = g.action === 'new-page' ? 'page' : g.action === 'replace-page' ? 'replace-page' : g.action === 'replace-section' ? 'replace-section' : g.action === 'replace-item' ? 'replace-item' : 'section'
    setBusy(true)
    try {
      const res = await fetch('/workspace/connected/insert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: activeId, path: activePath, mode, index: g.index, html: g.html, title: g.title }),
      })
      const data = await res.json()
      setGenPreview(null)
      if (data.ok) {
        if (g.action === 'new-page' && Array.isArray(data.pagePaths)) {
          patchSitePages(data.pagePaths)
          if (data.path) {
            setMounted((m) => (m.includes(data.path) ? m : [...m, data.path]))
            setActivePath(data.path)
            bumpPaths(data.pagePaths)
          }
        } else if (Array.isArray(data.paths) && data.paths.length) {
          bumpPaths(data.paths) // shared-component (e.g. nav) edit reflected on every page
        } else {
          bumpReload(activePath)
        }
      } else addMsg('agent', data.message ?? 'Could not apply that.')
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
    onCloseDrawer() // the progress modal takes over
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

  // Surface the live URL + Edit-mode toggle to the workspace top bar.
  useEffect(() => {
    onTopBar?.({ liveUrl: active?.liveUrl ?? null, editMode, onToggleEdit: toggleEdit, showToggle: canEdit && !!active })
    return () => onTopBar?.({ liveUrl: null, editMode: true, onToggleEdit: () => {}, showToggle: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.liveUrl, active?.id, editMode, canEdit])

  const btn: React.CSSProperties = { fontSize: 13, padding: '6px 12px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: busy ? 'default' : 'pointer' }
  const tabMini: React.CSSProperties = { width: 20, height: 20, padding: 0, fontSize: 10, lineHeight: 1, borderRadius: 4, border: '1px solid #e2e2e2', background: '#fff', color: '#475467', cursor: busy ? 'default' : 'pointer' }
  const pages = active?.pagePaths?.length ? active.pagePaths : ['/']
  pagesRef.current = pages

  return (
    <div style={{ display: 'flex', height: '100%', fontFamily: 'system-ui, sans-serif', color: '#111' }}>
      {/* Left panel — the conversation. Site controls live in the drawer (☰). */}
      <div style={{ width: 360, minWidth: 300, borderRight: '1px solid #e2e2e2', display: 'flex', flexDirection: 'column', background: '#fafafa' }}>
        {/* Conversation (same bubble style as the builder) */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.length === 0 && active && (
            <p style={{ color: '#888', fontSize: 13 }}>
              {canEdit
                ? 'With Edit mode on: click any text or image to change it, use the section toolbars to move/delete/add sections, manage pages in the tab bar — or just describe what you want below (e.g. “add a pricing section”, “build me an about page”).'
                : 'Viewing as operator — read-only.'}
            </p>
          )}
          {!active && (
            <p style={{ color: '#888', fontSize: 13 }}>Open the menu (☰) to connect a website or reopen one from history.</p>
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

        {active && canEdit && target && (
          <div style={{ padding: '8px 12px 0', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#1e40af' }}>
            <span>Editing &ldquo;<strong>{target.label}</strong>&rdquo; — your next message applies here</span>
            <button onClick={() => setTarget(null)} title="Clear" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#888' }}>✕</button>
          </div>
        )}
        {active && canEdit && refImage && (
          <div style={{ padding: '8px 12px 0', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#555' }}>
            <span>Reference image for the AI: <strong>{refImage.name || 'pasted image'}</strong></span>
            <button onClick={() => setRefImage(null)} title="Remove" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#888' }}>✕</button>
          </div>
        )}
        {active && canEdit && refDoc && (
          <div style={{ padding: '8px 12px 0', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#555' }}>
            <span>Reference template: <strong>{refDoc.name}</strong> — the AI will reproduce its design</span>
            <button onClick={() => setRefDoc(null)} title="Remove" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#888' }}>✕</button>
          </div>
        )}

        {active && canEdit && (
          <div style={{ padding: 12, borderTop: '1px solid #e2e2e2' }}>
            <input
              ref={refInputRef}
              type="file"
              accept="image/*,text/html,.html,.htm,.astro,.txt,.jsx,.tsx,.vue,.svelte,.md"
              onChange={(e) => {
                const fl = e.target.files?.[0] ?? null
                if (fl && fl.type.startsWith('image/')) setRefImage(fl)
                else if (fl) setRefDoc(fl)
                e.target.value = ''
              }}
              style={{ display: 'none' }}
            />
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
                placeholder="Describe a change, or attach a reference (image or .astro/.html template)…"
                disabled={busy}
                style={{ width: '100%', padding: '4px 6px', border: 'none', outline: 'none', fontSize: 14, resize: 'none', fontFamily: 'inherit', lineHeight: 1.4, maxHeight: 160, overflowY: 'hidden', background: 'transparent', boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <button
                  onClick={() => refInputRef.current?.click()}
                  disabled={busy}
                  title="Attach a reference image or a template file (.astro/.html), or paste an image with Ctrl+V"
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

      {/* Preview — page tabs + Undo + edit-mode toggle, then address bar */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff' }}>
        {active ? (
          <>
            {/* Toolbar row: page tabs · Undo. (Live URL + Edit-mode toggle live in the top bar.) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: '7px 12px', borderBottom: '1px solid #eee' }}>
              {pages.map((p) => {
                const on = p === activePath
                return (
                  <span key={p} style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <button onClick={() => setActivePath(p)} disabled={busy} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid ' + (on ? '#2563eb' : '#ccc'), background: on ? '#2563eb' : '#fff', color: on ? '#fff' : '#333', cursor: busy ? 'default' : 'pointer' }}>{pageLabel(p)}</button>
                    {on && canEdit && editMode && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1, marginLeft: 3 }}>
                        <button title="Edit this page with AI" disabled={busy || genBusy} onClick={() => { setTarget({ kind: 'page', label: 'this page' }); setTimeout(() => chatRef.current?.focus(), 0) }} style={{ ...tabMini, color: '#2563eb' }}>✦</button>
                        <button title="Move page left" disabled={busy} onClick={() => movePage(p, -1)} style={tabMini}>◀</button>
                        <button title="Move page right" disabled={busy} onClick={() => movePage(p, 1)} style={tabMini}>▶</button>
                        {p !== '/' && <button title="Delete this page" disabled={busy} onClick={() => setConfirmDelPage(p)} style={{ ...tabMini, color: '#b42318' }}>✕</button>}
                      </span>
                    )}
                  </span>
                )
              })}
              {canEdit && editMode &&
                (addingPage ? (
                  <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                    <input
                      autoFocus
                      value={newPageName}
                      onChange={(e) => setNewPageName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void addPage()
                        if (e.key === 'Escape') { setAddingPage(false); setNewPageName('') }
                      }}
                      placeholder="Page name"
                      style={{ ...inp, padding: '3px 8px', fontSize: 12, width: 120 }}
                    />
                    <button onClick={addPage} disabled={busy} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>Add</button>
                    <button onClick={() => { setAddingPage(false); setNewPageName('') }} style={tabMini}>✕</button>
                  </span>
                ) : (
                  <button onClick={() => setAddingPage(true)} disabled={busy} title="Add a page" style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px dashed #bbb', background: '#fafafa', color: '#555', cursor: busy ? 'default' : 'pointer' }}>+ Page</button>
                ))}
              {canEdit && (
                <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6 }}>
                  {editMode && (
                    <button onClick={() => setAddSectionAt(99999)} disabled={busy || genBusy} title="Add a section to this page" style={{ ...btn, borderColor: '#2563eb', color: '#2563eb' }}>+ Section</button>
                  )}
                  <button onClick={undo} disabled={busy} title="Undo the last edit in the preview" style={btn}>↶ Undo</button>
                </span>
              )}
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
              {/* Loading spinner only while NOTHING is painted yet (initial load / reload). During a
                  page switch the previous page stays visible, so no spinner there. */}
              {!shownPath && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 30, height: 30, borderRadius: '50%', border: '3px solid #e5e7eb', borderTopColor: '#2563eb', animation: 'saSpin .8s linear infinite' }} />
                    <span style={{ fontSize: 13, color: '#888' }}>Loading preview…</span>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <p style={{ padding: 48, color: '#888' }}>Connect a website to start.</p>
        )}
      </div>

      <input ref={imgInputRef} type="file" accept="image/*" onChange={onImagePicked} style={{ display: 'none' }} />

      {/* Shimmer animation for the skeleton chat reply; spinner for the preview load. */}
      <style>{`@keyframes saShimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}@keyframes saSpin{to{transform:rotate(360deg)}}`}</style>

      {/* The command drawer: launcher (New + History) + connect form + per-site actions. */}
      <Drawer open={drawerOpen} onClose={onCloseDrawer} title="Workspace">
        <DrawerLauncher
          mode="connected"
          history={sites}
          activeConnectedId={activeId}
          busy={busy || !!job}
          canEdit={canEdit}
          onCreate={onCreate}
          onConnect={() => { setConnectError(null); setShowConnect(true); onCloseDrawer() }}
          onOpenConnected={onSelect}
        />

        {canEdit && active && (
          <div style={{ paddingBottom: 6 }}>
            <div style={drawerSectionHead}>{active.name}</div>
            {/* All actions share the same row style as the launcher. */}
            <DrawerRow icon={DrawerIcons.publish} label="Publish" accent="success" disabled={busy} onClick={() => publish(false)} />
            <DrawerRow icon={DrawerIcons.rollback} label="Roll back" disabled={busy} onClick={() => publish(true)} />
            {isRepoSite(active.repo) && (
              <DrawerRow icon={DrawerIcons.gitpull} label="Git pull" disabled={busy} onClick={gitPull} />
            )}
            {gitNote && <div style={{ ...note, padding: '2px 18px' }}>Repo sync (Git pull) is coming soon.</div>}

            {/* Cloudflare project — same row; clicking expands an input prefilled with the saved name. */}
            <DrawerRow
              icon={DrawerIcons.cloud}
              label={`Cloudflare project${active.cloudflareProject ? ` · ${active.cloudflareProject}` : ''}`}
              disabled={busy}
              onClick={() => {
                const open = !showSettings
                if (open) setCfProject(active.cloudflareProject ?? '') // prefill with the saved name
                setShowSettings(open)
                setSavedNote(false)
              }}
              trailing={<span style={{ display: 'inline-flex', color: '#9aa0aa', transform: showSettings ? 'rotate(90deg)' : 'none', transition: 'transform .12s' }}>{DrawerIcons.chevron}</span>}
            />
            {savedNote && !showSettings && <div style={{ ...note, color: '#16a34a', padding: '2px 18px' }}>Saved ✓</div>}
            {!active.cloudflareProject && !showSettings && <div style={{ ...note, padding: '2px 18px' }}>Needed to publish.</div>}
            {showSettings && (
              <div style={{ display: 'flex', gap: 6, padding: '4px 18px' }}>
                <input value={cfProject} onChange={(e) => setCfProject(e.target.value)} placeholder="cloudflare-project-name" style={{ ...inp, flex: 1 }} />
                <button onClick={saveSettings} disabled={busy} style={{ ...btn, background: '#2563eb', color: '#fff', borderColor: '#2563eb' }}>{active.cloudflareProject ? 'Update' : 'Save'}</button>
              </div>
            )}

            <DrawerRow icon={DrawerIcons.remove} label="Remove site" accent="danger" disabled={busy} onClick={() => removeSite(active.id, active.name)} />
          </div>
        )}
        {profile}
      </Drawer>

      {/* Connect-a-website modal (same themed dialog as remove/publish). */}
      {showConnect && canEdit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => !busy && setShowConnect(false)}>
          <div style={{ width: 440, maxWidth: '92vw', background: '#fff', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', padding: 22 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600, fontSize: 16, color: '#111827', marginBottom: 4 }}>Connect a website</div>
            <p style={{ fontSize: 13, color: '#475467', margin: '0 0 16px' }}>Give a GitHub repo (we clone + build it), or a built-site/repo folder on this machine. Not deployed yet? Leave the live address blank — Publish will create the Cloudflare site and fill it in.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Name (e.g. Acme)" style={{ ...inp, padding: '10px 12px' }} />
              <input value={cSource} onChange={(e) => setCSource(e.target.value)} placeholder="GitHub repo URL, or a folder path on this machine" style={{ ...inp, padding: '10px 12px' }} />
              <input value={cUrl} onChange={(e) => setCUrl(e.target.value)} placeholder="Live address (optional — leave blank if not deployed yet)" style={{ ...inp, padding: '10px 12px' }} />
              <input value={cProject} onChange={(e) => setCProject(e.target.value)} placeholder="Cloudflare project (needed to publish)" style={{ ...inp, padding: '10px 12px' }} />
            </div>
            {connectError && <div style={{ fontSize: 12, color: '#dc2626', marginTop: 10 }}>{connectError}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button onClick={() => setShowConnect(false)} disabled={busy} style={{ fontSize: 13, padding: '8px 16px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', color: '#111', cursor: busy ? 'default' : 'pointer' }}>Cancel</button>
              <button onClick={connect} disabled={busy} style={{ fontSize: 13, padding: '8px 16px', borderRadius: 6, border: 'none', background: busy ? '#9ca3af' : '#2563eb', color: '#fff', fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}>{busy ? 'Connecting…' : 'Connect'}</button>
            </div>
          </div>
        </div>
      )}

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

      {/* Themed confirm for deleting a PAGE from a connected site. */}
      {confirmDelPage && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setConfirmDelPage(null)}>
          <div style={{ width: 400, maxWidth: '92vw', background: '#fff', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', padding: 22 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600, fontSize: 16, color: '#111827', marginBottom: 8 }}>Delete the “{pageLabel(confirmDelPage)}” page?</div>
            <p style={{ fontSize: 13, color: '#475467', margin: '0 0 18px' }}>This removes the page and its content from your draft, and strips its links from the menu. It goes live on your next Publish.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setConfirmDelPage(null)} style={{ fontSize: 13, padding: '7px 16px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', color: '#111', cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => deletePage(confirmDelPage)} style={{ fontSize: 13, padding: '7px 16px', borderRadius: 6, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer' }}>Delete page</button>
            </div>
          </div>
        </div>
      )}

      {/* Button/link editor — set a redirect, or add a button to a section. */}
      {linkEditor && (
        <div style={modalOverlay} onClick={() => setLinkEditor(null)}>
          <div style={{ width: 440, maxWidth: '92vw', background: '#fff', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', padding: 22 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600, fontSize: 16, color: '#111827', marginBottom: 8 }}>{linkEditor.mode === 'set' ? 'Set link / redirect' : linkEditor.mode === 'add' ? 'Add a button' : 'Add a link'}</div>
            {linkEditor.mode !== 'set' && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: '#475467', display: 'block', marginBottom: 4 }}>{linkEditor.mode === 'add' ? 'Button text' : 'Link text'}</label>
                <input value={linkEditor.text} onChange={(e) => setLinkEditor({ ...linkEditor, text: e.target.value })} placeholder={linkEditor.mode === 'add' ? 'Learn more' : 'Products'} style={{ ...inp, width: '100%', padding: '8px 10px' }} />
              </div>
            )}
            <label style={{ fontSize: 12, color: '#475467', display: 'block', marginBottom: 4 }}>Link to a page</label>
            <select value={linkEditor.target} onChange={(e) => setLinkEditor({ ...linkEditor, target: e.target.value })} style={{ ...inp, width: '100%', padding: '8px 10px', marginBottom: 12 }}>
              {pages.map((p) => (
                <option key={p} value={p}>{pageLabel(p)} ({p})</option>
              ))}
            </select>
            <label style={{ fontSize: 12, color: '#475467', display: 'block', marginBottom: 4 }}>…or a custom URL (overrides the page)</label>
            <input value={linkEditor.customUrl} onChange={(e) => setLinkEditor({ ...linkEditor, customUrl: e.target.value })} placeholder="https://example.com, /page, or #section" style={{ ...inp, width: '100%', padding: '8px 10px' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button onClick={() => setLinkEditor(null)} style={{ fontSize: 13, padding: '8px 16px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', color: '#111', cursor: 'pointer' }}>Cancel</button>
              <button onClick={applyLinkEditor} disabled={busy} style={{ fontSize: 13, padding: '8px 16px', borderRadius: 6, border: 'none', background: busy ? '#9ca3af' : '#2563eb', color: '#fff', fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}>{linkEditor.mode === 'set' ? 'Save link' : linkEditor.mode === 'add' ? 'Add button' : 'Add link'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add-section palette + preview-before-commit overlay (Track D/G). */}
      {addSectionAt !== null && (
        <AddSectionPalette
          onPick={(kind) => { const at = addSectionAt; setAddSectionAt(null); void generateSection(kind, at) }}
          onClose={() => setAddSectionAt(null)}
        />
      )}
      {genPreview && (
        <GeneratedPreview
          html={genPreview.html}
          message={genPreview.message}
          busy={busy}
          onKeep={keepGenerated}
          onDiscard={() => setGenPreview(null)}
        />
      )}
    </div>
  )
}
