import { APIError } from 'payload'

/** Coerce a relationship value (id | string | { id }) to a numeric id. */
export function toTenantId(value: unknown): number | undefined {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isNaN(n) ? undefined : n
  }
  if (value && typeof value === 'object' && 'id' in value) return toTenantId((value as { id: unknown }).id)
  return undefined
}

/** Edit-enabled impersonation, threaded into a write as `req.context.impersonation`. */
export interface ImpersonationContext {
  tenantId: number
  canEdit: boolean
  operatorUserId?: number
}

/**
 * Deny-by-default backstop for OPERATOR writes to tenant-scoped collections
 * (Codex R1 #2/#3, R2 #6).
 *
 * Normal tenant edits run as the tenant's SERVICE PRINCIPAL (`req.user.isOperator`
 * is false), so this is a no-op for them. Its job is to close the direct-API bypass:
 * an operator authenticated via `payload-token` could otherwise POST `/api/pages`
 * (or `/api/connectedSites`) with an arbitrary `tenant` and write it, because the
 * multi-tenant plugin grants operators all-tenant access. Such a write is now
 * rejected unless it carries an edit-enabled impersonation context for that EXACT
 * tenant — and the REST/GraphQL API cannot set `req.context`, only our server write
 * paths can. (`systemPurpose` bootstrap writes are handled separately, upstream.)
 */
export function assertOperatorWriteAllowed(req: any, tenantId: unknown): void {
  if (!req?.user?.isOperator) return
  const imp = (req.context as { impersonation?: ImpersonationContext } | undefined)?.impersonation
  const target = toTenantId(tenantId)
  if (imp?.canEdit && target !== undefined && toTenantId(imp.tenantId) === target) return
  throw new APIError('Operator writes require an active edit-enabled impersonation for this tenant.', 403)
}
