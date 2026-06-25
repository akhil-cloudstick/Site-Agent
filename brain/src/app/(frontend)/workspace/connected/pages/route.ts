import { type NextRequest, NextResponse } from 'next/server'

import { requireWritableTenant } from '@/auth/requireTenant'
import { addConnectedPage, removeConnectedPage, reorderConnectedPages } from '@/connected/store'

const guarded = async (req: NextRequest) => {
  const guard = await requireWritableTenant(req.headers)
  if (guard.response) return { response: guard.response }
  return { tenantId: guard.tenant!.tenantId }
}

/** POST /workspace/connected/pages — add a page (cloned from an existing one). */
export async function POST(req: NextRequest) {
  const g = await guarded(req)
  if (g.response) return g.response
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, message: 'Bad request.' }, { status: 400 })
  }
  const siteId = Number(body?.siteId)
  const title = String(body?.title || '').trim()
  const fromPath = body?.fromPath ? String(body.fromPath) : undefined
  if (!siteId || !title) return NextResponse.json({ ok: false, message: 'A page name is required.' }, { status: 400 })
  try {
    const res = await addConnectedPage(g.tenantId!, siteId, { fromPath, title })
    return NextResponse.json(res, { status: res.ok ? 200 : 400 })
  } catch (err) {
    return NextResponse.json({ ok: false, message: err instanceof Error ? err.message : 'Could not add page.' }, { status: 500 })
  }
}

/** DELETE /workspace/connected/pages — remove a page (body { siteId, path }). */
export async function DELETE(req: NextRequest) {
  const g = await guarded(req)
  if (g.response) return g.response
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, message: 'Bad request.' }, { status: 400 })
  }
  const siteId = Number(body?.siteId)
  const pathname = String(body?.path || '')
  if (!siteId || !pathname) return NextResponse.json({ ok: false, message: 'Bad request.' }, { status: 400 })
  try {
    const res = await removeConnectedPage(g.tenantId!, siteId, pathname)
    return NextResponse.json(res, { status: res.ok ? 200 : 400 })
  } catch (err) {
    return NextResponse.json({ ok: false, message: err instanceof Error ? err.message : 'Could not remove page.' }, { status: 500 })
  }
}

/** PATCH /workspace/connected/pages — reorder pages (body { siteId, order: string[] }). */
export async function PATCH(req: NextRequest) {
  const g = await guarded(req)
  if (g.response) return g.response
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, message: 'Bad request.' }, { status: 400 })
  }
  const siteId = Number(body?.siteId)
  const order = Array.isArray(body?.order) ? body.order.map((p: any) => String(p)) : null
  if (!siteId || !order) return NextResponse.json({ ok: false, message: 'Bad request.' }, { status: 400 })
  try {
    const res = await reorderConnectedPages(g.tenantId!, siteId, order)
    return NextResponse.json(res, { status: res.ok ? 200 : 400 })
  } catch (err) {
    return NextResponse.json({ ok: false, message: err instanceof Error ? err.message : 'Could not reorder pages.' }, { status: 500 })
  }
}
