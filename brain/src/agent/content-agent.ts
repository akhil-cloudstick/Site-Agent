import { listTenantPages, updateTenantPage } from '../broker/adapter'
import { ALLOWED_FIELDS, type ContentIntent, extractJsonObject, parseIntent } from './intent'
import { chat } from './openrouter'

/**
 * The content-edit agent (m6-content-agent / m6-orchestrator). It interprets a
 * natural-language request into a strict intent, validates it, and applies it
 * ONLY through the broker adapter — it never touches a store directly. Every
 * failure path is honest: "nothing was changed".
 */
export interface ContentEditResult {
  ok: boolean
  message: string
  intent?: ContentIntent
}

function buildUpdateData(page: any, intent: ContentIntent): Record<string, unknown> {
  if (intent.field === 'title') return { title: intent.value }
  const hero = { ...(page?.hero ?? {}) }
  if (intent.field === 'hero.heading') hero.heading = intent.value
  if (intent.field === 'hero.subheading') hero.subheading = intent.value
  return { hero }
}

export async function runContentEdit(tenantId: number, request: string): Promise<ContentEditResult> {
  const pages = await listTenantPages(tenantId)
  if (pages.length === 0) return { ok: false, message: "There's no page to edit yet — nothing was changed." }

  const pageSummaries = pages.map((p: any) => ({ id: p.id, title: p.title, hero: p.hero }))
  const system = [
    'You edit website content. Reply with ONLY a JSON object — no prose, no code fences.',
    'It must have exactly these keys: action, pageId, field, value.',
    'action must be "update_page_field".',
    `field must be one of: ${ALLOWED_FIELDS.map((f) => `"${f}"`).join(', ')}.`,
    'pageId must be one of the provided page ids. value is the new text for that field.',
  ].join(' ')
  const user = `Pages: ${JSON.stringify(pageSummaries)}\n\nUser request: "${request}"\n\nReturn the JSON intent.`

  let reply
  try {
    reply = await chat([{ role: 'system', content: system }, { role: 'user', content: user }], { json: true })
  } catch {
    return { ok: false, message: "I couldn't reach the AI service — nothing was changed." }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(extractJsonObject(reply.content))
  } catch {
    return { ok: false, message: "I couldn't understand that — nothing was changed." }
  }

  const validated = parseIntent(parsed)
  if (!validated.ok) return { ok: false, message: "I couldn't apply that — nothing was changed." }

  const page = pages.find((p: any) => p.id === validated.intent.pageId)
  if (!page) return { ok: false, message: "I couldn't apply that — nothing was changed." }

  try {
    await updateTenantPage(tenantId, validated.intent.pageId, buildUpdateData(page, validated.intent))
  } catch {
    return { ok: false, message: "I couldn't apply that — nothing was changed." }
  }

  return { ok: true, message: `Done — updated ${validated.intent.field}.`, intent: validated.intent }
}
