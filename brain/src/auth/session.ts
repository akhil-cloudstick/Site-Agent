import type { User } from '../payload-types'
import { getBrokerClient } from '../broker/payload-client'

/** Name of the httpOnly cookie that records which tenant an operator is impersonating. */
export const IMPERSONATE_COOKIE = 'sa_impersonate_tenant'

/** Resolve the logged-in Payload user from request headers (session cookie). */
export async function getSessionUser(reqHeaders: Headers): Promise<User | null> {
  const payload = await getBrokerClient()
  const result = await payload.auth({ headers: reqHeaders })
  return (result.user as User | null) ?? null
}

/** The single tenant a member belongs to (slice 1: one tenant per member). */
export function tenantIdOfUser(user: User | null): number | undefined {
  const tenants = (user as any)?.tenants
  const first = Array.isArray(tenants) ? tenants[0]?.tenant : undefined
  return first && typeof first === 'object' ? first.id : first
}

/** Read the impersonation cookie value (a tenant id) from a request's Cookie header. */
export function readImpersonationCookie(reqHeaders: Headers): number | undefined {
  const raw = reqHeaders.get('cookie')
  if (!raw) return undefined
  for (const part of raw.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === IMPERSONATE_COOKIE) {
      const n = Number(decodeURIComponent(rest.join('=')))
      return Number.isInteger(n) && n > 0 ? n : undefined
    }
  }
  return undefined
}

/**
 * What the caller should DO about the impersonation cookie/redirect. The resolver is
 * side-effect-free (Server Components cannot mutate cookies — Codex R1 #1/R2 #1), so it
 * returns one of these and the enacting layer (middleware / route handler) carries it out.
 */
export type EffectiveTenantAction =
  | 'ok' // use the resolved tenant as-is
  | 'redirect-admin' // operator with no impersonation → /admin
  | 'clear-cookie-redirect-admin' // operator, stale/invalid cookie tenant → clear + /admin
  | 'clear-cookie-resolve-tenant' // non-operator still holding a cookie → clear + use their own tenant

export interface EffectiveTenant {
  user: User | null
  tenantId: number | undefined
  isImpersonating: boolean
  canEdit: boolean
  operatorUserId?: number
  action: EffectiveTenantAction
}

/**
 * The single source of truth for "which tenant is this request acting on, and may it
 * edit" — used by the workspace page AND every mutation route (Codex R1 #1).
 *
 * Rules (Codex R1 #5–#8, R2 #11):
 *  - operator + valid cookie (tenant exists AND is `active`) → impersonate that tenant;
 *    `canEdit` = the tenant's `allowOperatorEdit`. Takes priority even if the operator is
 *    also a member of some tenant.
 *  - operator + stale/invalid cookie → clear it, go to /admin.
 *  - operator, no cookie → NO tenant fallback (never `tenants[0]`) → go to /admin.
 *  - non-operator still holding a cookie (e.g. operator role revoked) → clear it, resolve
 *    as a normal tenant member (if no membership, `tenantId` is undefined → caller sends to `/`).
 *  - normal tenant member → their own tenant, full edit.
 */
export async function resolveEffectiveTenant(reqHeaders: Headers): Promise<EffectiveTenant> {
  const user = await getSessionUser(reqHeaders)
  const cookie = readImpersonationCookie(reqHeaders)

  if (!user) {
    return { user: null, tenantId: undefined, isImpersonating: false, canEdit: false, action: 'ok' }
  }

  if (user.isOperator) {
    if (cookie !== undefined) {
      const payload = await getBrokerClient()
      const tenant = await payload.findByID({ collection: 'tenants', id: cookie, overrideAccess: true, depth: 0 }).catch(() => null)
      if (tenant && (tenant as any).status === 'active') {
        return {
          user,
          tenantId: (tenant as any).id,
          isImpersonating: true,
          canEdit: Boolean((tenant as any).allowOperatorEdit),
          operatorUserId: user.id,
          action: 'ok',
        }
      }
      return { user, tenantId: undefined, isImpersonating: false, canEdit: false, action: 'clear-cookie-redirect-admin' }
    }
    return { user, tenantId: undefined, isImpersonating: false, canEdit: false, action: 'redirect-admin' }
  }

  // Non-operator: if a stale impersonation cookie is present (role revoked), clear it.
  const tenantId = tenantIdOfUser(user)
  return {
    user,
    tenantId,
    isImpersonating: false,
    canEdit: true,
    action: cookie !== undefined ? 'clear-cookie-resolve-tenant' : 'ok',
  }
}
