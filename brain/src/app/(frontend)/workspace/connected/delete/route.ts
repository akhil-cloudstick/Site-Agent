import { type NextRequest, NextResponse } from 'next/server'

import { requireWritableTenant } from '@/auth/requireTenant'
import { deleteConnectedSite } from '@/connected/store'
import { startJob } from '@/jobs/runner'
import { reapStaleJobs } from '@/jobs/store'

/** POST /workspace/connected/delete — remove a connected site. Runs as a background JOB
 *  (removing a large cloned repo can take a moment): returns { jobId }. Body: { siteId }. */
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
