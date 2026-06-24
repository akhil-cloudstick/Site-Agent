'use client'

import { useState } from 'react'

import { ConnectedEditor, type ConnectedSiteSummary } from './ConnectedEditor'
import { DrawerProfile } from './DrawerProfile'
import { WorkspaceClient } from './WorkspaceClient'

export interface Impersonation {
  tenantName: string
  canEdit: boolean
}

/**
 * One workspace. A left off-canvas drawer (opened with ☰) is the command center: it
 * launches Connect a website / Create from scratch, reopens anything from History, and —
 * for a connected site — holds Publish / Roll back / Remove / Cloudflare / Git-pull. Both
 * the block builder and the connected editor render in the same shell below the top bar.
 */
export function UnifiedWorkspace({
  userEmail,
  workspace,
  initialLiveUrl,
  connectedSites,
  initialConnectedId = null,
  initialView = null,
  impersonating = null,
  initialAllowOperatorEdit = false,
}: {
  userEmail: string
  workspace: any
  initialLiveUrl: any
  connectedSites: ConnectedSiteSummary[]
  initialConnectedId?: number | null
  initialView?: 'builder' | null
  impersonating?: Impersonation | null
  initialAllowOperatorEdit?: boolean
}) {
  // Which view to open on load (URL-driven, so a refresh stays put): a connected site if
  // ?site matched, the builder if ?view=builder, else first-run (nothing connected) lands
  // on the empty Connect page with the drawer open.
  const initialMode: 'block' | 'connected' = initialConnectedId
    ? 'connected'
    : initialView === 'builder'
      ? 'block'
      : connectedSites.length === 0
        ? 'connected'
        : 'block'
  const isFirstRun = !initialConnectedId && initialView !== 'builder' && connectedSites.length === 0

  const [mode, setMode] = useState<'block' | 'connected'>(initialMode)
  const [drawerOpen, setDrawerOpen] = useState(isFirstRun)
  const [allowEdit, setAllowEdit] = useState(Boolean(initialAllowOperatorEdit))
  const [history, setHistory] = useState(connectedSites)
  const [activeConnectedId, setActiveConnectedId] = useState<number | null>(initialConnectedId ?? connectedSites[0]?.id ?? null)
  const [connectSignal, setConnectSignal] = useState(0)

  // Operators impersonating view-only can't edit — hide the drawer's write actions (the
  // routes 403 too; this is just cosmetic). Normal tenants always can.
  const canEdit = impersonating ? impersonating.canEdit : true

  async function signOut() {
    await fetch('/logout', { method: 'POST' }).catch(() => {})
    window.location.href = '/'
  }
  async function toggleAllowEdit() {
    const next = !allowEdit
    setAllowEdit(next)
    const res = await fetch('/workspace/allow-operator-edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allow: next }),
    }).catch(() => null)
    if (!res || !res.ok) setAllowEdit(!next)
  }

  const avatarInitial = (userEmail?.[0] ?? '?').toUpperCase()
  // The account menu now lives at the bottom of the drawer (it used to be a top-right
  // dropdown). Built here because the toggle/logout state lives in this component.
  const drawerProfile = (
    <DrawerProfile
      userEmail={userEmail}
      impersonating={Boolean(impersonating)}
      allowEdit={allowEdit}
      onToggleAllowEdit={toggleAllowEdit}
      onSignOut={signOut}
    />
  )

  // Keep ?site=<name>-<id> (a connected site) or ?view=builder in the URL so a refresh
  // reopens the same view. The two are mutually exclusive.
  function syncUrl(id: number | null, view: 'builder' | null) {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (id) {
      const name = history.find((s) => s.id === id)?.name ?? 'site'
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'site'
      url.searchParams.set('site', `${slug}-${id}`)
      url.searchParams.delete('view')
    } else {
      url.searchParams.delete('site')
      if (view === 'builder') url.searchParams.set('view', 'builder')
      else url.searchParams.delete('view')
    }
    window.history.replaceState(null, '', url.toString())
  }

  const closeDrawer = () => setDrawerOpen(false)

  function openConnect() {
    // Switch to the connected editor and pop its connect form — keep the drawer OPEN (the
    // form lives inside it).
    setMode('connected')
    setConnectSignal((n) => n + 1)
  }
  function createNew() {
    setMode('block')
    syncUrl(null, 'builder')
    setDrawerOpen(false)
  }
  function openConnected(id: number) {
    setActiveConnectedId(id)
    setMode('connected')
    syncUrl(id || null, null)
    setDrawerOpen(false)
  }
  function onConnected(site: ConnectedSiteSummary) {
    setHistory((h) => [...h, site])
    setActiveConnectedId(site.id)
    setMode('connected')
    syncUrl(site.id, null)
  }
  function onRemoved(id: number) {
    setHistory((h) => h.filter((s) => s.id !== id))
  }

  const label = mode === 'block' ? 'Builder — my site' : history.find((s) => s.id === activeConnectedId)?.name ?? 'Connect a website'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, sans-serif', color: '#111' }}>
      {/* Top bar */}
      <div style={{ height: 44, flex: 'none', borderBottom: '1px solid #e2e2e2', display: 'flex', alignItems: 'center', padding: '0 12px', gap: 10, position: 'relative', background: '#fff', zIndex: 5 }}>
        <button
          onClick={() => setDrawerOpen(true)}
          title="Menu"
          aria-label="Open menu"
          style={{ padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', display: 'inline-flex' }}
        >
          <span style={{ width: 28, height: 28, borderRadius: '50%', background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600 }}>
            {avatarInitial}
          </span>
        </button>
        <span style={{ fontSize: 13, color: '#555' }}>{label}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center', fontSize: 12, color: '#888' }}>
          <span style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userEmail}</span>
        </span>
      </div>

      {/* Operator impersonation banner (server enforces view-only; this explains it). */}
      {impersonating && (
        <div
          style={{
            flex: 'none',
            padding: '7px 14px',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            borderBottom: '1px solid #e2e2e2',
            background: impersonating.canEdit ? '#fef9c3' : '#eef2ff',
            color: impersonating.canEdit ? '#854d0e' : '#3730a3',
          }}
        >
          <strong>
            {impersonating.canEdit ? 'Editing' : 'Viewing'} {impersonating.tenantName} as operator
          </strong>
          <span>
            {impersonating.canEdit
              ? '— the tenant has enabled operator editing.'
              : '— read-only. The tenant has not enabled operator editing.'}
          </span>
          <a href="/exit-impersonation?to=/admin" style={{ marginLeft: 'auto', color: '#2563eb', textDecoration: 'none' }}>
            Back to admin →
          </a>
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {mode === 'block' ? (
          <WorkspaceClient
            workspace={workspace}
            initialLiveUrl={initialLiveUrl}
            drawerOpen={drawerOpen}
            onCloseDrawer={closeDrawer}
            canEdit={canEdit}
            mode={mode}
            history={history}
            activeConnectedId={activeConnectedId}
            onCreate={createNew}
            onConnect={openConnect}
            onOpenConnected={openConnected}
            profile={drawerProfile}
          />
        ) : (
          <ConnectedEditor
            sites={history}
            activeId={activeConnectedId}
            onConnected={onConnected}
            onSelect={openConnected}
            openConnectSignal={connectSignal}
            drawerOpen={drawerOpen}
            onCloseDrawer={closeDrawer}
            onCreate={createNew}
            onRemoved={onRemoved}
            canEdit={canEdit}
            profile={drawerProfile}
          />
        )}
      </div>
    </div>
  )
}
