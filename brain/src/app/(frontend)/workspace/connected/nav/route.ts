import { type NextRequest, NextResponse } from 'next/server'

import { requireWritableTenant } from '@/auth/requireTenant'
import { addSiteNavLink } from '@/connected/store'

/** POST /workspace/connected/nav — add a navigation menu link to a chosen page.
 *  Body: { siteId, targetPath, label? }. */
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
  const targetPath = String(body?.targetPath || '')
  const label = typeof body?.label === 'string' ? body.label : undefined
  if (!siteId || !targetPath) return NextResponse.json({ ok: false, message: 'Bad request.' }, { status: 400 })

  try {
    const res = await addSiteNavLink(tenantId, siteId, targetPath, label)
    return NextResponse.json(res, { status: res.ok ? 200 : 400 })
  } catch (err) {
    return NextResponse.json({ ok: false, message: err instanceof Error ? err.message : 'Could not add the link.' }, { status: 500 })
  }
}
