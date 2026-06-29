import { type NextRequest, NextResponse } from 'next/server'

import { requireWritableTenant } from '@/auth/requireTenant'
import { planConnectedEdits } from '@/connected/agent'
import { getConnectedSite, setDraftValue } from '@/connected/store'
import { logTenantError } from '@/operator/errorLog'

/** POST /workspace/connected/chat — edit a connected site's content by chat.
 *  Body: { siteId, path, message }. */
export async function POST(req: NextRequest) {
  const guard = await requireWritableTenant(req.headers)
  if (guard.response) return guard.response
  const tenantId = guard.tenant!.tenantId

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, message: 'Bad request.' }, { status: 400 })
  }
  const siteId = Number(body?.siteId)
  const pathname = String(body?.path || '/')
  const message = String(body?.message || '').trim()
  // Optional reference image (a data: URL) — e.g. a screenshot of the wording you want.
  const refImage = typeof body?.refImage === 'string' && body.refImage.startsWith('data:image/') ? body.refImage : undefined
  if (!siteId || !message) return NextResponse.json({ ok: false, message: 'Tell me what to change.' }, { status: 400 })

  const site = (await getConnectedSite(tenantId, siteId)) as any
  if (!site) return NextResponse.json({ ok: false, message: 'Site not found.' }, { status: 404 })
  const pageContent = (site.draftContent ?? {})[pathname] ?? {}

  // Stream REAL progress stages (Thinking → Applying → Updating → Done) as NDJSON, so the chat
  // shows what's actually happening instead of a fake timer. Terminal event is {stage:'done', …}.
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))
      try {
        emit({ stage: 'thinking' })
        let edits
        try {
          edits = await planConnectedEdits(pageContent, message, refImage)
        } catch (err) {
          await logTenantError(tenantId, 'ai_chat', err, { siteId, detail: `request: ${message.slice(0, 200)}`, userId: guard.tenant!.operatorUserId })
          emit({ stage: 'done', ok: false, message: 'The AI service is busy right now — nothing was changed. Please try again in a moment.' })
          return
        }
        if (edits.length === 0) {
          emit({ stage: 'done', ok: true, count: 0, message: "I couldn't find anything to change for that — nothing was changed." })
          return
        }
        emit({ stage: 'applying', count: edits.length })
        const affected = new Set<string>()
        for (const e of edits) {
          const paths = await setDraftValue(tenantId, siteId, pathname, e.id, 'text', e.value)
          paths.forEach((p) => affected.add(p))
        }
        emit({ stage: 'updating' })
        emit({ stage: 'done', ok: true, count: edits.length, message: `Done — updated ${edits.length} item${edits.length === 1 ? '' : 's'}.`, paths: Array.from(affected) })
      } catch {
        emit({ stage: 'done', ok: false, message: 'Something went wrong — nothing was changed.' })
      } finally {
        controller.close()
      }
    },
  })
  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' } })
}
