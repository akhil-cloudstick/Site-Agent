'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function LoginForm({ notice }: { notice?: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (data.ok) router.refresh()
      else setError(data.message ?? 'Login failed.')
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: '#fafafa' }}>
      <form onSubmit={submit} style={{ width: 320, padding: 28, background: '#fff', border: '1px solid #e2e2e2', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ margin: '0 0 4px' }}>Sign in</h2>
        {notice && <div style={{ background: '#fef2f2', color: '#991b1b', fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid #fecaca' }}>{notice}</div>}
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" autoComplete="username" style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #ccc' }} />
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" autoComplete="current-password" style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #ccc' }} />
        {error && <div style={{ color: '#dc2626', fontSize: 13 }}>{error}</div>}
        <button type="submit" disabled={busy} style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: busy ? '#9ca3af' : '#2563eb', color: '#fff', cursor: busy ? 'default' : 'pointer' }}>
          {busy ? '…' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}
