/**
 * The strict, closed agent→broker intent schema (m5-allowlist). This is the
 * load-bearing safety control for a weaker tool-caller: the model's output is
 * validated here and REJECTED on parse failure, unknown fields, or out-of-scope
 * targets — never coerced (PLAN.md §16, Codex R1 #7). Slice 1 supports exactly
 * one content action: set a single allowlisted text field on an existing page.
 */
export const ALLOWED_FIELDS = ['title', 'hero.heading', 'hero.subheading'] as const
export type AllowedField = (typeof ALLOWED_FIELDS)[number]

export interface ContentIntent {
  action: 'update_page_field'
  pageId: number
  field: AllowedField
  value: string
}

export type IntentParseResult =
  | { ok: true; intent: ContentIntent }
  | { ok: false; error: string }

const ALLOWED_KEYS = new Set(['action', 'pageId', 'field', 'value'])

export function parseIntent(raw: unknown): IntentParseResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'intent is not an object' }
  }
  const obj = raw as Record<string, unknown>

  for (const key of Object.keys(obj)) {
    if (!ALLOWED_KEYS.has(key)) return { ok: false, error: `unknown field: ${key}` }
  }
  if (obj.action !== 'update_page_field') {
    return { ok: false, error: `unsupported action: ${String(obj.action)}` }
  }
  if (typeof obj.pageId !== 'number' || !Number.isInteger(obj.pageId)) {
    return { ok: false, error: 'pageId must be an integer' }
  }
  if (typeof obj.field !== 'string' || !(ALLOWED_FIELDS as readonly string[]).includes(obj.field)) {
    return { ok: false, error: `field not allowed: ${String(obj.field)}` }
  }
  if (typeof obj.value !== 'string') {
    return { ok: false, error: 'value must be a string' }
  }
  return {
    ok: true,
    intent: { action: 'update_page_field', pageId: obj.pageId, field: obj.field as AllowedField, value: obj.value },
  }
}

/** Extract a JSON object from a model reply that may wrap it in prose/code fences. */
export function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced ? fenced[1] : text).trim()
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  return start !== -1 && end > start ? candidate.slice(start, end + 1) : candidate
}
