import { NextResponse } from 'next/server'

import { resolveEffectiveTenant } from './session'

export interface WritableTenant {
  tenantId: number
  isImpersonating: boolean
  operatorUserId?: number
}

/**
 * Mutation-route guard (Codex R1 #2, R2 #7): resolve the EFFECTIVE tenant and ensure the
 * caller may WRITE it. Used by every `/workspace/*` and `/workspace/connected/*` mutation
 * route so the tenant is always server-resolved (never client-supplied) and an operator
 * who is not in an edit-enabled impersonation is rejected with 403.
 *
 * Returns `{ tenant }` on success, or `{ response }` (a ready 401/403) to return as-is.
 */
export async function requireWritableTenant(
  reqHeaders: Headers,
): Promise<{ tenant?: WritableTenant; response?: NextResponse }> {
  const eff = await resolveEffectiveTenant(reqHeaders)
  if (!eff.user) {
    return { response: NextResponse.json({ ok: false, message: 'Please log in.' }, { status: 401 }) }
  }
  if (eff.suspended) {
    return { response: NextResponse.json({ ok: false, message: 'This account is suspended. Contact support.' }, { status: 403 }) }
  }
  if (eff.tenantId === undefined) {
    return {
      response: NextResponse.json(
        { ok: false, message: 'No site to act on. Operators enter a tenant from the admin dashboard.' },
        { status: 403 },
      ),
    }
  }
  if (eff.isImpersonating && !eff.canEdit) {
    return {
      response: NextResponse.json(
        { ok: false, message: 'View only — this tenant has not enabled operator editing.' },
        { status: 403 },
      ),
    }
  }
  return { tenant: { tenantId: eff.tenantId, isImpersonating: eff.isImpersonating, operatorUserId: eff.operatorUserId } }
}

/** Read-route variant: resolve the effective tenant without requiring edit rights. */
export async function requireReadableTenant(
  reqHeaders: Headers,
): Promise<{ tenantId?: number; response?: NextResponse }> {
  const eff = await resolveEffectiveTenant(reqHeaders)
  if (!eff.user) return { response: NextResponse.json({ ok: false }, { status: 401 }) }
  if (eff.suspended) return { response: NextResponse.json({ ok: false, message: 'This account is suspended.' }, { status: 403 }) }
  if (eff.tenantId === undefined) return { response: NextResponse.json({ ok: false }, { status: 403 }) }
  return { tenantId: eff.tenantId }
}
