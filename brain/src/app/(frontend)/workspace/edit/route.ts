import { type NextRequest, NextResponse } from 'next/server'

import { runContentEdit } from '@/agent/content-agent'
import { detectNewPageIntent } from '@/agent/intent'
import { requireWritableTenant } from '@/auth/requireTenant'
import { addTenantPage } from '@/workspace/create-page'
import { loadWorkspaceDto } from '@/workspace/preview'
import { logTenantError } from '@/operator/errorLog'

/** POST /workspace/edit — the chat endpoint. Auth from the session cookie,
 *  tenant derived server-side, the edit applied through the broker/agent. */
export async function POST(req: NextRequest) {
  const guard = await requireWritableTenant(req.headers)
  if (guard.response) return guard.response
  const tenantId = guard.tenant!.tenantId

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

  // Stream REAL progress stages (Thinking → Updating → Done) as NDJSON so the chat reflects
  // what's actually happening; the terminal {stage:'done', …} carries the fresh workspace.
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))
      try {
        emit({ stage: 'thinking' })
        // "add a new page X" creates a page rather than editing the current one. Skip this when
        // pointing at a section or attaching a reference image — those are clearly edits.
        if (typeof targetIndex !== 'number' && !imageDataUrl) {
          const pageIntent = detectNewPageIntent(message)
          if (pageIntent) {
            try {
              const created = (await addTenantPage(tenantId, pageIntent.title, undefined, guard.tenant!.operatorUserId)) as any
              emit({ stage: 'updating' })
              const workspace = await loadWorkspaceDto(tenantId, created.id)
              emit({ stage: 'done', ok: true, message: `Added a new page “${created.title}” — you're now editing it. Tell me what to put on it.`, workspace })
            } catch (err) {
              await logTenantError(tenantId, 'create_page', err, { detail: `title: ${pageIntent.title}` })
              emit({ stage: 'done', ok: false, message: "I couldn't create that page — nothing was changed." })
            }
            return
          }
        }

        const result = await runContentEdit(tenantId, pageId, message, imageDataUrl, targetIndex, guard.tenant!.operatorUserId)
        if (!result.ok) await logTenantError(tenantId, 'edit_content', result.message, { detail: `request: ${message.slice(0, 200)}` })
        emit({ stage: 'updating' })
        const workspace = result.ok ? await loadWorkspaceDto(tenantId, pageId) : undefined
        emit({ stage: 'done', ...result, workspace })
      } catch {
        emit({ stage: 'done', ok: false, message: 'Something went wrong — nothing was changed.' })
      } finally {
        controller.close()
      }
    },
  })
  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' } })
}
