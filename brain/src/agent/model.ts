/**
 * The model seam (Architecture.md §F / m6-model-seam). One config point; swapping
 * provider/model is a config change, not a rewrite. v1 uses OpenRouter with an
 * ordered fallback chain — the first model that responds wins.
 */
export interface ModelConfig {
  readonly provider: 'openrouter'
  /** Ordered model slugs; tried in order until one succeeds. */
  readonly models: readonly string[]
}

export const MODEL_CONFIG: ModelConfig = {
  provider: 'openrouter',
  models: ['moonshotai/kimi-k2.6', 'qwen/qwen3.7-plus'],
}
