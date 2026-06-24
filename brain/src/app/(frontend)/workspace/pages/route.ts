import { type NextRequest, NextResponse } from 'next/server'

import { deleteTenantPage, listTenantPages } from '@/broker/adapter'
import { requireReadableTenant, requireWritableTenant } from '@/auth/requireTenant'
import { addTenantPage } from '@/workspace/create-page'
import { loadWorkspaceDto } from '@/workspace/preview'

/** GET /workspace/pages?pageId=N — load a specific page (used when switching pages). */
export async function GET(req: NextRequest) {
  const guard = await requireReadableTenant(req.headers)
  if (guard.response) return guard.response
  const tenantId = guard.tenantId!

  const pageIdRaw = req.nextUrl.searchParams.get('pageId')
  const pageId = pageIdRaw ? Number(pageIdRaw) : undefined
  const workspace = await loadWorkspaceDto(tenantId, pageId)
  return NextResponse.json({ ok: true, workspace })
}

/** POST /workspace/pages — add a new page to the site (starts with a hero section). */
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
  const title = (typeof body?.title === 'string' && body.title.trim()) || 'New Page'
  const navLabel = typeof body?.navLabel === 'string' ? body.navLabel : undefined

  try {
    const created = (await addTenantPage(tenantId, title, navLabel, guard.tenant!.operatorUserId)) as any
    const workspace = await loadWorkspaceDto(tenantId, created.id)
    return NextResponse.json({ ok: true, newPageId: created.id, workspace })
  } catch {
    return NextResponse.json({ ok: false, message: 'Could not create the page.' }, { status: 500 })
  }
}

/** DELETE /workspace/pages?pageId=N — remove a page (the Home page can't be deleted). */
export async function DELETE(req: NextRequest) {
  const guard = await requireWritableTenant(req.headers)
  if (guard.response) return guard.response
  const tenantId = guard.tenant!.tenantId

  const pageId = Number(req.nextUrl.searchParams.get('pageId'))
  if (!pageId) return NextResponse.json({ ok: false, message: 'Bad request.' }, { status: 400 })

  const pages = await listTenantPages(tenantId, 0)
  const target = pages.find((p: any) => p.id === pageId) as any
  if (!target) return NextResponse.json({ ok: false, message: 'Page not found.' }, { status: 404 })
  if (target.slug === 'home') {
    return NextResponse.json({ ok: false, message: 'The Home page cannot be deleted.' }, { status: 400 })
  }
  if (pages.length <= 1) {
    return NextResponse.json({ ok: false, message: 'A site must have at least one page.' }, { status: 400 })
  }

  try {
    await deleteTenantPage(tenantId, pageId, guard.tenant!.operatorUserId)
    // Fall back to the first remaining page (Home) after deletion.
    const remaining = pages.filter((p: any) => p.id !== pageId)
    const nextId = (remaining.find((p: any) => p.slug === 'home') ?? remaining[0])?.id
    const workspace = await loadWorkspaceDto(tenantId, nextId)
    return NextResponse.json({ ok: true, workspace })
  } catch {
    return NextResponse.json({ ok: false, message: 'Could not delete the page.' }, { status: 500 })
  }
}
