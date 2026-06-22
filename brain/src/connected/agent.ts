import { extractJsonObject } from '../agent/intent'
import { chat } from '../agent/openrouter'
import type { ContentMap } from './content'

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
