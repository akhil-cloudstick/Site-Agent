import { type NextRequest, NextResponse } from 'next/server'

import { resolveEffectiveTenant, tenantIdOfUser } from '@/auth/session'
import { getBrokerClient } from '@/broker/payload-client'

/** POST /workspace/allow-operator-edit { allow } — the TENANT grants/revokes operator edit.
 *  Rejects impersonating operators (no self-grant) and requires the caller be a real member
 *  of the tenant they're toggling (Codex R1 #9 / R2 #8). */
export async function POST(req: NextRequest) {
  const eff = await resolveEffectiveTenant(req.headers)
  if (!eff.user) return NextResponse.json({ ok: false, message: 'Please log in.' }, { status: 401 })
  if (eff.isImpersonating) {
    return NextResponse.json({ ok: false, message: 'Only the site owner can change this.' }, { status: 403 })
  }
  const tenantId = eff.tenantId
  // Must be a real member of this exact tenant (operator-who-is-member allowed only here,
  // when not impersonating and acting on their own tenant).
  if (!tenantId || tenantIdOfUser(eff.user) !== tenantId) {
    return NextResponse.json({ ok: false, message: 'Not allowed.' }, { status: 403 })
  }
  let body: any
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const allow = Boolean(body?.allow)
  const payload = await getBrokerClient()
  await payload.update({ collection: 'tenants', id: tenantId, data: { allowOperatorEdit: allow }, overrideAccess: true })
  return NextResponse.json({ ok: true, allow })
}
