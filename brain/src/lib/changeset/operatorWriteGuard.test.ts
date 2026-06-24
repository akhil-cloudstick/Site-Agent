import { describe, it, expect } from 'vitest'

import { assertOperatorWriteAllowed, toTenantId } from './operatorWriteGuard'

// `assertOperatorWriteAllowed` is the deny-by-default backstop for OPERATOR writes to
// tenant-scoped collections (Pages via stampActiveChangeSet, ConnectedSites via its
// beforeChange hook). It is the hard gate behind "operator clears the cookie and POSTs
// directly" — the REST/GraphQL API cannot set `req.context`, so only our server write
// paths can carry an edit-enabled impersonation.
const operator = () => ({ user: { isOperator: true } }) as any
const principal = () => ({ user: { isOperator: false } }) as any
const withImpersonation = (tenantId: number, canEdit: boolean) => ({
  user: { isOperator: true },
  context: { impersonation: { tenantId, canEdit } },
}) as any

describe('assertOperatorWriteAllowed — deny-by-default operator writes', () => {
  it('is a no-op for a non-operator principal (normal tenant edits run as the service principal)', () => {
    expect(() => assertOperatorWriteAllowed(principal(), 5)).not.toThrow()
  })

  it('DENIES an operator with no impersonation context (cookie cleared → direct API POST)', () => {
    expect(() => assertOperatorWriteAllowed(operator(), 5)).toThrow()
  })

  it('ALLOWS an operator with an edit-enabled impersonation for that EXACT tenant (context propagated)', () => {
    expect(() => assertOperatorWriteAllowed(withImpersonation(5, true), 5)).not.toThrow()
  })

  it('DENIES a view-only impersonation (canEdit = false)', () => {
    expect(() => assertOperatorWriteAllowed(withImpersonation(5, false), 5)).toThrow()
  })

  it('DENIES when the impersonated tenant differs from the write target', () => {
    expect(() => assertOperatorWriteAllowed(withImpersonation(5, true), 6)).toThrow()
  })

  it('matches the tenant id across number / string / relationship-object shapes', () => {
    const req = withImpersonation(5, true)
    expect(() => assertOperatorWriteAllowed(req, '5')).not.toThrow()
    expect(() => assertOperatorWriteAllowed(req, { id: 5 })).not.toThrow()
  })
})

describe('toTenantId coercion', () => {
  it('coerces number, numeric string, and { id } shapes; rejects junk', () => {
    expect(toTenantId(7)).toBe(7)
    expect(toTenantId('7')).toBe(7)
    expect(toTenantId({ id: '7' })).toBe(7)
    expect(toTenantId('nope')).toBeUndefined()
    expect(toTenantId(null)).toBeUndefined()
  })
})
