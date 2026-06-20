import { type NextRequest, NextResponse } from 'next/server'

import { listTenantPages, updateTenantPage } from '@/broker/adapter'
import { getSessionUser, tenantIdOfUser } from '@/auth/session'
import { normalizeLayout, setLayoutFieldPath } from '@/workspace/layout'
import { loadWorkspaceDto } from '@/workspace/preview'

// Allowed direct-edit paths into the dynamic layout.
const PATH_RE = [
  /^layout\.\d+\.(heading|subheading|buttonLabel|text|body)$/,
  /^layout\.\d+\.items\.\d+\.(title|text|quote|author)$/,
]
const isAllowedPath = (p: unknown): p is string => typeof p === 'string' && PATH_RE.some((r) => r.test(p))

/** POST /workspace/field — direct (no-AI) edit of one field inside the layout. */
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
  const field = body?.field
  const value = body?.value
  if (!isAllowedPath(field) || typeof value !== 'string') {
    return NextResponse.json({ ok: false, message: 'That field cannot be edited here.' }, { status: 400 })
  }

  const pageId = body?.pageId != null && body?.pageId !== '' ? Number(body.pageId) : undefined
  const pages = await listTenantPages(tenantId, 1)
  const page = ((pageId && pages.find((p: any) => p.id === pageId)) || pages[0]) as any
  if (!page) return NextResponse.json({ ok: false, message: 'No page to edit yet.' }, { status: 400 })

  const layout = setLayoutFieldPath(page, field, value)
  if (!layout) return NextResponse.json({ ok: false, message: 'That section no longer exists.' }, { status: 400 })

  try {
    await updateTenantPage(tenantId, page.id, { layout, previousLayout: normalizeLayout(page) })
    const workspace = await loadWorkspaceDto(tenantId, page.id)
    return NextResponse.json({ ok: true, workspace })
  } catch {
    return NextResponse.json({ ok: false, message: 'Could not save that change.' }, { status: 500 })
  }
}
