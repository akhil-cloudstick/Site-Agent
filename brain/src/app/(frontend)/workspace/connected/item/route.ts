import { type NextRequest, NextResponse } from 'next/server'

import { requireWritableTenant } from '@/auth/requireTenant'
import { applyItemToPage } from '@/connected/store'
import type { ItemOp } from '@/connected/structure'

/**
 * POST /workspace/connected/item — deterministic reorder/duplicate/remove of a repeated
 * item (a card, nav link, or button in a group). No AI:
 *  - { op:'move', index, dir:'prev'|'next' } → reorder within its sibling group (◀▶ / ▲▼)
 *  - { op:'duplicate', index }               → clone it right after (the "add another card")
 *  - { op:'remove', index }                  → remove it
 * Items in a shared nav/header/footer sync across every page.
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

  let op: ItemOp | null = null
  if (body?.op === 'move' && (body?.dir === 'prev' || body?.dir === 'next')) op = { op: 'move', index, dir: body.dir }
  else if (body?.op === 'duplicate') op = { op: 'duplicate', index }
  else if (body?.op === 'remove') op = { op: 'remove', index }
  if (!op) return NextResponse.json({ ok: false, message: 'That change is not allowed.' }, { status: 400 })

  try {
    const res = await applyItemToPage(tenantId, siteId, pathname, op)
    return NextResponse.json(res, { status: res.ok ? 200 : 400 })
  } catch (err) {
    return NextResponse.json({ ok: false, message: err instanceof Error ? err.message : 'Could not apply that change.' }, { status: 500 })
  }
}
