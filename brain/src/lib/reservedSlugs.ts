/**
 * Canonical reserved URL segments that may NOT be used as a tenant slug, because
 * they collide with real top-level routes (or Payload/Next internals).
 *
 * Centralized here so tenant-creation validation and its tests share ONE source of
 * truth and can't drift (Codex R1 #13). When a new top-level route segment is added
 * to the app, add it here too.
 */
export const RESERVED_SLUGS: readonly string[] = [
  'admin',
  'api',
  'connected',
  'site',
  'workspace',
  'login',
  'logout',
  'operator',
  'media',
  '_next',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
]

const RESERVED = new Set(RESERVED_SLUGS)

/** Normalize a tenant name into a URL-safe slug candidate (lowercase, `_`-joined). */
export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

/** True if `slug` collides with a reserved top-level route segment. */
export function isReservedSlug(slug: string): boolean {
  return RESERVED.has(slug.toLowerCase())
}
