'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import type { PreviewDto } from '@/workspace/types'

interface Msg {
  role: 'you' | 'agent'
  text: string
}

const CHAT_KEY = 'siteagent.workspace.chat'
const GREETING: Msg = {
  role: 'agent',
  text: 'Hi! Tell me a change in plain English — e.g. "change the hero heading to Summer Sale".',
}

export function WorkspaceClient({ userEmail, preview: initialPreview }: { userEmail: string; preview: PreviewDto | null }) {
  const router = useRouter()
  const [messages, setMessages] = useState<Msg[]>([GREETING])
  const [preview, setPreview] = useState<PreviewDto | null>(initialPreview)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)

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
    if (!text || busy) return
    setInput('')
    setBusy(true)
    setMessages((m) => [...m, { role: 'you', text }, { role: 'agent', text: 'Thinking…' }])
    try {
      const res = await fetch('/workspace/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
      const data = await res.json()
      setMessages((m) => [...m.slice(0, -1), { role: 'agent', text: data.message ?? 'Done.' }])
      if (data.ok && data.preview) setPreview(data.preview) // update preview without a refresh
    } catch {
      setMessages((m) => [...m.slice(0, -1), { role: 'agent', text: 'Something went wrong — nothing was changed.' }])
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    try {
      await fetch('/workspace/logout', { method: 'POST' })
    } catch {}
    try {
      sessionStorage.removeItem(CHAT_KEY)
    } catch {}
    router.refresh()
  }

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif', color: '#111' }}>
      {/* Chat */}
      <div style={{ width: '38%', minWidth: 320, borderRight: '1px solid #e2e2e2', display: 'flex', flexDirection: 'column', background: '#fafafa' }}>
        <header style={{ padding: '10px 16px', borderBottom: '1px solid #e2e2e2', fontSize: 13, color: '#555', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>
            Signed in as <strong>{userEmail}</strong>
          </span>
          <button onClick={signOut} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}>
            Sign out
          </button>
        </header>
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
              {m.text}
            </div>
          ))}
        </div>
        <div style={{ padding: 12, borderTop: '1px solid #e2e2e2', display: 'flex', gap: 8 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Describe a change…"
            disabled={busy}
            style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #ccc', fontSize: 14 }}
          />
          <button
            onClick={send}
            disabled={busy}
            style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: busy ? '#9ca3af' : '#2563eb', color: '#fff', fontSize: 14, cursor: busy ? 'default' : 'pointer' }}
          >
            {busy ? '…' : 'Send'}
          </button>
        </div>
      </div>

      {/* Live preview of the draft */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#fff' }}>
        <div style={{ padding: '6px 16px', fontSize: 12, color: '#888', borderBottom: '1px solid #eee' }}>Live preview (draft)</div>
        {preview ? (
          <section style={{ padding: '64px 48px', textAlign: 'center' }}>
            <h1 style={{ fontSize: 44, margin: '0 0 12px' }}>{preview.heading || '(no heading)'}</h1>
            <p style={{ fontSize: 20, color: '#555', margin: 0 }}>{preview.subheading}</p>
          </section>
        ) : (
          <p style={{ padding: 48, color: '#888' }}>No page yet.</p>
        )}
      </div>
    </div>
  )
}
