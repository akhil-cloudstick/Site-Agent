import { headers as nextHeaders } from 'next/headers'
import { type NextRequest, NextResponse } from 'next/server'

import { getSessionUser, IMPERSONATE_COOKIE } from '@/auth/session'
import { getBrokerClient } from '@/broker/payload-client'

/** POST /admin/impersonate { tenantId } — operator enters a tenant's workspace.
 *  Sets the httpOnly impersonation cookie ONLY after verifying the requester is an
 *  operator AND the target tenant exists and is active (Codex R2 #2). The client then
 *  navigates to /workspace, where view-only is enforced unless allowOperatorEdit. */
export async function POST(req: NextRequest) {
  const reqHeaders = (await nextHeaders()) as unknown as Headers
  const user = await getSessionUser(reqHeaders)
  if (!user?.isOperator) {
    return NextResponse.json({ ok: false, message: 'Operators only.' }, { status: 403 })
  }
  let body: any
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const tenantId = Number(body?.tenantId)
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    return NextResponse.json({ ok: false, message: 'Invalid tenant.' }, { status: 400 })
  }
  const payload = await getBrokerClient()
  const tenant: any = await payload
    .findByID({ collection: 'tenants', id: tenantId, overrideAccess: true, depth: 0 })
    .catch(() => null)
  if (!tenant || tenant.status !== 'active') {
    return NextResponse.json({ ok: false, message: 'That tenant is not available to enter.' }, { status: 404 })
  }
  const res = NextResponse.json({ ok: true, redirect: '/workspace' })
  res.cookies.set(IMPERSONATE_COOKIE, String(tenantId), { httpOnly: true, sameSite: 'lax', path: '/' })
  return res
}
