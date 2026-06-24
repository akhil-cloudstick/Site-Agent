import { type NextRequest, NextResponse } from 'next/server'

import { requireWritableTenant } from '@/auth/requireTenant'
import { fetchPageHtml } from '@/connected/fetch'
import { connectSite, createConnectedSiteShell, deleteConnectedSite, ingestConnectedSite } from '@/connected/store'
import { reapStaleJobs } from '@/jobs/store'
import { startJob } from '@/jobs/runner'

/**
 * POST /workspace/connected/connect — connect a website.
 * Body: { name, originUrl, cloudflareProject, sourcePath? }.
 *  - sourcePath set → connect the WHOLE built site from that folder/repo. This is the
 *    slow path (clone/build/copy), so it runs as a background JOB: returns { jobId,
 *    siteId } immediately and the client tracks progress via /workspace/connected/job.
 *  - sourcePath empty → fall back to fetching the single page at originUrl (fast, sync).
 */
export async function POST(req: NextRequest) {
  const guard = await requireWritableTenant(req.headers)
  if (guard.response) return guard.response
  const tenantId = guard.tenant!.tenantId

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, message: 'Bad request.' }, { status: 400 })
  }
  const originUrl = typeof body?.originUrl === 'string' ? body.originUrl.trim() : ''
  const name = (typeof body?.name === 'string' && body.name.trim()) || originUrl || 'New site'
  const cloudflareProject = typeof body?.cloudflareProject === 'string' ? body.cloudflareProject.trim() : undefined
  const sourcePath = typeof body?.sourcePath === 'string' ? body.sourcePath.trim() : ''
  const repo = typeof body?.repo === 'string' ? body.repo.trim() : undefined

  try {
    await reapStaleJobs(tenantId).catch(() => {})
    if (sourcePath) {
      // Live address is optional here — the site may not be deployed yet. Store a
      // placeholder and fill the real URL in on the first publish.
      const liveOrPending = originUrl || `pending:${name}`
      const shell = (await createConnectedSiteShell(tenantId, { name, originUrl: liveOrPending, repo: repo ?? sourcePath, cloudflareProject })) as any
      const siteId = shell.id as number
      const jobId = await startJob({
        tenant: tenantId,
        type: 'connect',
        siteId,
        work: async (ctx) => {
          const { pagePaths } = await ingestConnectedSite(tenantId, siteId, sourcePath, ctx, name)
          const n = Array.isArray(pagePaths) ? pagePaths.length : 1
          ctx.reporter(100, `Connected — ${n} ${n === 1 ? 'page' : 'pages'} loaded.`, 'ok')
          return { pagePaths }
        },
        cleanup: async (report) => {
          report('Cancelling… removing the cloned files…')
          await deleteConnectedSite(tenantId, siteId).catch(() => {})
        },
      })
      return NextResponse.json({ ok: true, jobId, siteId })
    }
    // URL-only connect (no code given) still needs a live page to read from — fast + sync.
    if (!originUrl) return NextResponse.json({ ok: false, message: 'Enter the website address, or give the site folder/repo.' }, { status: 400 })
    const html = await fetchPageHtml(originUrl)
    const site = (await connectSite(tenantId, { name, originUrl, repo, cloudflareProject, pages: { '/': html } })) as any
    return NextResponse.json({ ok: true, siteId: site.id, pagePaths: ['/'] })
  } catch (err) {
    return NextResponse.json({ ok: false, message: err instanceof Error ? err.message : 'Could not connect that site.' }, { status: 400 })
  }
}
