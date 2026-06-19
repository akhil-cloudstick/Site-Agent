import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  BLOCKING_STATUSES,
  CHANGESET_STATUSES,
  TERMINAL_STATUSES,
  isBlockingStatus,
} from './status'

describe('ChangeSet status constants', () => {
  it('blocking and terminal sets partition the full status list (no overlap, full cover)', () => {
    const overlap = BLOCKING_STATUSES.filter((s) => (TERMINAL_STATUSES as readonly string[]).includes(s))
    expect(overlap).toEqual([])
    const union = new Set<string>([...BLOCKING_STATUSES, ...TERMINAL_STATUSES])
    expect(union).toEqual(new Set(CHANGESET_STATUSES))
  })

  it('isBlockingStatus matches BLOCKING_STATUSES', () => {
    for (const s of CHANGESET_STATUSES) {
      expect(isBlockingStatus(s)).toBe((BLOCKING_STATUSES as readonly string[]).includes(s))
    }
  })
})

describe('blocking-set drift guard (Codex R1 #1 / R2)', () => {
  it("the migration's partial-unique-index predicate equals BLOCKING_STATUSES", () => {
    const migration = readFileSync(
      join(__dirname, '../../migrations/20260619_083345_data_model.ts'),
      'utf8',
    )
    // Pull the IN (...) list from the one_blocking_changeset_per_tenant index.
    const match = migration.match(/one_blocking_changeset_per_tenant[\s\S]*?IN\s*\(([^)]*)\)/)
    expect(match, 'partial unique index not found in migration').toBeTruthy()
    const predicate = (match![1].match(/'([^']+)'/g) ?? []).map((q) => q.replace(/'/g, ''))
    expect(new Set(predicate)).toEqual(new Set(BLOCKING_STATUSES))
  })
})
