import { type NextRequest, NextResponse } from 'next/server'

import { runContentEdit } from '@/agent/content-agent'
import { getSessionUser, tenantIdOfUser } from '@/auth/session'
import { loadPreviewDto } from '@/workspace/preview'

/** POST /workspace/edit — the chat endpoint. Auth from the session cookie,
 *  tenant derived server-side, the edit applied through the broker/agent. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req.headers)
  if (!user) return NextResponse.json({ ok: false, message: 'Please log in.' }, { status: 401 })

  const tenantId = tenantIdOfUser(user)
  if (!tenantId) {
    return NextResponse.json({ ok: false, message: 'Your account is not linked to a site.' }, { status: 403 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, message: 'Bad request.' }, { status: 400 })
  }
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  if (!message) return NextResponse.json({ ok: false, message: 'Tell me what to change.' }, { status: 400 })

  const result = await runContentEdit(tenantId, message)
  // Return the fresh preview so the client updates without a full refresh.
  const preview = result.ok ? await loadPreviewDto(tenantId) : undefined
  return NextResponse.json({ ...result, preview })
}
