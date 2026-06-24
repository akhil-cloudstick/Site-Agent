import React from 'react'

/**
 * Injected into Payload's admin nav (via admin.components.beforeNavLinks) so an operator
 * inside the CMS can get back to the SiteAgent operator dashboard. A plain anchor (full
 * navigation) because /admin is a different app surface from the Payload SPA.
 */
export function BackToAdminLink() {
  return (
    <a
      href="/admin"
      style={{
        display: 'block',
        padding: '8px 0',
        marginBottom: 6,
        color: 'var(--theme-elevation-800)',
        textDecoration: 'none',
        fontWeight: 600,
      }}
    >
      ← Back to SiteAgent admin
    </a>
  )
}
