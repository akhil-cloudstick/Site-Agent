import { type NextRequest, NextResponse } from 'next/server'

import { requireWritableTenant } from '@/auth/requireTenant'
import { applyElementToPage } from '@/connected/store'
import type { ElementOp } from '@/connected/structure'
import { logTenantError } from '@/operator/errorLog'

/**
 * POST /workspace/connected/element — deterministic button/link edits (no AI):
 *  - { op:'set-link', index, href }         → set/redirect a link or button
 *  - { op:'remove', index }                 → remove a link or button
 *  - { op:'add-button', sectionIndex, text, href } → add a styled button to a section
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
  const sectionIndex = Number(body?.sectionIndex)
  const imgIndex = Number(body?.imgIndex)
  if (!siteId) return NextResponse.json({ ok: false, message: 'Bad request.' }, { status: 400 })

  let op: ElementOp | null = null
  if (body?.op === 'set-link' && Number.isInteger(index)) op = { op: 'set-link', index, href: String(body?.href ?? '') }
  else if (body?.op === 'remove' && Number.isInteger(index)) op = { op: 'remove', index }
  else if (body?.op === 'add-after' && Number.isInteger(index))
    op = { op: 'add-after', index, text: String(body?.text ?? 'Link'), href: String(body?.href ?? '#') }
  else if (body?.op === 'add-button' && Number.isInteger(sectionIndex))
    op = { op: 'add-button', sectionIndex, text: String(body?.text ?? 'Button'), href: String(body?.href ?? '#') }
  else if (body?.op === 'link-image' && Number.isInteger(imgIndex))
    op = { op: 'link-image', imgIndex, href: String(body?.href ?? '#') }
  if (!op) return NextResponse.json({ ok: false, message: 'That change is not allowed.' }, { status: 400 })

  try {
    const res = await applyElementToPage(tenantId, siteId, pathname, op)
    return NextResponse.json(res, { status: res.ok ? 200 : 400 })
  } catch (err) {
    await logTenantError(tenantId, 'edit_element', err, { siteId })
    return NextResponse.json({ ok: false, message: err instanceof Error ? err.message : 'Could not apply that change.' }, { status: 500 })
  }
}
