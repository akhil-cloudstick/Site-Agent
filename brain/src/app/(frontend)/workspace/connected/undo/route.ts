import { type NextRequest, NextResponse } from 'next/server'

import { getSessionUser, tenantIdOfUser } from '@/auth/session'
import { undoConnectedEdit } from '@/connected/store'

/** POST /workspace/connected/undo — undo the most recent draft edit. Body: { siteId }. */
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
    const r = await undoConnectedEdit(tenantId, siteId)
    return NextResponse.json({ ok: true, ...r })
  } catch (err) {
    return NextResponse.json({ ok: false, message: err instanceof Error ? err.message : 'Could not undo.' }, { status: 500 })
  }
}
