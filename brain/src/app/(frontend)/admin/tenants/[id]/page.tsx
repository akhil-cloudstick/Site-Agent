import { headers as nextHeaders } from 'next/headers'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { getSessionUser } from '@/auth/session'
import { loadTenantDetail } from '@/operator/dashboard'
import { loadOperatorErrors } from '@/operator/errorLog'

import { EnterButton } from '../../EnterButton'
import { TenantAdminPanel } from './TenantAdminPanel'

export const dynamic = 'force-dynamic'

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  active: { bg: '#dcfce7', fg: '#166534' },
  provisioning: { bg: '#fef9c3', fg: '#854d0e' },
  suspended: { bg: '#fee2e2', fg: '#991b1b' },
  failed: { bg: '#fee2e2', fg: '#991b1b' },
}

function Card({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div title={hint} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px', minWidth: 130, cursor: hint ? 'help' : 'default' }}>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#64748b' }}>{label}{hint && <span style={{ color: '#cbd5e1' }}> ⓘ</span>}</div>
    </div>
  )
}

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tenantId = Number(id)
  const user = await getSessionUser((await nextHeaders()) as unknown as Headers)
  const detail = Number.isInteger(tenantId) ? await loadTenantDetail(user, tenantId) : null
  if (!detail) notFound()
  const recentErrors = await loadOperatorErrors(user, { tenantId, limit: 15 }).catch(() => [])

  const c = STATUS_COLORS[detail.status] ?? { bg: '#eef2ff', fg: '#3730a3' }
  const th: React.CSSProperties = { textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: '#94a3b8', padding: '0 12px 8px', fontWeight: 600 }
  const td: React.CSSProperties = { padding: '12px', fontSize: 14, borderTop: '1px solid #eef2f7' }

  return (
    <div style={{ padding: '24px 28px 60px', maxWidth: 1000, margin: '0 auto' }}>
      <Link href="/admin" style={{ fontSize: 13, color: '#2563eb', textDecoration: 'none' }}>← All tenants</Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '12px 0 4px', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>{detail.name}</h1>
        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: c.bg, color: c.fg, fontWeight: 600 }}>{detail.status}</span>
        {detail.planLabel && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: '#eef2ff', color: '#3730a3', fontWeight: 600 }}>{detail.planLabel}</span>}
        <span style={{ marginLeft: 'auto' }}><EnterButton tenantId={detail.id} label="Enter workspace →" /></span>
      </div>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>/{detail.slug}</div>

      <TenantAdminPanel tenantId={detail.id} slug={detail.slug} status={detail.status} planLabel={detail.planLabel} />
      {/* {detail.liveUrl && (
        <div style={{ fontSize: 13, marginBottom: 16 }}>
          Live: <a href={detail.liveUrl} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>{detail.liveUrl}</a>
        </div>
      )} */}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '8px 0 18px' }}>
        <Card label="Members" value={detail.members} />
        <Card label="Built pages" value={detail.builtPages} />
        <Card label="Connected sites" value={detail.sites.length} />
        <Card label="Published" value={detail.publishedSites} />
        <Card label="Active jobs" value={detail.activeJobs} />
        <Card label="Operator edit" value={detail.allowOperatorEdit ? 'On' : 'Off'} />
      </div>

      <h2 style={{ fontSize: 16, margin: '0 0 4px' }}>Usage</h2>
      <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 8px' }}>Live counts (hover a card for what it measures). “30d” = the last 30 days.</p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '0 0 24px' }}>
        <Card label="Media files" value={detail.usage.mediaCount} hint="Images this tenant has uploaded (across the builder and connected sites)." />
        <Card label="Storage (MB)" value={detail.usage.storageMb} hint="Total size of those uploaded images, in megabytes." />
        <Card label="Publishes (total)" value={detail.usage.publishedTotal} hint="Successful connected-site publishes to Cloudflare, all time (counts publish jobs that finished OK)." />
        <Card label="Publishes (30d)" value={detail.usage.published30d} hint="Successful connected-site publishes in the last 30 days." />
        <Card label="Tasks done (30d)" value={detail.usage.jobsDone30d} hint="Background operations (connect / publish / delete a connected site) that completed in the last 30 days." />
        <Card label="Tasks failed (30d)" value={detail.usage.jobsFailed30d} hint="Background operations that failed in the last 30 days." />
        <Card label="Errors (30d)" value={detail.usage.errors30d} hint="Failures this tenant hit (AI/connect/publish/page errors) in the last 30 days — listed on the Errors page." />
      </div>

      <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>Sites</h2>
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 8px 8px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
          <thead>
            <tr>
              <th style={th}>Type</th>
              <th style={th}>Site</th>
              <th style={th}>Origin</th>
              <th style={th}>Pages</th>
              <th style={th}>Status</th>
              <th style={th}>Live</th>
            </tr>
          </thead>
          <tbody>
            {detail.builtPages === 0 && detail.sites.length === 0 && (
              <tr><td style={td} colSpan={6}>No sites yet.</td></tr>
            )}
            {detail.builtPages > 0 && (
              <tr>
                <td style={td}><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: '#eef2ff', color: '#3730a3', fontWeight: 600 }}>Builder</span></td>
                <td style={td}>Built site</td>
                <td style={{ ...td, color: '#94a3b8' }}>—</td>
                <td style={td}>{detail.builtPages}</td>
                <td style={td}>{detail.liveUrl ? 'published' : 'draft'}</td>
                <td style={td}>{detail.liveUrl ? <a href={detail.liveUrl} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>open ↗</a> : '—'}</td>
              </tr>
            )}
            {detail.sites.map((s) => (
              <tr key={s.id}>
                <td style={td}><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: '#dcfce7', color: '#166534', fontWeight: 600 }}>Connected</span></td>
                <td style={td}>{s.name}</td>
                <td style={{ ...td, color: '#64748b' }}>{s.originUrl || '—'}</td>
                <td style={td}>{s.pages}</td>
                <td style={td}>{s.status}</td>
                <td style={td}>{s.liveUrl ? <a href={s.liveUrl} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>open ↗</a> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '28px 0 8px' }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Recent errors</h2>
        {recentErrors.length > 0 && <Link href="/admin/errors" style={{ fontSize: 13, color: '#2563eb', textDecoration: 'none' }}>All errors →</Link>}
      </div>
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '8px 8px 4px' }}>
        {recentErrors.length === 0 ? (
          <div style={{ ...td, color: '#64748b', borderTop: 'none' }}>No errors recorded. 🎉</div>
        ) : (
          recentErrors.map((e) => (
            <div key={e.id} style={{ display: 'flex', gap: 12, padding: '8px 10px', borderTop: '1px solid #eef2f7', fontSize: 13, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ color: '#94a3b8', minWidth: 140 }}>{e.createdAt ? new Date(e.createdAt).toLocaleString() : ''}</span>
              <span style={{ padding: '1px 7px', borderRadius: 999, background: '#fef2f2', color: '#b91c1c', fontWeight: 600, fontSize: 12 }}>{e.action}</span>
              <span style={{ color: '#334155' }}>{e.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
