import { type NextRequest, NextResponse } from 'next/server'

import { requireWritableTenant } from '@/auth/requireTenant'
import { applyStructureToPage } from '@/connected/store'
import type { SectionOp } from '@/connected/structure'
import { logTenantError } from '@/operator/errorLog'

/**
 * POST /workspace/connected/structure — move or delete a top-level section on a
 * connected page. (Inserting a NEW section goes through /generate-section, which
 * sanitises the AI HTML first — this route never accepts raw insert markup.)
 */
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
  const index = Number(body?.index)
  if (!siteId || !Number.isInteger(index)) return NextResponse.json({ ok: false, message: 'Bad request.' }, { status: 400 })

  let op: SectionOp | null = null
  if (body?.op === 'delete') op = { op: 'delete', index }
  else if (body?.op === 'move' && (body?.dir === 'up' || body?.dir === 'down')) op = { op: 'move', index, dir: body.dir }
  if (!op) return NextResponse.json({ ok: false, message: 'That change is not allowed.' }, { status: 400 })

  try {
    const res = await applyStructureToPage(tenantId, siteId, pathname, op)
    if (!res.ok) return NextResponse.json({ ok: false, message: res.message ?? 'Could not apply that change.' }, { status: 400 })
    return NextResponse.json({ ok: true, paths: res.paths, skipped: res.skipped })
  } catch (err) {
    await logTenantError(tenantId, 'edit_structure', err, { siteId })
    return NextResponse.json({ ok: false, message: err instanceof Error ? err.message : 'Could not apply that change.' }, { status: 500 })
  }
}
