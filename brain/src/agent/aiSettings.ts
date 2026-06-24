import { getBrokerClient } from '../broker/payload-client'
import { getEnv } from '../config/env'
import { decryptSecret } from '../lib/crypto/secretBox'
import { getAiSettingsCache, setAiSettingsCache, type AiSettingsCache } from './aiSettingsCache'
import { MODEL_CONFIG, type ModelConfig } from './model'

export { invalidateAiSettingsCache } from './aiSettingsCache'

/**
 * Runtime reader for the platform AI config (the `settings` global), with env fallback.
 * This is the ONLY place that decrypts the stored key — it reads the global with
 * `overrideAccess: true` so the `read:false` ciphertext field is available in-process,
 * while it stays stripped from every external API response (Codex R2 #3/#4).
 *
 * Cached and invalidated on settings write (the global's afterChange calls
 * `invalidateAiSettingsCache`) so we don't hit the DB on every AI request (Codex R1 #18).
 *
 * Precedence / failure semantics (Codex R1 #19):
 *  - DB key set & decrypts → use it.
 *  - DB key set but decrypt FAILS → fail closed (keyError), do NOT fall back to env.
 *  - DB key unset → fall back to OPENROUTER_API_KEY.
 */
async function load(): Promise<AiSettingsCache> {
  const cached = getAiSettingsCache()
  if (cached) return cached
  const env = getEnv()
  const payload = await getBrokerClient()
  const settings: any = await payload
    .findGlobal({ slug: 'settings', overrideAccess: true, depth: 0 })
    .catch(() => null)

  const dbModels: string[] = Array.isArray(settings?.aiModels)
    ? settings.aiModels.map((m: any) => m?.slug).filter((s: any): s is string => typeof s === 'string' && s.trim() !== '')
    : []
  const models = dbModels.length ? dbModels : [...MODEL_CONFIG.models]

  let apiKey: string | undefined
  let keyError = false
  const ct = settings?.aiApiKeyCiphertext
  if (typeof ct === 'string' && ct.length > 0) {
    try {
      apiKey = decryptSecret(ct, env.payloadSecret)
    } catch {
      keyError = true
    }
  } else {
    apiKey = env.openRouterApiKey
  }

  const result: AiSettingsCache = { provider: 'openrouter', models, apiKey, keyError }
  setAiSettingsCache(result)
  return result
}

export async function getModelConfig(): Promise<ModelConfig> {
  const c = await load()
  return { provider: 'openrouter', models: c.models }
}

export async function getAiApiKey(): Promise<string> {
  const c = await load()
  if (c.keyError) {
    throw new Error(
      'The saved AI API key could not be decrypted (PAYLOAD_SECRET may have changed). Re-enter it in Admin → Settings.',
    )
  }
  if (!c.apiKey) {
    throw new Error('No AI API key configured. Set one in Admin → Settings (or OPENROUTER_API_KEY in brain/.env).')
  }
  return c.apiKey
}

/** Whether a usable key is configured — for the settings UI (`hasAiApiKey` only, never the key). */
export async function hasAiApiKey(): Promise<boolean> {
  const c = await load()
  return Boolean(c.apiKey) && !c.keyError
}
