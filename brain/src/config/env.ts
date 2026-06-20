/**
 * The single audited reader of server-side configuration & secrets.
 *
 * Why this module exists (Architecture.md §E / PLAN.md `m1-config-seam`):
 *  - ONE place reads `process.env`, so secrets are never scattered or duplicated.
 *  - Required vars are validated at startup → the app fails fast with a clear
 *    message instead of a confusing error deep in a request.
 *
 * Client-safety: every secret here (DATABASE_URL, PAYLOAD_SECRET, GEMINI_API_KEY)
 * is intentionally NOT prefixed with `NEXT_PUBLIC_`, so Next.js never inlines it
 * into the browser bundle. This module must only ever be imported by SERVER code,
 * never by a Client Component. (A lint rule will enforce that in the CI task.)
 *
 * `parseEnv` is a pure function (no I/O) so it is unit-testable without a real
 * environment; `env` is the eagerly-validated singleton the app imports.
 */

const SECRET_KEYS = ['DATABASE_URL', 'PAYLOAD_SECRET', 'OPENROUTER_API_KEY', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'] as const
type EnvKey = (typeof SECRET_KEYS)[number]

export interface AppEnv {
  /** Postgres connection string. Local dev now → Neon in prod (swap is config-only). */
  readonly databaseUrl: string
  /** Payload signing secret. */
  readonly payloadSecret: string
  /** OpenRouter API key — powers the content agent. Optional until the agent runs. */
  readonly openRouterApiKey: string | undefined
  /** Cloudflare account id + API token — optional; enable "publish to Cloudflare Pages". */
  readonly cloudflareAccountId: string | undefined
  readonly cloudflareApiToken: string | undefined
  /** Resolved Node environment. */
  readonly nodeEnv: 'development' | 'production' | 'test'
}

/** Validate + shape a raw environment source into typed config. Pure; throws on missing required vars. */
export function parseEnv(source: Record<string, string | undefined>): AppEnv {
  const read = (key: EnvKey): string | undefined => {
    const raw = source[key]
    const trimmed = typeof raw === 'string' ? raw.trim() : ''
    return trimmed === '' ? undefined : trimmed
  }
  const requireEnv = (key: EnvKey): string => {
    const value = read(key)
    if (value === undefined) {
      throw new Error(
        `[config] Missing required environment variable ${key}. ` +
          `Set it in brain/.env (copy from brain/.env.example).`,
      )
    }
    return value
  }

  const nodeEnvRaw = source.NODE_ENV
  const nodeEnv: AppEnv['nodeEnv'] =
    nodeEnvRaw === 'production' || nodeEnvRaw === 'test' ? nodeEnvRaw : 'development'

  return {
    databaseUrl: requireEnv('DATABASE_URL'),
    payloadSecret: requireEnv('PAYLOAD_SECRET'),
    openRouterApiKey: read('OPENROUTER_API_KEY'),
    cloudflareAccountId: read('CLOUDFLARE_ACCOUNT_ID'),
    cloudflareApiToken: read('CLOUDFLARE_API_TOKEN'),
    nodeEnv,
  }
}

let cached: AppEnv | undefined

/**
 * The validated, server-only config accessor. Call this — do not read
 * `process.env` elsewhere. Lazy + cached: validation runs on first access
 * (i.e. at app/CLI startup, when payload.config evaluates), so it still fails
 * fast, while keeping module import side-effect-free for unit tests.
 */
export function getEnv(): AppEnv {
  return (cached ??= parseEnv(process.env))
}
