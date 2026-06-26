import { type NextRequest, NextResponse } from 'next/server'

import { getSessionUser } from '@/auth/session'
import { setTenantStatus } from '@/operator/manageTenant'

/** POST /admin/tenants/[id]/status { status: 'active' | 'suspended' } — operator suspends/resumes a tenant. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req.headers)
  if (!user?.isOperator) return NextResponse.json({ ok: false, message: 'Operators only.' }, { status: 403 })

  const tenantId = Number((await params).id)
  if (!tenantId) return NextResponse.json({ ok: false, message: 'Bad request.' }, { status: 400 })

  let body: any
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const status = body?.status === 'suspended' ? 'suspended' : body?.status === 'active' ? 'active' : null
  if (!status) return NextResponse.json({ ok: false, message: 'Invalid status.' }, { status: 400 })

  try {
    await setTenantStatus(user, tenantId, status)
    return NextResponse.json({ ok: true, status })
  } catch (err) {
    return NextResponse.json({ ok: false, message: err instanceof Error ? err.message : 'Could not update status.' }, { status: 500 })
  }
}
