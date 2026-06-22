import { existsSync } from 'node:fs'
import { copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { cloudflareConfigured, deployConnectedSite } from '../publish/deploy-cloudflare'
import type { ContentMap } from './content'
import { applyContent } from './html'
import { getConnectedSite, updateConnectedSite, type PageHtmlMap, type SiteContentMap } from './store'

const pathForRoute = (route: string) => (route === '/' || route === '' ? 'index.html' : `${route.replace(/^\/+/, '')}/index.html`)

/** Where SiteAgent stores uploaded media on disk (same as the block publisher). */
const MEDIA_DIR = path.join(process.cwd(), 'media')

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

/**
 * Make uploaded (replacement) images self-contained in the deploy folder: copy each
 * SiteAgent-media image into `<dir>/sa-media/<file>` and repoint its value there, so
 * the LIVE site shows it (a Cloudflare bundle has no /api/media). The site's own
 * original images (already in the folder) are left untouched.
 */
async function bundleMedia(content: SiteContentMap, dir: string): Promise<SiteContentMap> {
  const out: SiteContentMap = {}
  for (const [pathname, map] of Object.entries(content)) {
    const nm: ContentMap = {}
    for (const [id, entry] of Object.entries(map)) {
      if (entry.type === 'image') {
        const name = fileNameFromUrl(entry.value)
        if (name && existsSync(path.join(MEDIA_DIR, name))) {
          await mkdir(path.join(dir, 'sa-media'), { recursive: true })
          await copyFile(path.join(MEDIA_DIR, name), path.join(dir, 'sa-media', name)).catch(() => {})
          nm[id] = { ...entry, value: `/sa-media/${encodeURIComponent(name)}` }
          continue
        }
      }
      nm[id] = entry
    }
    out[pathname] = nm
  }
  return out
}

/** Find a route's HTML file inside a built-site folder (about → about.html or about/index.html). */
function fileForRoute(dir: string, route: string): string | null {
  if (route === '/' || route === '') return existsSync(path.join(dir, 'index.html')) ? path.join(dir, 'index.html') : null
  const rel = route.replace(/^\/+/, '')
  for (const c of [`${rel}.html`, `${rel}/index.html`]) {
    const f = path.join(dir, c)
    if (existsSync(f)) return f
  }
  return null
}

/**
 * Build the deploy folder for a connected site that has its WHOLE built site stored:
 * copy the managed folder (all pages + CSS/JS/images), then apply the content onto
 * each page in place. Returns the folder path.
 */
export async function buildWholeSite(sourcePath: string, sourceHtml: PageHtmlMap, content: SiteContentMap, dir: string) {
  await rm(dir, { recursive: true, force: true })
  await cp(sourcePath, dir, { recursive: true })
  const bundled = await bundleMedia(content, dir)
  for (const [route, html] of Object.entries(sourceHtml)) {
    const dest = fileForRoute(dir, route)
    // Apply onto the stored HTML (clean, no editor/prefix) and write to the page's file.
    const out = applyContent(html, bundled[route] ?? {})
    if (dest) await writeFile(dest, out, 'utf8')
    else {
      const fallback = path.join(dir, pathForRoute(route))
      await mkdir(path.dirname(fallback), { recursive: true })
      await writeFile(fallback, out, 'utf8')
    }
  }
}

/** Render a connected site's pages with the given content (applied onto the stored HTML). */
export function renderSite(sourceHtml: PageHtmlMap, content: SiteContentMap): PageHtmlMap {
  const out: PageHtmlMap = {}
  for (const [pathname, html] of Object.entries(sourceHtml)) {
    out[pathname] = applyContent(html, content[pathname] ?? {})
  }
  return out
}

/**
 * Publish: render the DRAFT content onto the site's HTML, deploy it to the site's
 * own Cloudflare project (same URL), then rotate snapshots (previous ← published,
 * published ← draft) so rollback is one step. Returns the live URL.
 */
export async function publishConnectedSite(tenantId: number, siteId: number): Promise<{ url: string }> {
  const site = (await getConnectedSite(tenantId, siteId)) as any
  if (!site) throw new Error('Site not found')
  if (!cloudflareConfigured()) throw new Error('Cloudflare is not configured')
  const project = site.cloudflareProject
  if (!project) throw new Error('No Cloudflare project set for this site')

  const sourceHtml: PageHtmlMap = site.sourceHtml ?? {}
  const draft: SiteContentMap = site.draftContent ?? {}
  const dir = path.join(process.cwd(), '.connected-publish', String(siteId))

  if (site.sourcePath && existsSync(site.sourcePath)) {
    // Whole-site deploy: keep all pages + CSS/JS/images, apply content onto each page.
    await buildWholeSite(site.sourcePath, sourceHtml, draft, dir)
  } else {
    // Fallback (single self-contained page, no managed folder): just the rendered HTML.
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })
    const rendered = renderSite(sourceHtml, await bundleMedia(draft, dir))
    for (const [route, html] of Object.entries(rendered)) {
      const dest = path.join(dir, pathForRoute(route))
      await mkdir(path.dirname(dest), { recursive: true })
      await writeFile(dest, html, 'utf8')
    }
  }

  const { url: deployedUrl } = await deployConnectedSite(project, dir)
  // The live URL is the site's own address if it has one (custom domain), else the
  // Cloudflare URL we just deployed to (e.g. a brand-new, not-previously-deployed site).
  const originUrl = typeof site.originUrl === 'string' ? site.originUrl.trim() : ''
  const url = originUrl && !originUrl.startsWith('pending:') ? originUrl : deployedUrl

  // Success → rotate snapshots for rollback + record the live URL (+ fill it in if this
  // was the very first deploy of a site that wasn't live yet).
  await updateConnectedSite(tenantId, siteId, {
    previousContent: site.publishedContent ?? {},
    publishedContent: draft,
    originUrl: originUrl && !originUrl.startsWith('pending:') ? originUrl : deployedUrl,
    liveUrl: url,
  })
  return { url }
}

/** Roll back: make the previous published content the live + draft content again, and redeploy. */
export async function rollbackConnectedSite(tenantId: number, siteId: number): Promise<{ url: string }> {
  const site = (await getConnectedSite(tenantId, siteId)) as any
  if (!site) throw new Error('Site not found')
  const previous: SiteContentMap = site.previousContent ?? {}
  await updateConnectedSite(tenantId, siteId, { draftContent: previous })
  return publishConnectedSite(tenantId, siteId)
}
