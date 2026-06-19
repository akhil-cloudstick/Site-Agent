import { describe, expect, it } from 'vitest'

import { parseEnv } from './env'

describe('parseEnv (config seam)', () => {
  it('returns typed config when required vars are present', () => {
    const e = parseEnv({
      DATABASE_URL: 'postgresql://siteagent@localhost/db',
      PAYLOAD_SECRET: 'secret',
      NODE_ENV: 'test',
    })
    expect(e.databaseUrl).toBe('postgresql://siteagent@localhost/db')
    expect(e.payloadSecret).toBe('secret')
    expect(e.nodeEnv).toBe('test')
  })

  it('leaves the optional OPENROUTER_API_KEY undefined when absent', () => {
    const e = parseEnv({ DATABASE_URL: 'x', PAYLOAD_SECRET: 'y' })
    expect(e.openRouterApiKey).toBeUndefined()
  })

  it('exposes OPENROUTER_API_KEY when set', () => {
    const e = parseEnv({ DATABASE_URL: 'x', PAYLOAD_SECRET: 'y', OPENROUTER_API_KEY: 'sk-or-x' })
    expect(e.openRouterApiKey).toBe('sk-or-x')
  })

  it('throws a clear error naming the missing variable (DATABASE_URL)', () => {
    expect(() => parseEnv({ PAYLOAD_SECRET: 'y' })).toThrow(/DATABASE_URL/)
  })

  it('throws when PAYLOAD_SECRET is missing', () => {
    expect(() => parseEnv({ DATABASE_URL: 'x' })).toThrow(/PAYLOAD_SECRET/)
  })

  it('treats blank / whitespace-only values as missing', () => {
    expect(() => parseEnv({ DATABASE_URL: '   ', PAYLOAD_SECRET: 'y' })).toThrow(/DATABASE_URL/)
  })

  it('defaults nodeEnv to development for unknown values', () => {
    const e = parseEnv({ DATABASE_URL: 'x', PAYLOAD_SECRET: 'y', NODE_ENV: 'staging' })
    expect(e.nodeEnv).toBe('development')
  })
})
