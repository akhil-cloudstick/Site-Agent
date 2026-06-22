import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { type NextRequest, NextResponse } from 'next/server'

import { getSessionUser, tenantIdOfUser } from '@/auth/session'
import { applyContent } from '@/connected/html'
import { getConnectedSite } from '@/connected/store'

export const dynamic = 'force-dynamic'

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json',
}

/**
 * Serve a connected site under /connected/<id>/… so it can be edited in an iframe:
 *  - HTML pages get the DRAFT content applied + the click-to-edit editor, and their
 *    asset links rewritten to this same prefix;
 *  - any other path (CSS/JS/images) is served from the site's managed folder, so the
 *    preview looks exactly like the real, fully-styled site.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ siteId: string; path?: string[] }> }) {
  const user = await getSessionUser(req.headers)
  if (!user) return new NextResponse('Please log in.', { status: 401 })
  const tenantId = tenantIdOfUser(user)
  if (!tenantId) return new NextResponse('No site linked.', { status: 403 })

  const { siteId, path: segs } = await params
  const site = (await getConnectedSite(tenantId, Number(siteId))) as any
  if (!site) return new NextResponse('Site not found.', { status: 404 })

  const parts = (segs ?? []).filter((s) => s !== '..' && s !== '.')
  const pathname = parts.length ? '/' + parts.join('/') : '/'
  const prefix = `/connected/${siteId}`

  // An HTML page → apply draft content + the editor (which stays inactive until the
  // workspace turns edit mode on via postMessage — so toggling never reloads) + rewrite
  // asset links so the preview is fully styled under this prefix.
  const html = (site.sourceHtml ?? {})[pathname]
  if (html) {
    const draft = (site.draftContent ?? {})[pathname] ?? {}
    const rendered = applyContent(html, draft, { editor: true, assetPrefix: prefix })
    return new NextResponse(rendered, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
  }

  // Otherwise serve a static asset from the site's managed folder.
  if (site.sourcePath && parts.length) {
    try {
      const file = path.join(site.sourcePath, ...parts)
      // Stay inside the managed folder (defence in depth; '..' already filtered).
      if (!file.startsWith(path.resolve(site.sourcePath))) return new NextResponse('Not found.', { status: 404 })
      const data = await readFile(file)
      const type = CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream'
      return new NextResponse(data, { status: 200, headers: { 'content-type': type, 'cache-control': 'no-store' } })
    } catch {
      return new NextResponse('Not found.', { status: 404 })
    }
  }

  return new NextResponse('Page not found.', { status: 404 })
}
