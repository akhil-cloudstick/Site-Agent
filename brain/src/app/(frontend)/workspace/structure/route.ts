import { type NextRequest, NextResponse } from 'next/server'

import { listTenantPages, updateTenantPage } from '@/broker/adapter'
import { getSessionUser, tenantIdOfUser } from '@/auth/session'
import { normalizeLayout } from '@/workspace/layout'
import { loadWorkspaceDto } from '@/workspace/preview'
import { applyStructureOp } from '@/workspace/structure'

/** POST /workspace/structure — add/delete/move sections and items (no AI). */
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

  const pageId = body?.pageId != null && body?.pageId !== '' ? Number(body.pageId) : undefined
  const pages = await listTenantPages(tenantId, 1)
  const page = ((pageId && pages.find((p: any) => p.id === pageId)) || pages[0]) as any
  if (!page) return NextResponse.json({ ok: false, message: 'No page to edit yet.' }, { status: 400 })

  const layout = applyStructureOp(page, body)
  if (!layout) return NextResponse.json({ ok: false, message: 'That change is not allowed.' }, { status: 400 })

  try {
    await updateTenantPage(tenantId, page.id, { layout, previousLayout: normalizeLayout(page) })
    const workspace = await loadWorkspaceDto(tenantId, page.id)
    return NextResponse.json({ ok: true, workspace })
  } catch {
    return NextResponse.json({ ok: false, message: 'Could not save that change.' }, { status: 500 })
  }
}
