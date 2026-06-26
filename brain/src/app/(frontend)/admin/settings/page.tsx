import { hasAiApiKey } from '@/agent/aiSettings'
import { loadModelUsage } from '@/agent/recordModelUsage'
import { getBrokerClient } from '@/broker/payload-client'

import { SettingsClient } from './SettingsClient'

export const dynamic = 'force-dynamic'

/** Operator AI settings — provider, models, the (write-only) API key, and per-model usage. */
export default async function SettingsPage() {
  const payload = await getBrokerClient()
  const settings: any = await payload.findGlobal({ slug: 'settings', overrideAccess: true, depth: 0 }).catch(() => null)
  const models = Array.isArray(settings?.aiModels)
    ? settings.aiModels.map((m: any) => m?.slug).filter((s: any): s is string => typeof s === 'string' && s.trim() !== '')
    : []
  const keySet = await hasAiApiKey()
  const usage = await loadModelUsage().catch(() => [])
  return <SettingsClient models={models} keySet={keySet} usage={usage} />
}
