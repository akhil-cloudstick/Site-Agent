/**
 * The strict, closed agent→broker schema (m5-allowlist). The model's output is
 * validated here and REJECTED on parse failure, unknown fields, unknown block
 * types, or wrong types — never coerced (PLAN.md §16, Codex R1 #7). This is the
 * load-bearing safety control on a weaker tool-caller.
 *
 * The AI returns a COMPLETE page composition: { layout: [...blocks], theme? }.
 */
import { BLOCK_TYPES, type BlockType } from '../blocks'

export interface LayoutBlock {
  type: BlockType
  heading?: string
  subheading?: string
  buttonLabel?: string
  text?: string
  body?: string
  items?: Array<Record<string, string>>
}
export interface ThemePatch {
  primaryColor?: string
  font?: 'sans' | 'serif'
}
export type LayoutParseResult =
  | { ok: true; layout: LayoutBlock[]; theme?: ThemePatch; message?: string }
  | { ok: false; error: string }

const BLOCK_SCALAR_FIELDS: Record<BlockType, string[]> = {
  hero: ['heading', 'subheading'],
  features: ['heading'],
  products: ['heading'],
  testimonials: ['heading'],
  gallery: ['heading'],
  faq: ['heading'],
  pricing: ['heading'],
  logos: ['heading'],
  cta: ['heading', 'buttonLabel'],
  contact: ['heading', 'text', 'buttonLabel'],
  richText: ['heading', 'body'],
}
const BLOCK_ITEM_FIELDS: Partial<Record<BlockType, string[]>> = {
  features: ['title', 'text'],
  products: ['name', 'description', 'price', 'oldPrice', 'badge', 'buttonLabel'],
  testimonials: ['quote', 'author'],
  gallery: ['caption'],
  faq: ['question', 'answer'],
  pricing: ['name', 'price', 'period', 'features', 'buttonLabel', 'highlighted'],
  logos: ['alt'],
}
const MAX_BLOCKS = 20
const MAX_ITEMS = 12

export function parseLayout(raw: unknown): LayoutParseResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'not an object' }
  const obj = raw as Record<string, unknown>
  for (const k of Object.keys(obj)) if (k !== 'layout' && k !== 'theme' && k !== 'message') return { ok: false, error: `unknown field: ${k}` }
  const message = typeof obj.message === 'string' ? obj.message.slice(0, 300) : undefined

  const rawLayout = obj.layout
  if (!Array.isArray(rawLayout) || rawLayout.length === 0) return { ok: false, error: 'layout must be a non-empty array' }
  if (rawLayout.length > MAX_BLOCKS) return { ok: false, error: 'too many blocks' }

  const layout: LayoutBlock[] = []
  for (const b of rawLayout) {
    if (!b || typeof b !== 'object' || Array.isArray(b)) return { ok: false, error: 'block is not an object' }
    const bo = b as Record<string, unknown>
    const type = bo.type
    if (typeof type !== 'string' || !(BLOCK_TYPES as readonly string[]).includes(type)) {
      return { ok: false, error: `bad block type: ${String(type)}` }
    }
    const bt = type as BlockType
    const scalarFields = BLOCK_SCALAR_FIELDS[bt]
    const itemFields = BLOCK_ITEM_FIELDS[bt]
    const block: LayoutBlock = { type: bt }

    for (const k of Object.keys(bo)) {
      if (k === 'type') continue
      if (k === 'items') {
        if (!itemFields) return { ok: false, error: `${bt} has no items` }
        const items = bo.items
        if (!Array.isArray(items)) return { ok: false, error: 'items must be an array' }
        if (items.length > MAX_ITEMS) return { ok: false, error: 'too many items' }
        const outItems: Record<string, string>[] = []
        for (const it of items) {
          if (!it || typeof it !== 'object' || Array.isArray(it)) return { ok: false, error: 'item is not an object' }
          const ito = it as Record<string, unknown>
          const outItem: Record<string, string> = {}
          for (const ik of Object.keys(ito)) {
            if (!itemFields.includes(ik)) return { ok: false, error: `unknown item field: ${ik}` }
            if (ito[ik] === null) continue // model sometimes echoes nulls — treat as absent
            if (typeof ito[ik] !== 'string') return { ok: false, error: 'item value must be a string' }
            outItem[ik] = ito[ik] as string
          }
          outItems.push(outItem)
        }
        block.items = outItems
      } else {
        if (!scalarFields.includes(k)) return { ok: false, error: `unknown field "${k}" for ${bt}` }
        if (bo[k] === null) continue // treat echoed nulls as absent
        if (typeof bo[k] !== 'string') return { ok: false, error: `"${k}" must be a string` }
        ;(block as unknown as Record<string, unknown>)[k] = bo[k]
      }
    }
    layout.push(block)
  }

  let theme: ThemePatch | undefined
  if ('theme' in obj) {
    const t = obj.theme
    if (!t || typeof t !== 'object' || Array.isArray(t)) return { ok: false, error: 'theme is not an object' }
    const to = t as Record<string, unknown>
    theme = {}
    for (const k of Object.keys(to)) {
      if (k === 'primaryColor') {
        if (to[k] === null) continue
        if (typeof to[k] !== 'string') return { ok: false, error: 'primaryColor must be a string' }
        theme.primaryColor = to[k] as string
      } else if (k === 'font') {
        if (to[k] === null) continue
        if (to[k] !== 'sans' && to[k] !== 'serif') return { ok: false, error: 'font must be sans or serif' }
        theme.font = to[k] as 'sans' | 'serif'
      } else {
        return { ok: false, error: `unknown theme field: ${k}` }
      }
    }
  }

  return { ok: true, layout, theme, message }
}

/**
 * Detect a "create a new page" command typed into the chat (e.g. "add a new page
 * Product", "create a page called About"). The chat normally EDITS the current
 * page, so without this a request to add a page is mistaken for "add a section"
 * and dumps content onto the page the user is already on. Conservative on
 * purpose: only fires when "page" is the explicit object of an add/create/make
 * verb (or a leading "new page"), never on "add a hero to the page" etc.
 * Returns the requested page title, or null when it isn't a page-creation command.
 */
export function detectNewPageIntent(message: string): { title: string } | null {
  const text = message.trim()
  const m =
    text.match(/\b(?:add|create|make)\s+(?:a\s+|an\s+|another\s+|new\s+)*page\b/i) ||
    text.match(/^\s*new\s+page\b/i)
  if (!m) return null
  // Whatever follows the matched command is the intended page name.
  let rest = text.slice((m.index ?? 0) + m[0].length)
  rest = rest.replace(/^[\s:–—-]+/, '') // drop leading separators
  rest = rest.replace(/^(?:called|named|titled)\s+/i, '') // drop connectors
  rest = rest.replace(/^["'“”]+|["'“”]+$/g, '').trim() // drop wrapping quotes
  const title = rest.slice(0, 60).trim()
  return { title: title || 'New Page' }
}

/** Extract a JSON object from a model reply that may wrap it in prose/code fences. */
export function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced ? fenced[1] : text).trim()
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  return start !== -1 && end > start ? candidate.slice(start, end + 1) : candidate
}
