import { NextResponse } from 'next/server'

/** POST /workspace/logout — clears the Payload session cookie. */
export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set('payload-token', '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 })
  return res
}
