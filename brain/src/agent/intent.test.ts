import { describe, expect, it } from 'vitest'

import { extractJsonObject, parseIntent } from './intent'

describe('parseIntent (strict closed intent schema)', () => {
  it('accepts a valid intent', () => {
    const r = parseIntent({ action: 'update_page_field', pageId: 1, field: 'hero.heading', value: 'Hi' })
    expect(r.ok).toBe(true)
  })

  it('rejects unknown fields (fail-closed, not coerced)', () => {
    const r = parseIntent({ action: 'update_page_field', pageId: 1, field: 'title', value: 'x', evil: 1 })
    expect(r).toEqual({ ok: false, error: 'unknown field: evil' })
  })

  it('rejects an out-of-scope action', () => {
    const r = parseIntent({ action: 'delete_everything', pageId: 1, field: 'title', value: 'x' })
    expect(r.ok).toBe(false)
  })

  it('rejects an out-of-scope field', () => {
    const r = parseIntent({ action: 'update_page_field', pageId: 1, field: 'hero.image', value: 'x' })
    expect(r.ok).toBe(false)
  })

  it('rejects a non-integer pageId', () => {
    expect(parseIntent({ action: 'update_page_field', pageId: '1', field: 'title', value: 'x' }).ok).toBe(false)
  })

  it('rejects a non-string value', () => {
    expect(parseIntent({ action: 'update_page_field', pageId: 1, field: 'title', value: 5 }).ok).toBe(false)
  })

  it('rejects non-objects', () => {
    expect(parseIntent(null).ok).toBe(false)
    expect(parseIntent('{}').ok).toBe(false)
    expect(parseIntent([]).ok).toBe(false)
  })
})

describe('extractJsonObject', () => {
  it('pulls JSON out of a fenced code block', () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toBe('{"a":1}')
  })
  it('pulls JSON out of surrounding prose', () => {
    expect(extractJsonObject('Sure! {"a":1} done')).toBe('{"a":1}')
  })
})
