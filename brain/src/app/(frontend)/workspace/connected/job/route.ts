import { type NextRequest, NextResponse } from 'next/server'

import { requireReadableTenant } from '@/auth/requireTenant'
import { findActiveJobForSite, getJob, reapStaleJobs } from '@/jobs/store'

/**
 * GET /workspace/connected/job — poll job progress.
 *  - ?id=<jobId>     → that job's { status, percent, stage, logs, error, result }.
 *  - ?siteId=<id>    → the newest active job for that site (for re-attaching the modal
 *                      after a page refresh), or { job: null }. Also reaps stale jobs.
 */
export async function GET(req: NextRequest) {
  const guard = await requireReadableTenant(req.headers)
  if (guard.response) return guard.response
  const tenantId = guard.tenantId!

  const idParam = req.nextUrl.searchParams.get('id')
  const siteParam = req.nextUrl.searchParams.get('siteId')

  if (idParam) {
    const job = await getJob(tenantId, Number(idParam))
    return NextResponse.json({ ok: true, job })
  }
  if (siteParam) {
    await reapStaleJobs(tenantId).catch(() => {})
    const job = await findActiveJobForSite(tenantId, Number(siteParam))
    return NextResponse.json({ ok: true, job })
  }
  return NextResponse.json({ ok: false, message: 'Bad request.' }, { status: 400 })
}
