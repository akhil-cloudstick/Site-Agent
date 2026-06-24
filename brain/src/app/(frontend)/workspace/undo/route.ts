import { type NextRequest, NextResponse } from 'next/server'

import { listTenantPages, updateTenantPage } from '@/broker/adapter'
import { requireWritableTenant } from '@/auth/requireTenant'
import { normalizeLayout } from '@/workspace/layout'
import { loadWorkspaceDto } from '@/workspace/preview'

/** POST /workspace/undo — swap the page back to its previous layout (one-level
 *  undo; pressing it again redoes, since the swap is symmetric). */
export async function POST(req: NextRequest) {
  const guard = await requireWritableTenant(req.headers)
  if (guard.response) return guard.response
  const tenantId = guard.tenant!.tenantId

  let body: any
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const pageId = body?.pageId != null && body?.pageId !== '' ? Number(body.pageId) : undefined
  const pages = await listTenantPages(tenantId, 1)
  const page = ((pageId && pages.find((p: any) => p.id === pageId)) || pages[0]) as any
  if (!page) return NextResponse.json({ ok: false, message: 'No page to edit yet.' }, { status: 400 })

  const prev = page.previousLayout
  if (!Array.isArray(prev) || prev.length === 0) {
    return NextResponse.json({ ok: false, message: 'Nothing to undo.' }, { status: 400 })
  }

  try {
    await updateTenantPage(tenantId, page.id, { layout: prev, previousLayout: normalizeLayout(page) }, guard.tenant!.operatorUserId)
    const workspace = await loadWorkspaceDto(tenantId, page.id)
    return NextResponse.json({ ok: true, workspace })
  } catch {
    return NextResponse.json({ ok: false, message: 'Could not undo.' }, { status: 500 })
  }
}
