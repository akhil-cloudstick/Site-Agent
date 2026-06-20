import { buildLayoutForWrite, normalizeLayout } from '@/workspace/layout'

import { BLOCK_TYPES } from '../blocks'
import { listTenantPages, updateTenantPage } from '../broker/adapter'
import { extractJsonObject, parseLayout } from './intent'
import { chat } from './openrouter'

/**
 * The design agent (m6-content-agent / m6-structural-agent). It interprets a
 * natural-language request into a COMPLETE page layout (an ordered list of
 * section blocks) plus optional theme, validates it, and applies it ONLY through
 * the broker adapter. This is the dynamic "compose anything" model: add/remove/
 * reorder sections and items freely. Every failure path is honest.
 */
export interface ContentEditResult {
  ok: boolean
  message: string
}

const SCALARS = ['heading', 'subheading', 'buttonLabel', 'text', 'body'] as const
const ITEM_KEYS = ['title', 'text', 'quote', 'author', 'name', 'description', 'price', 'oldPrice', 'badge', 'buttonLabel'] as const

export async function runContentEdit(
  tenantId: number,
  pageId: number | undefined,
  request: string,
  imageDataUrl?: string,
  targetIndex?: number,
): Promise<ContentEditResult> {
  const pages = await listTenantPages(tenantId, 1)
  if (pages.length === 0) return { ok: false, message: "There's no page to edit yet — nothing was changed." }
  const page = (pageId && pages.find((p: any) => p.id === pageId)) || (pages[0] as any)

  // Compact current page so the model can extend/modify it.
  const currentLayout = (Array.isArray(page.layout) ? page.layout : []).map((b: any) => {
    const o: any = { type: b.blockType }
    for (const f of SCALARS) if (b[f]) o[f] = b[f]
    if (Array.isArray(b.items)) {
      o.items = b.items.map((it: any) => {
        const x: any = {}
        for (const k of ITEM_KEYS) if (it?.[k]) x[k] = it[k]
        return x
      })
    }
    return o
  })

  const system = [
    'You design a website page. Reply with ONLY a JSON object {"layout":[...blocks], "theme":{...}, "message":"..."} — no prose, no code fences.',
    'The "message" is a short, friendly, plain-language sentence to the customer describing exactly what you changed (e.g. "Done — I changed your main heading to \'Welcome\'." or "Added a products section with 3 items."). Speak TO the customer; never mention JSON, blocks, or layout internals.',
    `Each block has a "type", one of: ${BLOCK_TYPES.map((t) => `"${t}"`).join(', ')}.`,
    'Block fields — hero: {heading, subheading}; features: {heading, items:[{title,text}]}; products: {heading, items:[{name, description?, price?, oldPrice?, badge?, buttonLabel?}]} (use products for shop/product grids; ONLY include the optional fields the user actually asks for — for a simple catalog use just name + description; oldPrice shows struck-through; badge is e.g. "-30%"); testimonials: {heading, items:[{quote,author}]}; cta: {heading, buttonLabel}; contact: {heading, text, buttonLabel}; richText: {heading, body}.',
    'Return the COMPLETE layout you want, in order. To add a section include a new block; to add items include more items; to reorder change the order; keep the blocks the user did not ask to change.',
    'You may also set "theme": {"primaryColor":"#hex", "font":"sans"|"serif"}.',
    'All values are strings. If a reference image is attached, use what you see in it to inform the design.',
  ].join(' ')
  const focusNote =
    typeof targetIndex === 'number' && currentLayout[targetIndex]
      ? `\n\nThe user is pointing at section #${targetIndex} (a "${currentLayout[targetIndex].type}" section). Apply their request to THAT section; leave the other sections unchanged.`
      : ''
  const userText = `Current page: ${JSON.stringify({ layout: currentLayout, theme: page.theme ?? {} })}\n\nUser request: "${request}"${focusNote}\n\nReturn the JSON.`

  const userMessage = imageDataUrl
    ? {
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: userText },
          { type: 'image_url' as const, image_url: { url: imageDataUrl } },
        ],
      }
    : { role: 'user' as const, content: userText }

  let reply
  try {
    reply = await chat([{ role: 'system', content: system }, userMessage], { json: !imageDataUrl })
  } catch {
    return { ok: false, message: "I couldn't reach the AI service — nothing was changed." }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(extractJsonObject(reply.content))
  } catch {
    return { ok: false, message: "I couldn't understand that — nothing was changed." }
  }

  const validated = parseLayout(parsed)
  if (!validated.ok) return { ok: false, message: "I couldn't apply that — nothing was changed." }

  const data: any = { layout: buildLayoutForWrite(page, validated.layout), previousLayout: normalizeLayout(page) }
  if (validated.theme) {
    data.theme = { primaryColor: page.theme?.primaryColor, font: page.theme?.font, ...validated.theme }
  }

  try {
    await updateTenantPage(tenantId, page.id, data)
  } catch {
    return { ok: false, message: "I couldn't apply that — nothing was changed." }
  }

  const n = validated.layout.length
  const fallback = `Done — your page now has ${n} section${n === 1 ? '' : 's'}.`
  return { ok: true, message: validated.message?.trim() || fallback }
}
