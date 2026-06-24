'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'

/** When false, the preview renders read-only (no click-to-edit, no controls). */
const EditModeContext = createContext(true)

import type { CurrentPage, PageSummary, WorkspaceDto } from '@/workspace/types'

import type { ConnectedSiteSummary } from './ConnectedEditor'
import { Drawer } from './Drawer'
import { DrawerLauncher } from './DrawerLauncher'

interface Msg {
  role: 'you' | 'agent'
  text: string
  badges?: { label: string; kind: 'section' | 'image' }[]
}

const CHAT_KEY = 'siteagent.workspace.chat'
const TYPING = '__typing__'

/** Animated three-dot "the AI is working" indicator. */
function TypingDots() {
  const [n, setN] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setN((x) => (x + 1) % 3), 350)
    return () => clearInterval(id)
  }, [])
  return (
    <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', padding: '2px 0' }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#9ca3af', opacity: n === i ? 1 : 0.3, transition: 'opacity .2s' }} />
      ))}
    </span>
  )
}
const GREETING: Msg = {
  role: 'agent',
  text: 'Hi! Tell me a change in plain English — e.g. "change the hero heading to Summer Sale".',
}

export function WorkspaceClient({
  workspace: initial,
  initialLiveUrl,
  drawerOpen = false,
  onCloseDrawer = () => {},
  canEdit = true,
  mode = 'block',
  history = [],
  activeConnectedId = null,
  onCreate = () => {},
  onConnect = () => {},
  onOpenConnected = () => {},
  profile,
}: {
  workspace: WorkspaceDto
  initialLiveUrl?: string | null
  drawerOpen?: boolean
  onCloseDrawer?: () => void
  canEdit?: boolean
  mode?: 'block' | 'connected'
  history?: ConnectedSiteSummary[]
  activeConnectedId?: number | null
  onCreate?: () => void
  onConnect?: () => void
  onOpenConnected?: (id: number) => void
  profile?: React.ReactNode
}) {
  const [messages, setMessages] = useState<Msg[]>([GREETING])
  const [pages, setPages] = useState<PageSummary[]>(initial.pages)
  const [current, setCurrent] = useState<CurrentPage | null>(initial.current)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [editMode, setEditMode] = useState(canEdit) // view-only operators start (and stay) in preview
  const [liveUrl, setLiveUrl] = useState<string | null>(initialLiveUrl ?? null)
  const [publishing, setPublishing] = useState(false)
  // A themed confirm / prompt dialog (replaces the browser's window.confirm/prompt).
  const [modal, setModal] = useState<
    | { title: string; input: boolean; placeholder?: string; confirmLabel: string; danger: boolean; resolve: (v: string | null) => void }
    | null
  >(null)
  const modalInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const refInputRef = useRef<HTMLInputElement>(null)
  const [refImage, setRefImage] = useState<File | null>(null)
  // Which image slot a click-to-replace is targeting (undefined = the hero default).
  const pendingPathRef = useRef<string | undefined>(undefined)
  // The last image change, so we can offer a one-click revert.
  const [lastUndo, setLastUndo] = useState<{ path: string; previousMediaId: number | null } | null>(null)
  // "Point at this": the section the mouse is over, and the section chosen as the AI target.
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)
  const [target, setTarget] = useState<{ index: number; label: string } | null>(null)
  const chatRef = useRef<HTMLTextAreaElement>(null)
  // Width of the chat panel in px; the user can drag the divider to resize it.
  const [chatWidth, setChatWidth] = useState(420)

  // Drag the divider between the chat and the preview to resize them.
  function startResize(e: React.MouseEvent) {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = chatWidth
    function onMove(ev: MouseEvent) {
      const next = startWidth + (ev.clientX - startX)
      setChatWidth(Math.max(320, Math.min(next, window.innerWidth - 480)))
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // Paste an image straight into the chat to use it as a reference for the AI.
  function onChatPaste(e: React.ClipboardEvent) {
    const item = Array.from(e.clipboardData.items).find((it) => it.type.startsWith('image/'))
    const file = item?.getAsFile()
    if (file) setRefImage(file)
  }

  // Grow the chat box to fit its content (up to a cap), so it has no scrollbar for normal use.
  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
    // Only show a scrollbar once the content has actually outgrown the cap.
    el.style.overflowY = el.scrollHeight > 140 ? 'auto' : 'hidden'
  }

  const currentPageId = current?.id

  // Mark a section as the AI's target and jump to the chat (no need to name it).
  function targetSection(i: number) {
    const b = current?.layout[i]
    if (!b) return
    const heading = 'heading' in b && b.heading ? ` — “${b.heading.slice(0, 24)}”` : ''
    setTarget({ index: i, label: (SECTION_LABEL[b.type] ?? 'Section') + heading })
    setFocusedIndex(i)
    setTimeout(() => chatRef.current?.focus(), 0)
  }

  // Alt+E targets the section currently under the cursor — the "point at this" shortcut.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault()
        if (focusedIndex != null) targetSection(focusedIndex)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedIndex, current])

  function applyWorkspace(ws?: WorkspaceDto) {
    if (!ws) return
    setPages(ws.pages)
    setCurrent(ws.current)
  }

  // Restore chat history on mount (survives a full page refresh). Intentionally
  // sets state after mount — the hydration-safe way to load browser-only state.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(CHAT_KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setMessages(JSON.parse(saved))
    } catch {}
  }, [])

  // Persist chat history whenever it changes.
  useEffect(() => {
    try {
      sessionStorage.setItem(CHAT_KEY, JSON.stringify(messages))
    } catch {}
  }, [messages])

  async function send() {
    const text = input.trim()
    if ((!text && !refImage) || busy) return
    const sentImage = refImage
    const badges: Msg['badges'] = []
    if (target) badges.push({ label: target.label, kind: 'section' })
    if (sentImage) badges.push({ label: sentImage.name, kind: 'image' })
    setInput('')
    setRefImage(null)
    if (chatRef.current) chatRef.current.style.height = 'auto'
    setBusy(true)
    setMessages((m) => [...m, { role: 'you', text: text || '(look at this)', badges }, { role: 'agent', text: TYPING }])
    try {
      const fd = new FormData()
      fd.append('message', text)
      if (currentPageId) fd.append('pageId', String(currentPageId))
      if (target) fd.append('targetIndex', String(target.index))
      if (sentImage) fd.append('image', sentImage)
      setTarget(null)
      const res = await fetch('/workspace/edit', { method: 'POST', body: fd })
      const data = await res.json()
      setMessages((m) => [...m.slice(0, -1), { role: 'agent', text: data.message ?? 'Done.' }])
      if (data.ok) applyWorkspace(data.workspace) // update without a refresh
    } catch {
      setMessages((m) => [...m.slice(0, -1), { role: 'agent', text: 'Something went wrong — nothing was changed.' }])
    } finally {
      setBusy(false)
    }
  }

  // Open the file picker, optionally aimed at a specific image slot (section/item).
  function pickImage(path?: string) {
    if (busy) return
    pendingPathRef.current = path
    fileInputRef.current?.click()
  }

  async function uploadImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    const path = pendingPathRef.current
    pendingPathRef.current = undefined
    if (!file || busy) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (path) fd.append('path', path)
      if (currentPageId) fd.append('pageId', String(currentPageId))
      const res = await fetch('/workspace/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.ok) {
        applyWorkspace(data.workspace)
        if (data.undo) setLastUndo(data.undo)
      } else {
        setMessages((m) => [...m, { role: 'agent', text: data.message ?? 'Image upload failed.' }])
      }
    } catch {
      setMessages((m) => [...m, { role: 'agent', text: 'Image upload failed.' }])
    } finally {
      setBusy(false)
    }
  }

  // Point an image slot at a specific media id (null = remove). Used by revert/clear.
  async function setImage(path: string, mediaId: number | null, remember: boolean) {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch('/workspace/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, mediaId, pageId: currentPageId }),
      })
      const data = await res.json()
      if (data.ok) {
        applyWorkspace(data.workspace)
        if (remember && data.undo) setLastUndo(data.undo)
        else setLastUndo(null)
      }
    } catch {
    } finally {
      setBusy(false)
    }
  }

  function revertImage() {
    if (!lastUndo) return
    const u = lastUndo
    setLastUndo(null)
    void setImage(u.path, u.previousMediaId, false)
  }

  async function saveField(field: string, value: string) {
    try {
      const res = await fetch('/workspace/field', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, value, pageId: currentPageId }),
      })
      const data = await res.json()
      if (data.ok) applyWorkspace(data.workspace)
    } catch {}
  }

  async function switchPage(id: number) {
    if (busy || id === currentPageId) return
    setBusy(true)
    try {
      const res = await fetch(`/workspace/pages?pageId=${id}`)
      const data = await res.json()
      if (data.ok) applyWorkspace(data.workspace)
    } catch {
    } finally {
      setBusy(false)
    }
  }

  async function addPage() {
    if (busy) return
    const title = (await promptDialog('Name of the new page', 'e.g. About, Services'))?.trim()
    if (!title) return
    setBusy(true)
    try {
      const res = await fetch('/workspace/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      const data = await res.json()
      if (data.ok) applyWorkspace(data.workspace)
      else setMessages((m) => [...m, { role: 'agent', text: data.message ?? 'Could not add the page.' }])
    } catch {
    } finally {
      setBusy(false)
    }
  }

  async function deletePage(p: PageSummary) {
    if (busy) return
    if (!(await confirmDialog(`Delete the “${p.navLabel}” page? This can't be undone.`))) return
    setBusy(true)
    try {
      const res = await fetch(`/workspace/pages?pageId=${p.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.ok) applyWorkspace(data.workspace)
      else setMessages((m) => [...m, { role: 'agent', text: data.message ?? 'Could not delete the page.' }])
    } catch {
    } finally {
      setBusy(false)
    }
  }

  // Promise-based themed dialogs.
  function confirmDialog(title: string, confirmLabel = 'Delete'): Promise<boolean> {
    return new Promise((resolve) => setModal({ title, input: false, confirmLabel, danger: true, resolve: (v) => resolve(v !== null) }))
  }
  function promptDialog(title: string, placeholder?: string): Promise<string | null> {
    return new Promise((resolve) => setModal({ title, input: true, placeholder, confirmLabel: 'Add', danger: false, resolve }))
  }
  function closeModal(value: string | null) {
    modal?.resolve(value)
    setModal(null)
  }

  async function publish() {
    if (busy || publishing) return
    setPublishing(true)
    try {
      const res = await fetch('/workspace/publish', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setLiveUrl(data.url)
        setMessages((m) => [...m, { role: 'agent', text: data.deployed ? 'Your site is now live.' : 'Published — view it from the live link above.' }])
      } else {
        setMessages((m) => [...m, { role: 'agent', text: data.message ?? 'Could not publish.' }])
      }
    } catch {
      setMessages((m) => [...m, { role: 'agent', text: 'Could not publish.' }])
    } finally {
      setPublishing(false)
    }
  }

  async function undo() {
    if (busy || !current?.canUndo) return
    setBusy(true)
    try {
      const res = await fetch('/workspace/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: currentPageId }),
      })
      const data = await res.json()
      if (data.ok) {
        applyWorkspace(data.workspace)
        setLastUndo(null)
      }
    } catch {
    } finally {
      setBusy(false)
    }
  }

  // ---- Structural edits (add / delete / move sections + items) ----
  async function structOp(body: Record<string, unknown>) {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch('/workspace/structure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, pageId: currentPageId }),
      })
      const data = await res.json()
      if (data.ok) applyWorkspace(data.workspace)
      else setMessages((m) => [...m, { role: 'agent', text: data.message ?? 'Could not change the layout.' }])
    } catch {
    } finally {
      setBusy(false)
    }
  }
  const addSection = (type: string) => structOp({ op: 'add-section', type })
  const deleteSection = (index: number) => structOp({ op: 'delete-section', index })
  const moveSection = (index: number, dir: 'up' | 'down') => structOp({ op: 'move-section', index, dir })
  const addItem = (index: number) => structOp({ op: 'add-item', index })
  const deleteItem = (index: number, itemIndex: number) => structOp({ op: 'delete-item', index, itemIndex })

  // One discreet "⋯" menu per section: AI target, background image, move, delete.
  function sectionMenu(i: number, total: number, hasImage: boolean) {
    if (!editMode) return null
    return (
      <div onMouseEnter={() => setFocusedIndex(i)} style={{ position: 'absolute', top: 8, right: 8, zIndex: 3 }}>
        <KebabMenu
          onOpen={() => setFocusedIndex(i)}
          options={[
            { label: 'Edit with AI', onClick: () => targetSection(i) },
            { label: hasImage ? 'Change background image' : 'Add background image', onClick: () => pickImage(`layout.${i}.image`) },
            hasImage && { label: 'Remove background image', onClick: () => setImage(`layout.${i}.image`, null, true) },
            i > 0 && { label: 'Move up', onClick: () => moveSection(i, 'up') },
            i < total - 1 && { label: 'Move down', onClick: () => moveSection(i, 'down') },
            { label: 'Delete section', danger: true, onClick: async () => { if (await confirmDialog('Delete this section?')) deleteSection(i) } },
          ]}
        />
      </div>
    )
  }
  // One discreet "⋯" menu per item (feature/testimonial/product card): image, extras, delete.
  function itemMenu(i: number, j: number, hasImage: boolean, extra: MenuOption[] = []) {
    if (!editMode) return null
    return (
      <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 3 }}>
        <KebabMenu
          options={[
            { label: hasImage ? 'Change image' : 'Add image', onClick: () => pickImage(`layout.${i}.items.${j}.image`) },
            hasImage && { label: 'Remove image', onClick: () => setImage(`layout.${i}.items.${j}.image`, null, true) },
            ...extra,
            { label: 'Delete', danger: true, onClick: () => deleteItem(i, j) },
          ]}
        />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100%', fontFamily: 'system-ui, sans-serif', color: '#111' }}>
      {/* The command drawer (☰): launcher (New + History) + Publish. */}
      <Drawer open={drawerOpen} onClose={onCloseDrawer} title="Workspace">
        <DrawerLauncher
          mode={mode}
          history={history}
          activeConnectedId={activeConnectedId}
          busy={publishing}
          canEdit={canEdit}
          onCreate={onCreate}
          onConnect={onConnect}
          onOpenConnected={onOpenConnected}
        />
        {canEdit && (
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: '#999' }}>Builder — my site</div>
            <button
              onClick={publish}
              disabled={busy || publishing}
              title="Make the current version live"
              style={{ fontSize: 13, padding: '9px 14px', borderRadius: 6, border: 'none', background: publishing ? '#9ca3af' : '#16a34a', color: '#fff', fontWeight: 600, width: '100%', cursor: busy || publishing ? 'default' : 'pointer' }}
            >
              {publishing ? 'Publishing…' : 'Publish'}
            </button>
          </div>
        )}
        {profile}
      </Drawer>

      {/* Chat */}
      <div style={{ width: chatWidth, flex: 'none', display: 'flex', flexDirection: 'column', background: '#fafafa' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
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
              {m.badges && m.badges.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                  {m.badges.map((b, k) => (
                    <span
                      key={k}
                      style={{ fontSize: 11, padding: '2px 9px', borderRadius: 999, maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: m.role === 'you' ? 'rgba(255,255,255,0.22)' : '#eef2ff', color: m.role === 'you' ? '#fff' : '#2563eb' }}
                    >
                      {b.kind === 'section' ? 'Section: ' : ''}{b.label}
                    </span>
                  ))}
                </div>
              )}
              {m.text === TYPING ? <TypingDots /> : m.text}
            </div>
          ))}
        </div>
        {refImage && (
          <div style={{ padding: '8px 12px 0', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#555' }}>
            <span>Reference image for the AI: <strong>{refImage.name}</strong></span>
            <button onClick={() => setRefImage(null)} title="Remove" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#888' }}>✕</button>
          </div>
        )}
        {target && (
          <div style={{ padding: '8px 12px 0', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#1e40af' }}>
            <span>Editing the <strong>{target.label}</strong> section — your next message applies here</span>
            <button onClick={() => setTarget(null)} title="Clear target" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#888' }}>✕</button>
          </div>
        )}
        {canEdit ? (
        <div style={{ padding: 12, borderTop: '1px solid #e2e2e2' }}>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={uploadImage} style={{ display: 'none' }} />
          <input ref={refInputRef} type="file" accept="image/*" onChange={(e) => { setRefImage(e.target.files?.[0] ?? null); e.target.value = '' }} style={{ display: 'none' }} />
          {/* Single rounded composer: text on top, actions on the bottom row. */}
          <div style={{ border: '1px solid #ccc', borderRadius: 12, padding: 8, background: '#fff', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <textarea
              ref={chatRef}
              value={input}
              onChange={(e) => { setInput(e.target.value); autoGrow(e.target) }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              onPaste={onChatPaste}
              rows={1}
              placeholder="Describe a change…"
              disabled={busy}
              style={{ width: '100%', padding: '4px 6px', border: 'none', outline: 'none', fontSize: 14, resize: 'none', fontFamily: 'inherit', lineHeight: 1.4, maxHeight: 140, overflowY: 'hidden', background: 'transparent', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button
                onClick={() => refInputRef.current?.click()}
                disabled={busy}
                title="Attach a reference image for the AI (or paste one with Ctrl+V)"
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e2e2', background: refImage ? '#eef2ff' : '#fff', color: refImage ? '#2563eb' : '#475467', cursor: busy ? 'default' : 'pointer' }}
              >
                {AttachIcon}
              </button>
              <button
                onClick={send}
                disabled={busy}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: busy ? '#9ca3af' : '#2563eb', color: '#fff', fontSize: 14, cursor: busy ? 'default' : 'pointer' }}
              >
                {busy ? '…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
        ) : (
          <div style={{ padding: 14, borderTop: '1px solid #e2e2e2', fontSize: 13, color: '#888' }}>
            Viewing as operator — read-only. The tenant has not enabled operator editing.
          </div>
        )}
      </div>

      {/* Drag to resize the chat vs. preview split. */}
      <div
        onMouseDown={startResize}
        title="Drag to resize"
        style={{ width: 6, flex: 'none', cursor: 'col-resize', background: '#e2e2e2', borderRight: '1px solid #d4d4d4' }}
      />

      {/* Live preview of the draft */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff' }}>
        {/* Page switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: '1px solid #eee', flexWrap: 'wrap' }}>
          {pages.map((p) => {
            const active = p.id === currentPageId
            const isHome = p.route === '/'
            return (
              <span
                key={p.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  borderRadius: 6,
                  border: '1px solid ' + (active ? '#2563eb' : '#ccc'),
                  background: active ? '#2563eb' : '#fff',
                  overflow: 'hidden',
                }}
              >
                <button
                  onClick={() => switchPage(p.id)}
                  disabled={busy}
                  style={{
                    fontSize: 12,
                    padding: '4px 10px',
                    border: 'none',
                    background: 'transparent',
                    cursor: busy ? 'default' : 'pointer',
                    color: active ? '#fff' : '#333',
                  }}
                >
                  {p.navLabel}
                </button>
                {editMode && !isHome && (
                  <button
                    onClick={() => deletePage(p)}
                    disabled={busy}
                    title={`Delete the “${p.navLabel}” page`}
                    style={{
                      fontSize: 12,
                      lineHeight: 1,
                      padding: '4px 7px',
                      border: 'none',
                      borderLeft: '1px solid ' + (active ? 'rgba(255,255,255,0.4)' : '#e0e0e0'),
                      background: 'transparent',
                      cursor: busy ? 'default' : 'pointer',
                      color: active ? '#fff' : '#999',
                    }}
                  >
                    ×
                  </button>
                )}
              </span>
            )
          })}
          {editMode && (
            <button onClick={addPage} disabled={busy} title="Add a new page" style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px dashed #aaa', background: '#fafafa', cursor: busy ? 'default' : 'pointer' }}>
              + Add page
            </button>
          )}
          {/* live URL · Undo · Edit-mode toggle, right-aligned */}
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
            {liveUrl && (
              <a href={liveUrl} target="_blank" rel="noreferrer" title={liveUrl} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#16a34a', textDecoration: 'none', fontWeight: 600, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <span>● Live</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{liveUrl.replace(/^https?:\/\//, '')} ↗</span>
              </a>
            )}
            {editMode && (
              <button
                onClick={undo}
                disabled={busy || !current?.canUndo}
                title="Undo the last change to this page"
                style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', color: current?.canUndo ? '#333' : '#bbb', cursor: busy || !current?.canUndo ? 'default' : 'pointer' }}
              >
                ↶ Undo
              </button>
            )}
            {canEdit && <Switch on={editMode} onChange={() => setEditMode((v) => !v)} label="Edit mode" />}
          </span>
        </div>
        {/* Only the rendered page scrolls — the switcher and address bar stay put. */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {/* One-click revert after an image change */}
        {lastUndo && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 12px', background: '#fffbe6', borderBottom: '1px solid #f0e6a6', fontSize: 12, color: '#665c00' }}>
            <span>Image updated.</span>
            <span style={{ display: 'flex', gap: 8 }}>
              <button onClick={revertImage} disabled={busy} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 6, border: '1px solid #d4c95a', background: '#fff', cursor: busy ? 'default' : 'pointer' }}>
                Undo
              </button>
              <button onClick={() => setLastUndo(null)} title="Dismiss" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#998' }}>
                ✕
              </button>
            </span>
          </div>
        )}
        {current ? (
          <EditModeContext.Provider value={canEdit && editMode}>
          <div style={{ fontFamily: current.theme.font === 'serif' ? 'Georgia, "Times New Roman", serif' : 'system-ui, sans-serif' }}>
            {/* Site nav menu (shown once there's more than one page) */}
            {pages.length > 1 && (
              <nav style={{ display: 'flex', gap: 18, justifyContent: 'center', padding: '14px 24px', borderBottom: '1px solid #eee', flexWrap: 'wrap' }}>
                {pages.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => switchPage(p.id)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      fontSize: 15,
                      padding: 0,
                      fontWeight: p.id === currentPageId ? 700 : 500,
                      color: p.id === currentPageId ? current.theme.primaryColor : '#444',
                    }}
                  >
                    {p.navLabel}
                  </button>
                ))}
              </nav>
            )}
            {current.layout.length === 0 && (
              <p style={{ padding: 48, color: '#888' }}>Empty page — ask the AI to add a section (e.g. “add a hero and a features section”).</p>
            )}
            {current.layout.map((block, i) => {
              const accent = current.theme.primaryColor
              const bg = block.imageUrl
              const bgStyle = bg ? { backgroundImage: `url(${bg})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}
              const overlay = bg ? <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} /> : null
              if (block.type === 'hero') {
                return (
                  <section
                    key={i}
                    style={{
                      position: 'relative',
                      minHeight: bg ? 460 : undefined,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textAlign: 'center',
                      padding: '72px 48px',
                      ...bgStyle,
                    }}
                  >
                    {bg && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.38)' }} />}
                    {sectionMenu(i, current.layout.length, !!bg)}
                    <div style={{ position: 'relative', zIndex: 1 }}>
                      <h1 style={{ fontSize: 48, margin: '0 0 14px', color: bg ? '#fff' : '#111', textShadow: bg ? '0 2px 10px rgba(0,0,0,0.5)' : 'none' }}>
                        <Editable value={block.heading} placeholder="(heading)" fontSize={48} onSave={(v) => saveField(`layout.${i}.heading`, v)} />
                      </h1>
                      <p style={{ fontSize: 22, margin: 0, color: bg ? '#f3f3f3' : '#555', textShadow: bg ? '0 1px 6px rgba(0,0,0,0.5)' : 'none' }}>
                        <Editable value={block.subheading} placeholder="(subheading)" fontSize={22} onSave={(v) => saveField(`layout.${i}.subheading`, v)} />
                      </p>
                    </div>
                  </section>
                )
              }
              if (block.type === 'features') {
                return (
                  <section key={i} style={{ position: 'relative', padding: '56px 48px', textAlign: 'center', background: bg ? '#222' : '#fafafa', ...bgStyle }}>
                    {overlay}
                    {sectionMenu(i, current.layout.length, !!bg)}
                    <div style={{ position: 'relative', zIndex: 1 }}>
                      <h2 style={{ fontSize: 30, margin: '0 0 36px', color: bg ? '#fff' : '#111' }}>
                        <Editable value={block.heading} placeholder="(features heading)" fontSize={30} onSave={(v) => saveField(`layout.${i}.heading`, v)} />
                      </h2>
                      <div style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                        {block.items.map((it, j) => (
                          <div key={j} style={{ position: 'relative', flex: '1 1 220px', maxWidth: 280, background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: 24, overflow: 'hidden', textAlign: 'left' }}>
                            {it.imageUrl && <img src={it.imageUrl} alt="" style={{ width: 'calc(100% + 48px)', height: 150, objectFit: 'cover', display: 'block', margin: '-24px -24px 16px' }} />}
                            {itemMenu(i, j, !!it.imageUrl)}
                            <h3 style={{ fontSize: 18, margin: '0 0 8px' }}>
                              <Editable value={it.title} placeholder="(title)" fontSize={18} onSave={(v) => saveField(`layout.${i}.items.${j}.title`, v)} />
                            </h3>
                            <p style={{ fontSize: 14, color: '#666', margin: 0 }}>
                              <Editable value={it.text} placeholder="(text)" fontSize={14} onSave={(v) => saveField(`layout.${i}.items.${j}.text`, v)} />
                            </p>
                          </div>
                        ))}
                        {editMode && <button onClick={() => addItem(i)} disabled={busy} title="Add an item" style={{ alignSelf: 'center', padding: '12px 18px', borderRadius: 10, border: '1px dashed #bbb', background: 'rgba(255,255,255,0.85)', color: '#555', cursor: busy ? 'default' : 'pointer', fontSize: 14 }}>+ Add item</button>}
                      </div>
                    </div>
                  </section>
                )
              }
              if (block.type === 'products') {
                return (
                  <section key={i} style={{ position: 'relative', padding: '56px 48px', textAlign: 'center', background: bg ? '#222' : '#fff', ...bgStyle }}>
                    {overlay}
                    {sectionMenu(i, current.layout.length, !!bg)}
                    <div style={{ position: 'relative', zIndex: 1 }}>
                      <h2 style={{ fontSize: 30, margin: '0 0 36px', color: bg ? '#fff' : '#111' }}>
                        <Editable value={block.heading} placeholder="(products heading)" fontSize={30} onSave={(v) => saveField(`layout.${i}.heading`, v)} />
                      </h2>
                      <div style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                        {block.items.map((p, j) => (
                          <div key={j} style={{ position: 'relative', flex: '1 1 220px', maxWidth: 260, background: '#fff', border: '1px solid #eee', borderRadius: 12, overflow: 'hidden', textAlign: 'left', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                            <div style={{ position: 'relative' }}>
                              {p.imageUrl ? (
                                <img src={p.imageUrl} alt="" style={{ width: '100%', height: 180, objectFit: 'cover', display: 'block' }} />
                              ) : (
                                <div style={{ width: '100%', height: 180, background: '#f1f1f1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb', fontSize: 13 }}>No image</div>
                              )}
                              {p.badge && (
                                <span style={{ position: 'absolute', top: 10, left: 10, background: '#111', color: '#fff', fontSize: 12, fontWeight: 600, padding: '3px 8px', borderRadius: 6 }}>
                                  <Editable value={p.badge} placeholder="(badge)" fontSize={12} onSave={(v) => saveField(`layout.${i}.items.${j}.badge`, v)} />
                                </span>
                              )}
                              {itemMenu(i, j, !!p.imageUrl, [
                                !p.price && { label: 'Add price', onClick: () => saveField(`layout.${i}.items.${j}.price`, '0') },
                                !p.badge && { label: 'Add badge', onClick: () => saveField(`layout.${i}.items.${j}.badge`, '-10%') },
                                !p.buttonLabel && { label: 'Add button', onClick: () => saveField(`layout.${i}.items.${j}.buttonLabel`, 'Buy now') },
                              ])}
                            </div>
                            <div style={{ padding: 16 }}>
                              <h3 style={{ fontSize: 16, margin: '0 0 6px', color: '#111' }}>
                                <Editable value={p.name} placeholder="(product name)" fontSize={16} onSave={(v) => saveField(`layout.${i}.items.${j}.name`, v)} />
                              </h3>
                              <p style={{ fontSize: 13, color: '#666', margin: '0 0 12px', lineHeight: 1.5 }}>
                                <Editable value={p.description} placeholder="(description)" fontSize={13} onSave={(v) => saveField(`layout.${i}.items.${j}.description`, v)} />
                              </p>
                              {(p.price || p.oldPrice) && (
                                <div style={{ fontSize: 15, marginBottom: p.buttonLabel ? 12 : 0, display: 'flex', gap: 8, alignItems: 'baseline' }}>
                                  {p.price && (
                                    <span style={{ fontWeight: 700, color: '#111' }}>
                                      <Editable value={p.price} placeholder="(price)" fontSize={15} onSave={(v) => saveField(`layout.${i}.items.${j}.price`, v)} />
                                    </span>
                                  )}
                                  {p.oldPrice && (
                                    <span style={{ color: '#aaa', textDecoration: 'line-through', fontSize: 13 }}>
                                      <Editable value={p.oldPrice} placeholder="(old price)" fontSize={13} onSave={(v) => saveField(`layout.${i}.items.${j}.oldPrice`, v)} />
                                    </span>
                                  )}
                                </div>
                              )}
                              {p.buttonLabel && (
                                <span style={{ display: 'block', textAlign: 'center', padding: '10px 0', borderRadius: 8, background: accent, color: '#fff', fontSize: 13, fontWeight: 600 }}>
                                  <Editable value={p.buttonLabel} placeholder="(button)" fontSize={13} onSave={(v) => saveField(`layout.${i}.items.${j}.buttonLabel`, v)} />
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                        {editMode && <button onClick={() => addItem(i)} disabled={busy} title="Add a product" style={{ alignSelf: 'center', padding: '12px 18px', borderRadius: 10, border: '1px dashed #bbb', background: '#fafafa', color: '#555', cursor: busy ? 'default' : 'pointer', fontSize: 14 }}>+ Add product</button>}
                      </div>
                    </div>
                  </section>
                )
              }
              if (block.type === 'testimonials') {
                return (
                  <section key={i} style={{ position: 'relative', padding: '56px 48px', textAlign: 'center', background: bg ? '#222' : '#fff', ...bgStyle }}>
                    {overlay}
                    {sectionMenu(i, current.layout.length, !!bg)}
                    <div style={{ position: 'relative', zIndex: 1 }}>
                      <h2 style={{ fontSize: 30, margin: '0 0 36px', color: bg ? '#fff' : '#111' }}>
                        <Editable value={block.heading} placeholder="(testimonials heading)" fontSize={30} onSave={(v) => saveField(`layout.${i}.heading`, v)} />
                      </h2>
                      <div style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                        {block.items.map((t, j) => (
                          <div key={j} style={{ position: 'relative', flex: '1 1 240px', maxWidth: 300, background: '#fafafa', border: '1px solid #eee', borderRadius: 10, padding: 24 }}>
                            {itemMenu(i, j, !!t.imageUrl)}
                            {t.imageUrl && <img src={t.imageUrl} alt="" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', display: 'block', margin: '0 auto 10px' }} />}
                            <p style={{ fontSize: 15, fontStyle: 'italic', color: '#444', margin: '0 0 12px' }}>
                              “<Editable value={t.quote} placeholder="(quote)" fontSize={15} onSave={(v) => saveField(`layout.${i}.items.${j}.quote`, v)} />”
                            </p>
                            <p style={{ fontSize: 13, fontWeight: 600, color: accent, margin: 0 }}>
                              — <Editable value={t.author} placeholder="(author)" fontSize={13} onSave={(v) => saveField(`layout.${i}.items.${j}.author`, v)} />
                            </p>
                          </div>
                        ))}
                        {editMode && <button onClick={() => addItem(i)} disabled={busy} title="Add a testimonial" style={{ alignSelf: 'center', padding: '12px 18px', borderRadius: 10, border: '1px dashed #bbb', background: '#fafafa', color: '#555', cursor: busy ? 'default' : 'pointer', fontSize: 14 }}>+ Add item</button>}
                      </div>
                    </div>
                  </section>
                )
              }
              if (block.type === 'cta') {
                return (
                  <section key={i} style={{ position: 'relative', padding: '64px 48px', textAlign: 'center', background: '#111', color: '#fff', ...bgStyle }}>
                    {overlay}
                    {sectionMenu(i, current.layout.length, !!bg)}
                    <div style={{ position: 'relative', zIndex: 1 }}>
                      <h2 style={{ fontSize: 30, margin: '0 0 22px', color: '#fff' }}>
                        <Editable value={block.heading} placeholder="(cta heading)" fontSize={30} onSave={(v) => saveField(`layout.${i}.heading`, v)} />
                      </h2>
                      <span style={{ display: 'inline-block', padding: '12px 28px', borderRadius: 8, background: accent, color: '#fff', fontSize: 16 }}>
                        <Editable value={block.buttonLabel} placeholder="(button)" fontSize={16} onSave={(v) => saveField(`layout.${i}.buttonLabel`, v)} />
                      </span>
                    </div>
                  </section>
                )
              }
              if (block.type === 'contact') {
                return (
                  <section key={i} style={{ position: 'relative', padding: '64px 48px', textAlign: 'center', background: bg ? '#222' : '#fafafa', ...bgStyle }}>
                    {overlay}
                    {sectionMenu(i, current.layout.length, !!bg)}
                    <div style={{ position: 'relative', zIndex: 1 }}>
                      <h2 style={{ fontSize: 30, margin: '0 0 14px', color: bg ? '#fff' : '#111' }}>
                        <Editable value={block.heading} placeholder="(contact heading)" fontSize={30} onSave={(v) => saveField(`layout.${i}.heading`, v)} />
                      </h2>
                      <p style={{ fontSize: 16, color: bg ? '#eee' : '#555', margin: '0 0 24px' }}>
                        <Editable value={block.text} placeholder="(contact text)" fontSize={16} onSave={(v) => saveField(`layout.${i}.text`, v)} />
                      </p>
                      <span style={{ display: 'inline-block', padding: '12px 28px', borderRadius: 8, background: accent, color: '#fff', fontSize: 16 }}>
                        <Editable value={block.buttonLabel} placeholder="(button)" fontSize={16} onSave={(v) => saveField(`layout.${i}.buttonLabel`, v)} />
                      </span>
                    </div>
                  </section>
                )
              }
              return (
                <section key={i} style={{ position: 'relative', padding: '48px', textAlign: 'center', background: bg ? '#222' : undefined, ...bgStyle }}>
                  {overlay}
                  {sectionMenu(i, current.layout.length, !!bg)}
                  <div style={{ position: 'relative', zIndex: 1 }}>
                    <h2 style={{ fontSize: 28, margin: '0 0 14px', color: bg ? '#fff' : '#111' }}>
                      <Editable value={block.heading} placeholder="(heading)" fontSize={28} onSave={(v) => saveField(`layout.${i}.heading`, v)} />
                    </h2>
                    <p style={{ fontSize: 16, color: bg ? '#eee' : '#555', maxWidth: 680, margin: '0 auto', lineHeight: 1.6 }}>
                      <Editable value={block.body} placeholder="(text)" fontSize={16} onSave={(v) => saveField(`layout.${i}.body`, v)} />
                    </p>
                  </div>
                </section>
              )
            })}
            {/* Add a section */}
            {editMode && (
            <div style={{ padding: '28px 24px 48px', textAlign: 'center', borderTop: '1px dashed #e2e2e2', background: '#fafafa' }}>
              <div style={{ fontSize: 13, color: '#888', marginBottom: 10 }}>Add a section</div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                {SECTION_CHOICES.map((c) => (
                  <button
                    key={c.type}
                    onClick={() => addSection(c.type)}
                    disabled={busy}
                    style={{ fontSize: 13, padding: '8px 14px', borderRadius: 8, border: '1px solid #ccc', background: '#fff', cursor: busy ? 'default' : 'pointer' }}
                  >
                    + {c.label}
                  </button>
                ))}
              </div>
            </div>
            )}
          </div>
          </EditModeContext.Provider>
        ) : (
          <p style={{ padding: 48, color: '#888' }}>No page yet.</p>
        )}
        </div>
      </div>

      {/* Themed confirm / prompt dialog */}
      {modal && (
        <div
          onClick={() => closeModal(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: 380, maxWidth: '90vw', background: '#fff', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', padding: 24 }}
          >
            <div style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: modal.input ? 14 : 22 }}>{modal.title}</div>
            {modal.input && (
              <input
                ref={modalInputRef}
                autoFocus
                placeholder={modal.placeholder}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') closeModal(modalInputRef.current?.value ?? '')
                  if (e.key === 'Escape') closeModal(null)
                }}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, marginBottom: 20, boxSizing: 'border-box' }}
              />
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => closeModal(null)}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', color: '#374151', fontSize: 14, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => closeModal(modal.input ? (modalInputRef.current?.value ?? '') : 'ok')}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: modal.danger ? '#dc2626' : '#2563eb', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >
                {modal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const SECTION_CHOICES: { type: string; label: string }[] = [
  { type: 'hero', label: 'Hero' },
  { type: 'features', label: 'Features' },
  { type: 'products', label: 'Products' },
  { type: 'testimonials', label: 'Testimonials' },
  { type: 'cta', label: 'Call to action' },
  { type: 'contact', label: 'Contact' },
  { type: 'richText', label: 'Text' },
]

const SECTION_LABEL: Record<string, string> = {
  hero: 'Hero',
  features: 'Features',
  products: 'Products',
  testimonials: 'Testimonials',
  cta: 'Call to action',
  contact: 'Contact',
  richText: 'Text',
}

type MenuOption = { label: string; danger?: boolean; onClick: () => void } | null | false

const DotsIcon = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <circle cx="8" cy="3" r="1.5" />
    <circle cx="8" cy="8" r="1.5" />
    <circle cx="8" cy="13" r="1.5" />
  </svg>
)
const AttachIcon = (
  <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
    <path d="M13.5 7.5l-5 5a2 2 0 002.9 2.8l5-5a3.5 3.5 0 00-5-5l-5.2 5.2a5 5 0 007 7l1.3-1.2" />
  </svg>
)

function MenuRow({ label, danger, onClick }: { label: string; danger?: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '7px 14px',
        fontSize: 13,
        border: 'none',
        background: hover ? '#f3f4f6' : 'transparent',
        color: danger ? '#b42318' : '#1f2937',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}

/** A discreet "⋯" button that opens a small options menu; closes on outside click. */
function KebabMenu({ options, onOpen }: { options: MenuOption[]; onOpen?: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  const rows = options.filter(Boolean) as { label: string; danger?: boolean; onClick: () => void }[]
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => { onOpen?.(); setOpen((o) => !o) }}
        title="Options"
        style={{ width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.96)', color: '#475467', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }}
      >
        {DotsIcon}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 32, right: 0, minWidth: 180, background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 10px 28px rgba(0,0,0,0.16)', padding: '4px 0', zIndex: 30 }}>
          {rows.map((r, k) => (
            <MenuRow key={k} label={r.label} danger={r.danger} onClick={() => { setOpen(false); r.onClick() }} />
          ))}
        </div>
      )}
    </div>
  )
}

/** Minimal iOS-style on/off switch. */
export function Switch({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button onClick={onChange} title={label} style={{ display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}>
      <span style={{ fontSize: 12, color: '#475467', fontWeight: 500 }}>{label}</span>
      <span style={{ position: 'relative', width: 38, height: 22, borderRadius: 999, background: on ? '#2563eb' : '#cbd5e1', transition: 'background .15s', display: 'inline-block' }}>
        <span style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.3)', transition: 'left .15s' }} />
      </span>
    </button>
  )
}

/** Click-to-edit text: shows the value; click turns it into an input that saves on Enter/blur. */
function Editable({
  value,
  placeholder,
  fontSize,
  onSave,
}: {
  value: string
  placeholder: string
  fontSize: number
  onSave: (v: string) => void
}) {
  const editable = useContext(EditModeContext)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const commit = () => {
    setEditing(false)
    if (draft !== value) onSave(draft)
  }

  // Read-only preview: just render the text, no edit affordance.
  if (!editable) return <>{value}</>

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(false)
        }}
        style={{ fontSize, font: 'inherit', textAlign: 'center', border: '1px solid #2563eb', borderRadius: 6, padding: '2px 10px', width: '85%' }}
      />
    )
  }
  return (
    <span
      onClick={() => {
        setDraft(value)
        setEditing(true)
      }}
      title="Click to edit"
      style={{ cursor: 'text', borderBottom: '1px dashed #c4c4c4' }}
    >
      {value || placeholder}
    </span>
  )
}
