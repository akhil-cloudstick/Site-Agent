import type { LayoutBlock } from '@/agent/intent'

import type { PreviewBlock } from './types'

const SCALAR_FIELDS = ['heading', 'subheading', 'buttonLabel', 'text', 'body'] as const
const ITEM_FIELDS = ['title', 'text', 'quote', 'author', 'name', 'description', 'price', 'oldPrice', 'badge', 'buttonLabel', 'caption', 'question', 'answer', 'period', 'features', 'highlighted', 'alt'] as const

/** Array-aware deep set: handles numeric path parts (array indices), growing arrays as needed. */
function setNested(obj: any, parts: string[], value: unknown) {
  let cur = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]
    const nextIsIndex = /^\d+$/.test(parts[i + 1])
    if (/^\d+$/.test(key)) {
      const idx = Number(key)
      while (cur.length <= idx) cur.push({})
      cur = cur[idx]
    } else {
      if (cur[key] == null) cur[key] = nextIsIndex ? [] : {}
      cur = cur[key]
    }
  }
  cur[parts[parts.length - 1]] = value
}

function getNested(obj: any, parts: string[]): unknown {
  let cur = obj
  for (const key of parts) {
    if (cur == null) return undefined
    cur = /^\d+$/.test(key) ? cur[Number(key)] : cur[key]
  }
  return cur
}

const imageId = (image: any): number | null | undefined =>
  image && typeof image === 'object' ? image.id : image
const urlOf = (image: any): string | undefined =>
  image && typeof image === 'object' ? (image.url ?? undefined) : undefined

/** Convert a stored block (read with depth) into a writable block for an update. */
function blockToWritable(b: any) {
  const w: any = { blockType: b.blockType }
  if (b.id) w.id = b.id
  for (const f of SCALAR_FIELDS) if (b[f] !== undefined && b[f] !== null) w[f] = b[f]
  if (Array.isArray(b.items)) {
    w.items = b.items.map((it: any) => {
      const o: any = {}
      for (const k of ITEM_FIELDS) if (it?.[k] !== undefined && it?.[k] !== null) o[k] = it[k]
      const img = imageId(it?.image)
      if (img != null) o.image = img
      return o
    })
  }
  const bimg = imageId(b.image)
  if (bimg != null) w.image = bimg
  return w
}

/** Current page layout as writable blocks (preserves ids + every section/item image). */
export function normalizeLayout(page: any): any[] {
  return Array.isArray(page?.layout) ? page.layout.map(blockToWritable) : []
}

/** Build a layout for writing from the AI's reply, carrying over existing images
 *  (the AI never sets images). Images are matched by block type + position, so a
 *  text edit keeps the photos a customer uploaded on each section/product. */
export function buildLayoutForWrite(page: any, aiLayout: LayoutBlock[]): any[] {
  const existing = Array.isArray(page?.layout) ? page.layout : []
  const pools: Record<string, { image: any; items: any[] }[]> = {}
  for (const b of existing) {
    ;(pools[b.blockType] ??= []).push({
      image: imageId(b.image),
      items: (Array.isArray(b.items) ? b.items : []).map((it: any) => imageId(it?.image)),
    })
  }
  const cursor: Record<string, number> = {}
  return aiLayout.map((b) => {
    const w: any = { blockType: b.type }
    for (const f of SCALAR_FIELDS) if ((b as any)[f] !== undefined) w[f] = (b as any)[f]
    if (b.items) w.items = b.items.map((it) => ({ ...it }))
    const idx = cursor[b.type] ?? 0
    cursor[b.type] = idx + 1
    const prev = pools[b.type]?.[idx]
    if (prev?.image) w.image = prev.image
    if (Array.isArray(w.items) && prev?.items) {
      w.items.forEach((it: any, j: number) => {
        if (prev.items[j]) it.image = prev.items[j]
      })
    }
    return w
  })
}

/** Apply a single text-field edit (path like 'layout.0.heading' or 'layout.1.items.2.title'). */
export function setLayoutFieldPath(page: any, path: string, value: string): any[] | null {
  const layout = normalizeLayout(page)
  const parts = path.split('.')
  if (parts[0] !== 'layout') return null
  const idx = Number(parts[1])
  if (!Number.isInteger(idx) || idx < 0 || idx >= layout.length) return null
  setNested(layout[idx], parts.slice(2), value)
  return layout
}

const IMAGE_PATH_RE = /^layout\.\d+\.(image|items\.\d+\.image)$/

/** Set (or clear) an image. `path` targets a section/item image
 *  (`layout.2.image` or `layout.1.items.0.image`); when omitted, the (first)
 *  hero is used, creating a hero if the page has none. Returns the new layout,
 *  the concrete path written, and the previous media id (for one-click revert). */
export function setImageForUpload(
  page: any,
  path: string | undefined,
  mediaId: number | null,
): { layout: any[]; path: string; previous: number | null } | null {
  const layout = normalizeLayout(page)
  let idx: number
  let sub: string[]
  if (path && IMAGE_PATH_RE.test(path)) {
    const parts = path.split('.')
    idx = Number(parts[1])
    if (!Number.isInteger(idx) || idx < 0 || idx >= layout.length) return null
    sub = parts.slice(2)
  } else if (path) {
    return null // a path was given but it isn't a valid image path
  } else {
    let heroIdx = layout.findIndex((b: any) => b.blockType === 'hero')
    if (heroIdx === -1) {
      layout.unshift({ blockType: 'hero', heading: '', subheading: '' })
      heroIdx = 0
    }
    idx = heroIdx
    sub = ['image']
  }
  const prev = getNested(layout[idx], sub)
  setNested(layout[idx], sub, mediaId)
  return { layout, path: `layout.${idx}.${sub.join('.')}`, previous: typeof prev === 'number' ? prev : null }
}

/** Map the stored layout to the public preview blocks (allowlisted fields only). */
export function layoutToPreview(page: any): PreviewBlock[] {
  const blocks = Array.isArray(page?.layout) ? page.layout : []
  const s = (v: unknown) => (typeof v === 'string' ? v : '')
  return blocks.map((b: any): PreviewBlock => {
    switch (b.blockType) {
      case 'hero':
        return { type: 'hero', heading: s(b.heading), subheading: s(b.subheading), imageUrl: urlOf(b.image) }
      case 'features':
        return { type: 'features', heading: s(b.heading), imageUrl: urlOf(b.image), items: (b.items ?? []).map((it: any) => ({ title: s(it.title), text: s(it.text), imageUrl: urlOf(it.image) })) }
      case 'products':
        return { type: 'products', heading: s(b.heading), imageUrl: urlOf(b.image), items: (b.items ?? []).map((it: any) => ({ name: s(it.name), description: s(it.description), price: s(it.price), oldPrice: s(it.oldPrice), badge: s(it.badge), buttonLabel: s(it.buttonLabel), imageUrl: urlOf(it.image) })) }
      case 'testimonials':
        return { type: 'testimonials', heading: s(b.heading), imageUrl: urlOf(b.image), items: (b.items ?? []).map((it: any) => ({ quote: s(it.quote), author: s(it.author), imageUrl: urlOf(it.image) })) }
      case 'gallery':
        return { type: 'gallery', heading: s(b.heading), imageUrl: urlOf(b.image), items: (b.items ?? []).map((it: any) => ({ caption: s(it.caption), imageUrl: urlOf(it.image) })) }
      case 'faq':
        return { type: 'faq', heading: s(b.heading), imageUrl: urlOf(b.image), items: (b.items ?? []).map((it: any) => ({ question: s(it.question), answer: s(it.answer) })) }
      case 'pricing':
        return { type: 'pricing', heading: s(b.heading), imageUrl: urlOf(b.image), items: (b.items ?? []).map((it: any) => ({ name: s(it.name), price: s(it.price), period: s(it.period), features: s(it.features), buttonLabel: s(it.buttonLabel), highlighted: s(it.highlighted) })) }
      case 'logos':
        return { type: 'logos', heading: s(b.heading), imageUrl: urlOf(b.image), items: (b.items ?? []).map((it: any) => ({ alt: s(it.alt), imageUrl: urlOf(it.image) })) }
      case 'cta':
        return { type: 'cta', heading: s(b.heading), buttonLabel: s(b.buttonLabel), imageUrl: urlOf(b.image) }
      case 'contact':
        return { type: 'contact', heading: s(b.heading), text: s(b.text), buttonLabel: s(b.buttonLabel), imageUrl: urlOf(b.image) }
      case 'richText':
      default:
        return { type: 'richText', heading: s(b.heading), body: s(b.body), imageUrl: urlOf(b.image) }
    }
  })
}
