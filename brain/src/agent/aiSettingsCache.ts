import type { ModelConfig } from './model'

/**
 * Leaf cache module for the AI settings (no runtime imports → can't form an import
 * cycle). Both the runtime reader (`aiSettings.ts`) and the `settings` global's
 * afterChange hook import from here, so the global can invalidate the cache without
 * pulling in the broker client (which would cycle back through payload.config).
 */
export interface AiSettingsCache {
  provider: ModelConfig['provider']
  models: string[]
  apiKey: string | undefined
  keyError: boolean
}

let cache: AiSettingsCache | null = null

export const getAiSettingsCache = (): AiSettingsCache | null => cache
export const setAiSettingsCache = (c: AiSettingsCache): void => {
  cache = c
}
export const invalidateAiSettingsCache = (): void => {
  cache = null
}
