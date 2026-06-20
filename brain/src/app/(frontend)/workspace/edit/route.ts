import { type NextRequest, NextResponse } from 'next/server'

import { runContentEdit } from '@/agent/content-agent'
import { detectNewPageIntent } from '@/agent/intent'
import { getSessionUser, tenantIdOfUser } from '@/auth/session'
import { addTenantPage } from '@/workspace/create-page'
import { loadWorkspaceDto } from '@/workspace/preview'

/** POST /workspace/edit — the chat endpoint. Auth from the session cookie,
 *  tenant derived server-side, the edit applied through the broker/agent. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req.headers)
  if (!user) return NextResponse.json({ ok: false, message: 'Please log in.' }, { status: 401 })

  const tenantId = tenantIdOfUser(user)
  if (!tenantId) {
    return NextResponse.json({ ok: false, message: 'Your account is not linked to a site.' }, { status: 403 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ ok: false, message: 'Bad request.' }, { status: 400 })
  }
  const message = String(form.get('message') ?? '').trim()
  const pageIdRaw = form.get('pageId')
  const pageId = pageIdRaw != null && pageIdRaw !== '' ? Number(pageIdRaw) : undefined
  const targetRaw = form.get('targetIndex')
  const targetIndex = targetRaw != null && targetRaw !== '' ? Number(targetRaw) : undefined

  // Optional reference image the AI will "look at".
  let imageDataUrl: string | undefined
  const image = form.get('image')
  if (image instanceof File && image.size > 0 && image.type.startsWith('image/')) {
    const buf = Buffer.from(await image.arrayBuffer())
    imageDataUrl = `data:${image.type};base64,${buf.toString('base64')}`
  }

  if (!message && !imageDataUrl) {
    return NextResponse.json({ ok: false, message: 'Tell me what to change.' }, { status: 400 })
  }

  // "add a new page X" creates a page rather than editing the current one. Skip
  // this when pointing at a section or attaching a reference image — those are
  // clearly edits to the page in view, not page creation.
  if (typeof targetIndex !== 'number' && !imageDataUrl) {
    const pageIntent = detectNewPageIntent(message)
    if (pageIntent) {
      try {
        const created = (await addTenantPage(tenantId, pageIntent.title)) as any
        const workspace = await loadWorkspaceDto(tenantId, created.id)
        return NextResponse.json({
          ok: true,
          message: `Added a new page “${created.title}” — you're now editing it. Tell me what to put on it.`,
          workspace,
        })
      } catch {
        return NextResponse.json({ ok: false, message: "I couldn't create that page — nothing was changed." })
      }
    }
  }

  const result = await runContentEdit(tenantId, pageId, message, imageDataUrl, targetIndex)
  // Return the fresh workspace so the client updates without a full refresh.
  const workspace = result.ok ? await loadWorkspaceDto(tenantId, pageId) : undefined
  return NextResponse.json({ ...result, workspace })
}
