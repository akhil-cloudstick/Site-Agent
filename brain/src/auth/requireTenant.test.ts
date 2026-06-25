import fs from 'node:fs'
import path from 'node:path'

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the effective-tenant resolver so we can drive every branch of the write gate
// without a DB/session. (Keeps these as pure unit tests.)
const { mockResolve } = vi.hoisted(() => ({ mockResolve: vi.fn() }))
vi.mock('./session', () => ({ resolveEffectiveTenant: mockResolve }))

import { requireWritableTenant } from './requireTenant'

const headers = new Headers()

describe('requireWritableTenant — the per-route write gate', () => {
  beforeEach(() => mockResolve.mockReset())

  it('401 when not signed in', async () => {
    mockResolve.mockResolvedValue({ user: null })
    const r = await requireWritableTenant(headers)
    expect(r.tenant).toBeUndefined()
    expect(r.response?.status).toBe(401)
  })

  it('403 when there is no effective tenant (operator who is not impersonating)', async () => {
    mockResolve.mockResolvedValue({ user: { id: 1, isOperator: true }, tenantId: undefined })
    const r = await requireWritableTenant(headers)
    expect(r.tenant).toBeUndefined()
    expect(r.response?.status).toBe(403)
  })

  it('403 when impersonating a tenant that has NOT enabled operator editing (view-only)', async () => {
    mockResolve.mockResolvedValue({ user: { id: 1, isOperator: true }, tenantId: 5, isImpersonating: true, canEdit: false })
    const r = await requireWritableTenant(headers)
    expect(r.tenant).toBeUndefined()
    expect(r.response?.status).toBe(403)
  })

  it('allows a normal tenant member write', async () => {
    mockResolve.mockResolvedValue({ user: { id: 2 }, tenantId: 5, isImpersonating: false, canEdit: true })
    const r = await requireWritableTenant(headers)
    expect(r.response).toBeUndefined()
    expect(r.tenant).toMatchObject({ tenantId: 5, isImpersonating: false })
  })

  it('allows an edit-enabled impersonation and surfaces operatorUserId (for ChangeSet attribution)', async () => {
    mockResolve.mockResolvedValue({ user: { id: 9, isOperator: true }, tenantId: 5, isImpersonating: true, canEdit: true, operatorUserId: 9 })
    const r = await requireWritableTenant(headers)
    expect(r.response).toBeUndefined()
    expect(r.tenant?.operatorUserId).toBe(9)
  })
})

// Regression net: a NEW mutation route that forgets the guard fails this test.
const WS = path.join(process.cwd(), 'src/app/(frontend)/workspace')
const WRITE_ROUTES = [
  'edit', 'field', 'pages', 'publish', 'upload', 'structure', 'undo',
  'connected/connect', 'connected/publish', 'connected/delete', 'connected/edit',
  'connected/undo', 'connected/settings', 'connected/chat', 'connected/cancel',
  // Phase 2 — connected-site structural editing
  'connected/structure', 'connected/pages', 'connected/generate', 'connected/insert', 'connected/nav', 'connected/element', 'connected/item',
]

describe('every mutation route carries a write guard', () => {
  for (const r of WRITE_ROUTES) {
    it(`workspace/${r} uses requireWritableTenant`, () => {
      const src = fs.readFileSync(path.join(WS, r, 'route.ts'), 'utf8')
      expect(src).toContain('requireWritableTenant')
    })
  }

  it('connected/job is read-only (requireReadableTenant, never the write gate)', () => {
    const src = fs.readFileSync(path.join(WS, 'connected/job/route.ts'), 'utf8')
    expect(src).toContain('requireReadableTenant')
    expect(src).not.toContain('requireWritableTenant')
  })

  it('ConnectedSites carries its own deny-by-default operator-write guard (not covered by stampActiveChangeSet)', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/collections/ConnectedSites.ts'), 'utf8')
    expect(src).toContain('assertOperatorWriteAllowed')
    expect(src).toContain('beforeChange')
  })
})
