import { readFile } from 'node:fs/promises'

/**
 * A connected site's editable content is a flat map of key → entry. Each entry is
 * a piece of text or an image the templates render. Keys are stable names the
 * client gives (e.g. "hero.heading", "hero.image"); SiteAgent never invents them.
 *
 *   { "hero.heading": { "type": "text",  "value": "Welcome" },
 *     "hero.image":   { "type": "image", "value": "/images/hero.jpg" } }
 */
export type ContentKind = 'text' | 'image'
export interface ContentEntry {
  type: ContentKind
  value: string
}
export type ContentMap = Record<string, ContentEntry>

const isImageKey = (k: string) => /image|img|photo|logo|icon|banner|background/i.test(k)

/** Normalize a raw content object into a ContentMap (tolerant of plain-string values). */
export function normalizeContent(parsed: unknown): ContentMap {
  const out: ContentMap = {}
  if (!parsed || typeof parsed !== 'object') return out
  for (const [key, raw] of Object.entries(parsed as Record<string, unknown>)) {
    if (raw && typeof raw === 'object' && 'value' in (raw as any)) {
      const r = raw as { type?: unknown; value?: unknown }
      out[key] = { type: r.type === 'image' ? 'image' : 'text', value: String(r.value ?? '') }
    } else if (typeof raw === 'string') {
      out[key] = { type: isImageKey(key) ? 'image' : 'text', value: raw }
    }
  }
  return out
}

/** Read + normalize a site's content file from disk (the handed-over codebase). */
export async function readContentFile(filePath: string): Promise<ContentMap> {
  const raw = await readFile(filePath, 'utf8')
  return normalizeContent(JSON.parse(raw))
}

/** Serialize a ContentMap back to the file shape the templates read. */
export function serializeContent(content: ContentMap): string {
  return JSON.stringify(content, null, 2)
}
