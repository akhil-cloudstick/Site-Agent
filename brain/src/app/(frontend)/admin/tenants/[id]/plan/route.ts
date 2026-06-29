import { type NextRequest, NextResponse } from 'next/server'

import { getSessionUser } from '@/auth/session'
import { setTenantPlan } from '@/operator/manageTenant'

/** POST /admin/tenants/[id]/plan { planLabel } — operator sets a tenant's plan label. */
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
  const planLabel = typeof body?.planLabel === 'string' ? body.planLabel.trim() : ''

  try {
    await setTenantPlan(user, tenantId, planLabel)
    return NextResponse.json({ ok: true, planLabel })
  } catch (err) {
    return NextResponse.json({ ok: false, message: err instanceof Error ? err.message : 'Could not update plan.' }, { status: 500 })
  }
}
