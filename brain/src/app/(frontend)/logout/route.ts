import { NextResponse } from 'next/server'

import { IMPERSONATE_COOKIE } from '@/auth/session'

/** POST /logout — clears the Payload session cookie AND any impersonation cookie
 *  (so a logged-out operator never leaves a stale impersonation behind — Codex R1 #5). */
export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set('payload-token', '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 })
  res.cookies.set(IMPERSONATE_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 })
  return res
}
