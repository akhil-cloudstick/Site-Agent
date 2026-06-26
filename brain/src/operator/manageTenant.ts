import type { User } from '../payload-types'
import { getBrokerClient } from '../broker/payload-client'
import { assertOperator } from './dashboard'

/**
 * Operator-only tenant mutations (suspend/resume, plan label). Authorization is enforced
 * INSIDE each function (assertOperator) so an un-gated caller can't act cross-tenant. These
 * are platform-operator writes (not tenant content), so they go straight through the broker
 * with overrideAccess — NOT the audited content adapter.
 */

export async function setTenantStatus(user: User | null, tenantId: number, status: 'active' | 'suspended'): Promise<void> {
  assertOperator(user)
  const payload = await getBrokerClient()
  await payload.update({ collection: 'tenants', id: tenantId, data: { status }, overrideAccess: true })
}

export async function setTenantPlan(user: User | null, tenantId: number, planLabel: string): Promise<void> {
  assertOperator(user)
  const payload = await getBrokerClient()
  await payload.update({ collection: 'tenants', id: tenantId, data: { planLabel: planLabel.slice(0, 60) }, overrideAccess: true })
}
