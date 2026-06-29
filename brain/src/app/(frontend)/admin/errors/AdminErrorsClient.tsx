'use client'

import { useMemo, useState } from 'react'

import type { ErrorLogDto } from '@/operator/errorLog'

/** Short badge label + a fuller plain-English description of what the tenant was doing. */
const ACTION_LABEL: Record<string, string> = {
  connect_site: 'Connect site',
  publish: 'Publish',
  publish_workspace: 'Publish (builder)',
  delete_site: 'Delete site',
  edit_content: 'AI edit',
  edit_connected: 'AI edit',
  create_page: 'Create page',
  delete_page: 'Delete page',
  generate_section: 'AI: section',
  generate_page: 'AI: page',
  edit_element: 'Edit button/link',
  edit_item: 'Edit item',
  edit_structure: 'Edit section',
  set_value: 'Save edit',
  ai_chat: 'AI chat',
}
const ACTION_DESC: Record<string, string> = {
  connect_site: 'Clone & connect an external website',
  publish: 'Deploy the live site to Cloudflare',
  publish_workspace: 'Publish the builder site',
  delete_site: 'Remove a connected site',
  edit_content: 'Ask the AI to edit the page',
  edit_connected: 'Ask the AI to edit the connected site',
  create_page: 'Add a new page',
  delete_page: 'Remove a page',
  generate_section: 'Generate a new section with AI',
  generate_page: 'Generate a new page with AI',
  edit_element: 'Add / change / remove a button or link',
  edit_item: 'Reorder, duplicate or remove an item',
  edit_structure: 'Move or delete a section',
  set_value: 'Save a text or image edit',
  ai_chat: 'Edit the site by chat (AI)',
}
const label = (a: string) => ACTION_LABEL[a] ?? a
const desc = (a: string) => ACTION_DESC[a] ?? ''

const fmt = (iso: string) => {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

const cell: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid #eef2f7', verticalAlign: 'top', fontSize: 13, textAlign: 'left' }
const th: React.CSSProperties = { ...cell, fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap', background: '#f8fafc' }

export function AdminErrorsClient({ errors }: { errors: ErrorLogDto[] }) {
  const [tenant, setTenant] = useState<string>('all')

  const tenants = useMemo(() => {
    const m = new Map<number, string>()
    for (const e of errors) if (e.tenantId != null) m.set(e.tenantId, e.tenantName)
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [errors])

  const rows = useMemo(
    () => (tenant === 'all' ? errors : errors.filter((e) => String(e.tenantId) === tenant)),
    [errors, tenant],
  )

  return (
    <div style={{ padding: '24px 28px 60px', maxWidth: 1100, margin: '0 auto', fontFamily: 'system-ui, sans-serif', color: '#111' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Error log</h1>
        <span style={{ color: '#64748b', fontSize: 13 }}>{rows.length} of {errors.length} shown</span>
        <label style={{ marginLeft: 'auto', fontSize: 13, color: '#475569', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          Tenant
          <select value={tenant} onChange={(e) => setTenant(e.target.value)} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}>
            <option value="all">All tenants</option>
            {tenants.map(([id, name]) => (
              <option key={id} value={String(id)}>{name}</option>
            ))}
          </select>
        </label>
      </div>

      <p style={{ color: '#64748b', fontSize: 13, marginTop: 0 }}>
        What a tenant tried to do and why it failed — connect / publish / page-create / AI errors. Most recent first.
      </p>

      <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr>
              <th style={th}>When</th>
              <th style={th}>Tenant</th>
              <th style={th}>Tried to</th>
              <th style={th}>Why it failed</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td style={{ ...cell, color: '#64748b' }} colSpan={4}>No errors recorded. 🎉</td>
              </tr>
            )}
            {rows.map((e) => (
              <tr key={e.id}>
                {/* Dates format per-locale → the server (en-GB) and browser (en-US) can differ;
                    suppress the hydration warning and let the client value win. */}
                <td suppressHydrationWarning style={{ ...cell, whiteSpace: 'nowrap', color: '#64748b' }}>{fmt(e.createdAt)}</td>
                <td style={{ ...cell, fontWeight: 600 }}>{e.tenantName}</td>
                <td style={{ ...cell, minWidth: 220 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: '#fef2f2', color: '#b91c1c', fontSize: 12, fontWeight: 600 }}>{label(e.action)}</span>
                    {e.source === 'task' && <span title="A background task (connect/publish/delete)" style={{ padding: '1px 7px', borderRadius: 999, background: '#eef2ff', color: '#3730a3', fontSize: 11, fontWeight: 600 }}>task</span>}
                    {e.siteId != null && <span style={{ color: '#94a3b8', fontSize: 12 }}>site #{e.siteId}</span>}
                  </div>
                  {desc(e.action) && <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>{desc(e.action)}</div>}
                </td>
                <td style={{ ...cell, minWidth: 280 }}>
                  <div style={{ color: '#334155' }}>{e.message}</div>
                  {e.detail && <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{e.detail}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
