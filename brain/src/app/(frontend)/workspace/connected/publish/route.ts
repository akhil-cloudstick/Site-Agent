import { type NextRequest, NextResponse } from 'next/server'
import path from 'node:path'
import { rm } from 'node:fs/promises'

import { getSessionUser, tenantIdOfUser } from '@/auth/session'
import { publishConnectedSite, rollbackConnectedSite } from '@/connected/publish'
import { startJob } from '@/jobs/runner'
import { reapStaleJobs } from '@/jobs/store'

/** POST /workspace/connected/publish — render the draft onto the site + deploy to the same URL.
 *  Runs as a background JOB (Cloudflare upload is slow): returns { jobId } immediately and
 *  the client tracks progress via /workspace/connected/job. Body: { siteId, rollback? }. */
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
  const siteId = Number(body?.siteId)
  if (!siteId) return NextResponse.json({ ok: false, message: 'Bad request.' }, { status: 400 })
  const rollback = Boolean(body?.rollback)

  try {
    await reapStaleJobs(tenantId).catch(() => {})
    const jobId = await startJob({
      tenant: tenantId,
      type: 'publish',
      siteId,
      work: async (ctx) => {
        const { url } = rollback ? await rollbackConnectedSite(tenantId, siteId, ctx) : await publishConnectedSite(tenantId, siteId, ctx)
        ctx.reporter(100, rollback ? 'Rolled back and republished.' : 'Published — your site is live.', 'ok')
        return { url, rollback }
      },
      cleanup: async (report) => {
        report('Cleaning up…')
        await rm(path.join(process.cwd(), '.connected-publish', String(siteId)), { recursive: true, force: true }).catch(() => {})
      },
    })
    return NextResponse.json({ ok: true, jobId })
  } catch (err) {
    return NextResponse.json({ ok: false, message: err instanceof Error ? err.message : 'Publishing failed.' }, { status: 500 })
  }
}
