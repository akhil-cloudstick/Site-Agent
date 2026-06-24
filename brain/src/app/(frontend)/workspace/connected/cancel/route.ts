import { type NextRequest, NextResponse } from 'next/server'

import { requireWritableTenant } from '@/auth/requireTenant'
import { requestCancel } from '@/jobs/registry'
import { getJob, updateJob } from '@/jobs/store'

/** POST /workspace/connected/cancel — request cancellation of a running job. Body: { jobId }.
 *  Sets the cancel flag + kills the active child process; the job runner then runs cleanup. */
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
  const jobId = Number(body?.jobId)
  if (!jobId) return NextResponse.json({ ok: false, message: 'Bad request.' }, { status: 400 })

  // Tenant-check via the scoped read before touching the live registry.
  const job = await getJob(tenantId, jobId)
  if (!job) return NextResponse.json({ ok: false, message: 'Job not found.' }, { status: 404 })

  requestCancel(jobId)
  await updateJob(tenantId, jobId, { status: 'cancelling' })
  return NextResponse.json({ ok: true })
}
