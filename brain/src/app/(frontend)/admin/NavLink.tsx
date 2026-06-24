'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

/** Sidebar nav as a button (with active + hover state). */
export function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname()
  const [hover, setHover] = useState(false)
  const active = href === '/admin' ? pathname === '/admin' || pathname.startsWith('/admin/tenants') : pathname.startsWith(href)

  return (
    <Link
      href={href}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'block',
        padding: '5px 12px',
        marginBottom: 4,
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        textDecoration: 'none',
        color: active ? '#fff' : '#334155',
        background: active ? '#2563eb' : hover ? '#eef2f7' : '#f8fafc',
        border: '1px solid',
        borderColor: active ? '#2563eb' : '#e2e8f0',
        transition: 'background .12s',
      }}
    >
      {label}
    </Link>
  )
}
