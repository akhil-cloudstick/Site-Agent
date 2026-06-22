import { type NextRequest, NextResponse } from 'next/server'

import { getSessionUser, tenantIdOfUser } from '@/auth/session'
import { publishConnectedSite, rollbackConnectedSite } from '@/connected/publish'

/** POST /workspace/connected/publish — render the draft onto the site + deploy to the same URL.
 *  Body: { siteId, rollback? }. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req.headers)
  if (!user) return NextResponse.json({ ok: false, message: 'Please log in.' }, { status: 401 })
  const tenantId = tenantIdOfUser(user)
  if (!tenantId) return NextResponse.json({ ok: false, message: 'No site linked.' }, { status: 403 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, message: 'Bad request.' }, { status: 400 })
  }
  const siteId = Number(body?.siteId)
  if (!siteId) return NextResponse.json({ ok: false, message: 'Bad request.' }, { status: 400 })

  try {
    const { url } = body?.rollback ? await rollbackConnectedSite(tenantId, siteId) : await publishConnectedSite(tenantId, siteId)
    return NextResponse.json({ ok: true, url })
  } catch (err) {
    console.error('[connected/publish] failed:', err)
    const detail = err instanceof Error ? err.message : 'Publishing failed.'
    return NextResponse.json({ ok: false, message: `Publish failed: ${detail}` }, { status: 500 })
  }
}
