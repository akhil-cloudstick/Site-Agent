import { type NextRequest, NextResponse } from 'next/server'

import { getSessionUser, tenantIdOfUser } from '@/auth/session'
import { deleteConnectedSite } from '@/connected/store'
import { startJob } from '@/jobs/runner'
import { reapStaleJobs } from '@/jobs/store'

/** POST /workspace/connected/delete — remove a connected site. Runs as a background JOB
 *  (removing a large cloned repo can take a moment): returns { jobId }. Body: { siteId }. */
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

  try {
    await reapStaleJobs(tenantId).catch(() => {})
    const jobId = await startJob({
      tenant: tenantId,
      type: 'delete',
      siteId,
      work: async (ctx) => {
        ctx.reporter(0, 'Removing…')
        await deleteConnectedSite(tenantId, siteId, ctx)
        ctx.reporter(100, 'Removed.', 'ok')
        return { siteId }
      },
    })
    return NextResponse.json({ ok: true, jobId })
  } catch (err) {
    return NextResponse.json({ ok: false, message: err instanceof Error ? err.message : 'Could not remove.' }, { status: 500 })
  }
}
