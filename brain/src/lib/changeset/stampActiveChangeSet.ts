import { APIError, type CollectionBeforeValidateHook } from 'payload'

import { isAllowedSystemPurpose } from './systemPurpose'
import { assertOperatorWriteAllowed } from './operatorWriteGuard'

/**
 * Forces every tenant-content write into the Tenant's active ChangeSet, or
 * rejects it (Architecture.md §B / AgentPlan.md §3). Runs in `beforeValidate`
 * (not `beforeChange`) because Payload validates `required` fields BEFORE the
 * beforeChange phase — so a required `changeSetId` must be stamped here, with
 * `required: true` left on the field as a backstop.
 *
 * Two paths:
 *  - System/bootstrap: only an allowlisted `req.context.systemPurpose` may write,
 *    and it must carry an explicit `changeSetId` (we never derive for system).
 *    Anything else (a Job with no/again-wrong purpose) is denied.
 *  - Normal: a real authenticated principal is required; we derive the Tenant
 *    from the principal (NOT from client-supplied data, except for operators who
 *    legitimately select a tenant), look up that Tenant's single active
 *    ChangeSet, and stamp it. No active ChangeSet => Forbidden.
 */

function toId(value: unknown): number | undefined {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isNaN(n) ? undefined : n
  }
  if (value && typeof value === 'object' && 'id' in value) return toId((value as { id: unknown }).id)
  return undefined
}

function ownedTenantIds(user: any): number[] {
  return Array.isArray(user?.tenants)
    ? user.tenants.map((t: any) => toId(t?.tenant)).filter((x: unknown): x is number => typeof x === 'number')
    : []
}

/**
 * Resolve the tenant a write belongs to, and REJECT cross-tenant attempts.
 * The multi-tenant plugin scopes reads but does not block a Local-API write that
 * supplies another tenant's id, so this hook is the hard guarantee: a non-operator
 * principal may only write content for a tenant it owns.
 *
 * Operators are DENY-BY-DEFAULT (Codex R1 #2/#3): the multi-tenant plugin would let
 * an operator write any tenant, so an operator write is rejected unless it carries an
 * edit-enabled impersonation context for that exact tenant (set only by our server
 * write paths). Normal tenant edits run as the service principal, not an operator, so
 * they take the branch below untouched.
 */
function resolveTenantId(req: any, data: any): number | undefined {
  const user = req.user
  const docTenant = toId(data?.tenant)
  if (user.isOperator) {
    assertOperatorWriteAllowed(req, docTenant)
    return docTenant
  }
  const owned = ownedTenantIds(user)
  if (docTenant !== undefined && !owned.includes(docTenant)) {
    throw new APIError(
      'Cross-tenant write rejected: this principal cannot write content for another tenant.',
      403,
    )
  }
  return docTenant ?? owned[0]
}

export const stampActiveChangeSet: CollectionBeforeValidateHook = async ({ data, req }) => {
  const doc = data ?? {}
  const purpose = (req?.context as { systemPurpose?: unknown } | undefined)?.systemPurpose

  if (purpose !== undefined) {
    if (!isAllowedSystemPurpose(purpose)) {
      throw new APIError('This system write is not permitted to modify tenant content.', 403)
    }
    if (toId(doc.changeSetId) === undefined) {
      throw new APIError('A system/bootstrap write must provide an explicit changeSetId.', 403)
    }
    return doc
  }

  if (!req?.user) {
    throw new APIError('Edits must be made by an authenticated user within a ChangeSet.', 403)
  }

  const tenantId = resolveTenantId(req, doc)
  if (tenantId === undefined) {
    throw new APIError('Could not determine which site this edit belongs to.', 403)
  }

  const active = await req.payload.find({
    collection: 'changesets',
    where: { and: [{ tenant: { equals: tenantId } }, { status: { equals: 'active' } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })

  if (active.docs.length === 0) {
    throw new APIError('No active ChangeSet for this site — a change must be started before editing.', 403)
  }

  doc.changeSetId = active.docs[0].id
  return doc
}
