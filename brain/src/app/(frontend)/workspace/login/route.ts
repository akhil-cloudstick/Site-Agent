import { type NextRequest, NextResponse } from 'next/server'

import { getBrokerClient } from '@/broker/payload-client'

/** POST /workspace/login — logs a tenant in and sets the Payload session cookie. */
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
  try {
    const result = await payload.login({ collection: 'users', data: { email, password } })
    const res = NextResponse.json({ ok: true })
    if (result.token) {
      res.cookies.set('payload-token', result.token, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      })
    }
    return res
  } catch {
    return NextResponse.json({ ok: false, message: 'The email or password is incorrect.' }, { status: 401 })
  }
}
