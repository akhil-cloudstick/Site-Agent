import config from '@payload-config'
import { getPayload, type Payload } from 'payload'

/**
 * The ONLY application module permitted to obtain the Payload handle for tenant
 * content writes (Architecture.md §A — the single audited door to the DB). A
 * lint rule (m5-lint-deny) denies `getPayload`/`payload` imports everywhere
 * except this file and the bootstrap seed. All tenant content goes through
 * src/broker/adapter.ts, which always uses `overrideAccess: false` + the
 * tenant's service principal.
 */
let cached: Payload | undefined

export async function getBrokerClient(): Promise<Payload> {
  return (cached ??= await getPayload({ config }))
}
