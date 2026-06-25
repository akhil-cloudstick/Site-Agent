import { extractJsonObject } from '../agent/intent'
import { chat } from '../agent/openrouter'
import type { ContentMap } from './content'
import { parseGeneratedSection, type ParsedSection } from './structure'

export interface ConnectedEdit {
  id: string
  value: string
}

/**
 * Chat-edit a connected site's content. Given the page's editable TEXT items
 * (id + current value) and the user's request, ask the model which to change.
 * Strict + fail-closed: only ids that exist are accepted (mirrors intent.ts).
 */
export async function planConnectedEdits(content: ContentMap, request: string, refImageUrl?: string): Promise<ConnectedEdit[]> {
  // Only text items are chat-editable (images are swapped via upload).
  const items = Object.entries(content)
    .filter(([, e]) => e.type === 'text')
    .map(([id, e]) => ({ id, text: e.value }))
  if (items.length === 0) return []

  const system = [
    'You edit the text content of a website. You are given the page\'s editable items (each has an "id" and current "text") and a user request.',
    'Reply with ONLY JSON: {"edits":[{"id":"<one of the given ids>","value":"<new text>"}]} — no prose, no code fences.',
    'Only use ids from the given list. Only include items that should change. If nothing applies, reply {"edits":[]}.',
  ].join(' ')
  const userText =
    `Editable items: ${JSON.stringify(items)}\n\nUser request: "${request}"` +
    (refImageUrl ? '\n\nA reference image is attached — use it as the guide for the new wording/content.' : '') +
    '\n\nReturn the JSON.'
  // If a reference image was given, send it alongside the text (the model is multimodal).
  const userContent = refImageUrl
    ? ([{ type: 'text', text: userText }, { type: 'image_url', image_url: { url: refImageUrl } }] as const)
    : userText

  let reply
  try {
    reply = await chat([{ role: 'system', content: system }, { role: 'user', content: userContent as any }], { json: true })
  } catch {
    return []
  }

  let parsed: any
  try {
    parsed = JSON.parse(extractJsonObject(reply.content))
  } catch {
    return []
  }
  if (!parsed || !Array.isArray(parsed.edits)) return []

  const valid = new Set(items.map((i) => i.id))
  const edits: ConnectedEdit[] = []
  for (const e of parsed.edits) {
    if (e && typeof e.id === 'string' && valid.has(e.id) && typeof e.value === 'string') {
      edits.push({ id: e.id, value: e.value })
    }
  }
  return edits
}

// ── UI/UX generation (Track D/G): generate a section or a whole page's content as
//    SAFE HTML styled to the site, then hard-validate it. Fail-closed. ────────────

const TAG_LIST =
  'section, div, article, header, footer, aside, nav, h1-h6, p, span, strong, em, ul, ol, li, a, img, figure, figcaption, button, table, blockquote'

export interface SiteTheme {
  bg?: string
  color?: string
  accent?: string
  font?: string
}

function themeLine(t?: SiteTheme): string {
  if (!t || !(t.bg || t.color || t.accent || t.font)) return ''
  return `MATCH THE SITE'S THEME — use these EXACT values in your inline styles so the new content blends in: section background ${t.bg || '(the page background)'}, text color ${t.color || '(the page text color)'}, primary/accent + button background ${t.accent || t.color || '#2563eb'}, font-family ${t.font || 'inherit'}. Respect the site's light/dark mode (if the background is dark, use light text). Do not introduce off-theme colors.`
}

function genSystem(scope: 'section' | 'page', kind: string | undefined, classes: string[], theme?: SiteTheme): string {
  return [
    `You generate ${scope === 'page' ? 'the MAIN content of a web page (a sequence of polished sections)' : 'ONE polished, modern website section'} as SAFE, static HTML that looks GREAT and ON-BRAND.`,
    'Reply with ONLY JSON: {"html":"<…>","message":"<one short friendly sentence about what you built>"} — no prose, no code fences.',
    `Use these tags: ${TAG_LIST}. NEVER use <script>, <style>, or <iframe>; NO on* event handlers; NO srcset; NO javascript: URLs. Simple form fields are OK (<form>, <input>, <label>, <select>, <textarea>, <button>) — but no event handlers and no formaction. You MAY use simple inline <svg> icons (path/circle/rect/line/polygon/g only — never <script>, <foreignObject>, <use>, <image>, or any href/xlink:href inside the svg).`,
    'CRITICAL — it must look fully designed WITHOUT any external CSS, because it is shown on a blank page. Put ALL presentational styling in inline style="" attributes: background colors, text colors, generous padding (e.g. 64px 24px), a centered ~1100px max-width container (margin:0 auto), readable font-sizes, clear hierarchy, rounded corners, a clearly-styled primary BUTTON (solid background color, padding, border-radius, no underline), flexbox/grid with flex-wrap for responsive multi-column layouts, and subtle gradients where they fit. Do NOT rely on class names for styling — assume none of them are defined. Do NOT use @import, expression(), or url(javascript:).',
    scope === 'page'
      ? 'Do NOT include a <header>, top navigation/menu, site logo, or <footer> — the page already has those. Output ONLY the inner content sections (hero, features, etc.).'
      : '',
    themeLine(theme),
    kind ? `This is a "${kind}" section.` : '',
    'Fill it with realistic placeholder text the customer can edit. For images use <img> with an https or relative src and width/height (or omit images). Keep it self-contained — no external dependencies or fonts. Never output a large EMPTY placeholder box, and never invent extra sections, pricing/plan cards, or panels that were not asked for — if a visual cannot be reproduced, use a relevant <img> or omit it.',
  ]
    .filter(Boolean)
    .join(' ')
}

async function runGeneration(system: string, userText: string, refImageUrl?: string, timeoutMs?: number): Promise<ParsedSection> {
  const userContent = refImageUrl
    ? ([{ type: 'text', text: userText }, { type: 'image_url', image_url: { url: refImageUrl } }] as const)
    : userText
  let reply
  try {
    reply = await chat([{ role: 'system', content: system }, { role: 'user', content: userContent as any }], { json: !refImageUrl, timeoutMs })
  } catch (e) {
    // Surface the real reason (which model failed and how) instead of a generic message.
    const msg = e instanceof Error ? e.message : String(e)
    const detail = msg.replace(/^All models failed:\s*/i, '').replace(/\n+/g, ' · ').slice(0, 240)
    return { ok: false, error: detail || 'The AI service is unavailable.' }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(extractJsonObject(reply.content))
  } catch {
    return { ok: false, error: "Couldn't read the model's reply." }
  }
  return parseGeneratedSection(parsed)
}

export interface GenerateOpts {
  request?: string
  kind?: string
  siteClasses: string[]
  refImageUrl?: string
  referenceHtml?: string
  /** When present, this is an EDIT: the current section/page HTML the model should modify. */
  editHtml?: string
  /** The site's rendered theme (captured client-side) so generated HTML matches it. */
  theme?: SiteTheme
}

/** Generate or EDIT ONE section as safe, self-styled HTML (validated, fail-closed). */
export function planConnectedSection(opts: GenerateOpts): Promise<ParsedSection> {
  const parts: string[] = []
  if (opts.editHtml) {
    parts.push('Modify the existing section below per the change. Return the FULL updated section HTML (keep anything not mentioned), still fully self-styled with inline CSS.')
    parts.push(`Change: "${opts.request ?? 'improve and polish it'}"`)
    parts.push(`Current section HTML:\n${opts.editHtml.slice(0, 12000)}`)
  } else {
    parts.push(opts.request ? `Request: "${opts.request}"` : opts.kind ? `Create a ${opts.kind} section.` : 'Create a section.')
  }
  if (opts.referenceHtml)
    parts.push(
      `Reproduce this reference's DESIGN — its layout/structure and theme (colors, light/dark, fonts, spacing). Reproduce ONLY what's in the reference — no extra sections, cards, or empty boxes. Translate the reference's classes/styles into equivalent INLINE style="" attributes so it looks identical on a blank page (use the theme colors above for any custom/brand classes). Use safe tags + inline styles:\n${opts.referenceHtml.slice(0, 9000)}`,
    )
  if (opts.refImageUrl) parts.push("A reference image is attached — reproduce its layout AND its colors/theme as closely as you safely can.")
  parts.push('Return the JSON.')
  // Always give the model the site's concrete theme colors — it needs them to inline-style
  // brand/custom classes (e.g. a "crimson" button) it can't otherwise resolve.
  return runGeneration(genSystem('section', opts.kind, opts.siteClasses, opts.theme), parts.join('\n\n'), opts.refImageUrl, 90_000)
}

/** Generate or EDIT a whole page's main content (multiple sections) as safe, self-styled HTML. */
export function planConnectedPage(opts: GenerateOpts): Promise<ParsedSection> {
  const parts: string[] = []
  if (opts.editHtml) {
    parts.push("Modify the page's current content below per the change. Return the FULL updated page body (keep anything not mentioned), still fully self-styled with inline CSS.")
    parts.push(`Change: "${opts.request ?? 'improve and polish it'}"`)
    parts.push(`Current page content HTML:\n${opts.editHtml.slice(0, 14000)}`)
  } else {
    parts.push(opts.request ? `Build a page for: "${opts.request}"` : 'Build a page.')
  }
  if (opts.referenceHtml)
    parts.push(
      `Reproduce this reference page's DESIGN — its layout/structure and theme (colors, light/dark, fonts, spacing). Reproduce ONLY the sections in the reference — no extra sections, plan cards, or empty boxes. Translate the reference's classes/styles into equivalent INLINE style="" attributes so it looks identical on a blank page (use the theme colors above for any custom/brand classes). Use safe tags + inline styles:\n${opts.referenceHtml.slice(0, 13000)}`,
    )
  if (opts.refImageUrl) parts.push("A reference image is attached — reproduce its layout AND its colors/theme as closely as you safely can.")
  parts.push('Return the JSON (html = the sequence of sections for the page body).')
  // Always give the model the site's concrete theme colors to inline-style brand classes.
  // Pages are heavy: give the first model a generous 150s; if it still fails, the fallback
  // model gets the remaining ~90s of the 240s client budget.
  return runGeneration(genSystem('page', undefined, opts.siteClasses, opts.theme), parts.join('\n\n'), opts.refImageUrl, 150_000)
}
