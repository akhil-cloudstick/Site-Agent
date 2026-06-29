import { type NextRequest, NextResponse } from 'next/server'

import { tenantIdOfUser } from '@/auth/session'
import { getBrokerClient } from '@/broker/payload-client'
import type { User } from '@/payload-types'

/** POST /login — shared login for tenants and operators; sets the Payload session cookie.
 *  Role-based redirect is decided by the page the client returns to (operator → /admin,
 *  tenant → /workspace), never by this route. */
export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, message: 'Bad request.' }, { status: 400 })
  }
  const email = typeof body?.email === 'string' ? body.email.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!email || !password) {
    return NextResponse.json({ ok: false, message: 'Email and password are required.' }, { status: 400 })
  }

  const payload = await getBrokerClient()
  let result
  try {
    result = await payload.login({ collection: 'users', data: { email, password } })
  } catch {
    return NextResponse.json({ ok: false, message: 'The email or password is incorrect.' }, { status: 401 })
  }

  // Block a suspended tenant's own members at the door — same as a wrong password, the cookie
  // is never set so they can't reach the workspace. (Operators are never tenant-suspended.)
  const user = result.user as User
  if (!user?.isOperator) {
    const tenantId = tenantIdOfUser(user)
    if (tenantId) {
      const tenant: any = await payload.findByID({ collection: 'tenants', id: tenantId, overrideAccess: true, depth: 0 }).catch(() => null)
      if (tenant?.status === 'suspended') {
        return NextResponse.json({ ok: false, message: 'Your account has been suspended. Please contact support.' }, { status: 403 })
      }
    }
  }

  const res = NextResponse.json({ ok: true })
  if (result.token) {
    res.cookies.set('payload-token', result.token, { httpOnly: true, sameSite: 'lax', path: '/' })
  }
  return res
}
