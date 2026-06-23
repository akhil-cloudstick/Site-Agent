import { type NextRequest, NextResponse } from 'next/server'

import { getSessionUser, tenantIdOfUser } from '@/auth/session'
import { findActiveJobForSite, getJob, reapStaleJobs } from '@/jobs/store'

/**
 * GET /workspace/connected/job — poll job progress.
 *  - ?id=<jobId>     → that job's { status, percent, stage, logs, error, result }.
 *  - ?siteId=<id>    → the newest active job for that site (for re-attaching the modal
 *                      after a page refresh), or { job: null }. Also reaps stale jobs.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req.headers)
  if (!user) return NextResponse.json({ ok: false, message: 'Please log in.' }, { status: 401 })
  const tenantId = tenantIdOfUser(user)
  if (!tenantId) return NextResponse.json({ ok: false, message: 'No site linked.' }, { status: 403 })

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
