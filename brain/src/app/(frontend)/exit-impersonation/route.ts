import { type NextRequest, NextResponse } from 'next/server'

import { IMPERSONATE_COOKIE } from '@/auth/session'

/** GET /exit-impersonation?to=/admin — clears the impersonation cookie and redirects.
 *  Used by "Back to admin" and by the workspace page when it detects a stale cookie
 *  (a Server Component can't clear cookies itself, so it redirects here — Codex R2 #1). */
export async function GET(req: NextRequest) {
  const to = req.nextUrl.searchParams.get('to')
  const dest = to && to.startsWith('/') && !to.startsWith('//') ? to : '/admin'
  const res = NextResponse.redirect(new URL(dest, req.nextUrl.origin))
  res.cookies.set(IMPERSONATE_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 })
  return res
}
