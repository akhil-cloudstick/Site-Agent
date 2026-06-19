import type { User } from '../payload-types'
import { getBrokerClient } from '../broker/payload-client'

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
