import Link from 'next/link'

import './styles.css'

export default function HomePage() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, color: '#111' }}>
      <h1 style={{ margin: 0 }}>SiteAgent</h1>
      <p style={{ color: '#555', margin: 0 }}>Edit your website by chatting with an AI.</p>
      <div style={{ display: 'flex', gap: 12 }}>
        <Link href="/workspace" style={{ padding: '10px 18px', borderRadius: 8, background: '#2563eb', color: '#fff', textDecoration: 'none' }}>
          Open your workspace
        </Link>
        {/* Payload admin is a separate app surface, so a plain anchor is intentional. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/admin" style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #ccc', color: '#111', textDecoration: 'none' }}>
          Admin
        </a>
      </div>
    </main>
  )
}
