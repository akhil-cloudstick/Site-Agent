import { describe, expect, it } from 'vitest'

import { detectNewPageIntent, extractJsonObject, parseLayout } from './intent'

describe('parseLayout (dynamic layout, fail-closed)', () => {
  it('accepts a valid multi-block layout with items and theme', () => {
    const r = parseLayout({
      layout: [
        { type: 'hero', heading: 'Hi', subheading: 'Welcome' },
        { type: 'features', heading: 'Why us', items: [{ title: 'Fast', text: 'Quick' }, { title: 'Cheap', text: 'Low cost' }] },
        { type: 'cta', heading: 'Go', buttonLabel: 'Start' },
      ],
      theme: { primaryColor: '#16a34a', font: 'serif' },
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.layout).toHaveLength(3)
  })

  it('accepts the new section types (gallery, faq, pricing, logos) with items', () => {
    const r = parseLayout({
      layout: [
        { type: 'gallery', heading: 'Our work', items: [{ caption: 'Shot A' }, { caption: 'Shot B' }] },
        { type: 'faq', heading: 'FAQ', items: [{ question: 'How?', answer: 'Like this.' }] },
        { type: 'pricing', heading: 'Plans', items: [{ name: 'Pro', price: '$29', period: '/mo', features: 'x\ny', buttonLabel: 'Buy', highlighted: 'true' }] },
        { type: 'logos', heading: 'Trusted by', items: [{ alt: 'Acme' }] },
      ],
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.layout).toHaveLength(4)
  })

  it('rejects an unknown item field on a new block (fail-closed)', () => {
    expect(parseLayout({ layout: [{ type: 'pricing', items: [{ name: 'x', color: 'red' }] }] }).ok).toBe(false)
  })

  it('rejects an unknown block type', () => {
    expect(parseLayout({ layout: [{ type: 'carousel', heading: 'x' }] }).ok).toBe(false)
  })

  it('rejects an unknown field on a block', () => {
    expect(parseLayout({ layout: [{ type: 'hero', heading: 'x', script: 'evil' }] }).ok).toBe(false)
  })

  it('rejects items on a block type that has none', () => {
    expect(parseLayout({ layout: [{ type: 'cta', items: [{ title: 'x' }] }] }).ok).toBe(false)
  })

  it('rejects an unknown item field', () => {
    expect(parseLayout({ layout: [{ type: 'features', items: [{ title: 'x', url: 'evil' }] }] }).ok).toBe(false)
  })

  it('rejects non-string values', () => {
    expect(parseLayout({ layout: [{ type: 'hero', heading: 5 }] }).ok).toBe(false)
  })

  it('rejects an empty/non-array layout and unknown top-level keys', () => {
    expect(parseLayout({ layout: [] }).ok).toBe(false)
    expect(parseLayout({ layout: 'nope' }).ok).toBe(false)
    expect(parseLayout({ layout: [{ type: 'hero' }], extra: 1 }).ok).toBe(false)
  })

  it('rejects a bad theme font', () => {
    expect(parseLayout({ layout: [{ type: 'hero' }], theme: { font: 'comic' } }).ok).toBe(false)
  })
})

describe('detectNewPageIntent', () => {
  it('detects "add new page X" and extracts the name', () => {
    expect(detectNewPageIntent('add new page Product')).toEqual({ title: 'Product' })
    expect(detectNewPageIntent('add a new page Product')).toEqual({ title: 'Product' })
    expect(detectNewPageIntent('make a new page Services')).toEqual({ title: 'Services' })
  })

  it('handles connectors, separators and quotes', () => {
    expect(detectNewPageIntent('create a page called About')).toEqual({ title: 'About' })
    expect(detectNewPageIntent('new page: Contact')).toEqual({ title: 'Contact' })
    expect(detectNewPageIntent('add a page named "Our Team"')).toEqual({ title: 'Our Team' })
  })

  it('falls back to a default name when none is given', () => {
    expect(detectNewPageIntent('add a new page')).toEqual({ title: 'New Page' })
  })

  it('does NOT fire on section edits to the current page', () => {
    expect(detectNewPageIntent('add a products section')).toBeNull()
    expect(detectNewPageIntent('add a hero to the page')).toBeNull()
    expect(detectNewPageIntent('change the page title to Home')).toBeNull()
    expect(detectNewPageIntent('delete the about page')).toBeNull()
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
