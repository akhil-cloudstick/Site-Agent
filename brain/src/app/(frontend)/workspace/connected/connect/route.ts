import { type NextRequest, NextResponse } from 'next/server'

import { getSessionUser, tenantIdOfUser } from '@/auth/session'
import { connectFromFolder, connectSite } from '@/connected/store'
import { fetchPageHtml } from '@/connected/fetch'

/**
 * POST /workspace/connected/connect — connect a website.
 * Body: { name, originUrl, cloudflareProject, sourcePath? }.
 *  - sourcePath set → connect the WHOLE built site from that folder on this machine
 *    (a `dist` folder, or a repo we build). Loads all pages + assets.
 *  - sourcePath empty → fall back to fetching the single page at originUrl.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req.headers)
  if (!user) return NextResponse.json({ ok: false, message: 'Please log in.' }, { status: 401 })
  const tenantId = tenantIdOfUser(user)
  if (!tenantId) return NextResponse.json({ ok: false, message: 'No site linked.' }, { status: 403 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, message: 'Bad request.' }, { status: 400 })
  }
  const originUrl = typeof body?.originUrl === 'string' ? body.originUrl.trim() : ''
  const name = (typeof body?.name === 'string' && body.name.trim()) || originUrl
  const cloudflareProject = typeof body?.cloudflareProject === 'string' ? body.cloudflareProject.trim() : undefined
  const sourcePath = typeof body?.sourcePath === 'string' ? body.sourcePath.trim() : ''
  const repo = typeof body?.repo === 'string' ? body.repo.trim() : undefined

  try {
    if (sourcePath) {
      // Live address is optional here — the site may not be deployed yet. We store a
      // placeholder and fill the real URL in on the first publish.
      const liveOrPending = originUrl || `pending:${name || 'new site'}`
      const site = (await connectFromFolder(tenantId, { name, originUrl: liveOrPending, repo: repo ?? sourcePath, cloudflareProject, sourcePath })) as any
      const pagePaths = Array.isArray(site.pagePaths) ? site.pagePaths : ['/']
      return NextResponse.json({ ok: true, siteId: site.id, pagePaths })
    }
    // URL-only connect (no code given) still needs a live page to read from.
    if (!originUrl) return NextResponse.json({ ok: false, message: 'Enter the website address, or give the site folder/repo.' }, { status: 400 })
    const html = await fetchPageHtml(originUrl)
    const site = (await connectSite(tenantId, { name, originUrl, repo, cloudflareProject, pages: { '/': html } })) as any
    return NextResponse.json({ ok: true, siteId: site.id, pagePaths: ['/'] })
  } catch (err) {
    return NextResponse.json({ ok: false, message: err instanceof Error ? err.message : 'Could not connect that site.' }, { status: 400 })
  }
}
