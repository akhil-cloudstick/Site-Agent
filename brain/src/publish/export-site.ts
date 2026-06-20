import { existsSync } from 'node:fs'
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { loadPublishedSite, type PublishedSite } from './published'
import { renderSiteBody } from './render-html'

const MEDIA_DIR = path.join(process.cwd(), 'media')

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

/** Pull a media filename out of an image URL (last path segment, decoded). */
function fileNameFromUrl(url?: string): string | null {
  if (!url) return null
  const seg = url.split('?')[0].split('/').pop() || ''
  try {
    return decodeURIComponent(seg) || null
  } catch {
    return seg || null
  }
}

/** Rewrite every image URL in the site to a local /assets/<file> path and collect the files to copy. */
function stageImages(site: PublishedSite): { site: PublishedSite; assets: Set<string> } {
  const assets = new Set<string>()
  const rewrite = (url?: string): string | undefined => {
    const name = fileNameFromUrl(url)
    if (!name) return url
    assets.add(name)
    return `/assets/${encodeURIComponent(name)}`
  }
  const pages = site.pages.map((p) => ({
    ...p,
    layout: p.layout.map((b: any) => {
      const nb: any = { ...b }
      if (nb.imageUrl) nb.imageUrl = rewrite(nb.imageUrl)
      if (Array.isArray(nb.items)) nb.items = nb.items.map((it: any) => (it.imageUrl ? { ...it, imageUrl: rewrite(it.imageUrl) } : it))
      return nb
    }),
  }))
  return { site: { ...site, pages }, assets }
}

/** '/' -> index.html ; '/about' -> about/index.html (clean URLs on Cloudflare Pages). */
const pathForRoute = (route: string) => (route === '/' ? 'index.html' : `${route.replace(/^\//, '')}/index.html`)

/**
 * Render a tenant's PUBLISHED site to a self-contained static folder (HTML per
 * page + copied images under /assets). Returns null if nothing is published.
 */
export async function exportSite(slug: string, outDir: string): Promise<{ pages: number } | null> {
  const raw = await loadPublishedSite(slug)
  if (!raw) return null
  const { site, assets } = stageImages(raw)

  await rm(outDir, { recursive: true, force: true })
  await mkdir(path.join(outDir, 'assets'), { recursive: true })

  for (const page of site.pages) {
    const body = renderSiteBody(site, page, '')
    const html =
      `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width, initial-scale=1">` +
      `<title>${escapeHtml(page.title || site.name)}</title></head>` +
      `<body style="margin:0">${body}</body></html>`
    const dest = path.join(outDir, pathForRoute(page.route))
    await mkdir(path.dirname(dest), { recursive: true })
    await writeFile(dest, html, 'utf8')
  }

  for (const name of assets) {
    const src = path.join(MEDIA_DIR, name)
    if (existsSync(src)) {
      await copyFile(src, path.join(outDir, 'assets', name)).catch(() => {})
    }
  }

  return { pages: site.pages.length }
}
