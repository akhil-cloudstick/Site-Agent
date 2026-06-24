import { type NextRequest, NextResponse } from 'next/server'

import { getSessionUser } from '@/auth/session'
import { createTenant } from '@/operator/createTenant'

/** POST /admin/tenants/create { name, email, password } — operator adds a tenant. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req.headers)
  if (!user?.isOperator) {
    return NextResponse.json({ ok: false, message: 'Operators only.' }, { status: 403 })
  }
  let body: any
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  try {
    const tenant = await createTenant({ name: body?.name, email: body?.email, password: body?.password })
    return NextResponse.json({ ok: true, tenant })
  } catch (err) {
    return NextResponse.json({ ok: false, message: err instanceof Error ? err.message : 'Could not create the tenant.' }, { status: 400 })
  }
}
