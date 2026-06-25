import { type NextRequest, NextResponse } from 'next/server'

import { requireWritableTenant } from '@/auth/requireTenant'
import { addConnectedPage, insertGeneratedSection, replaceGeneratedSection, replaceItemToPage, replacePageMain } from '@/connected/store'

/**
 * POST /workspace/connected/insert — commit a generated block (after "keep it"). The HTML
 * is RE-SANITISED in the store before it touches the page.
 *  - mode 'section'         { siteId, path, index, html } → insert into the current page.
 *  - mode 'replace-section' { siteId, path, index, html } → replace that section (Edit with AI).
 *  - mode 'page'            { siteId, path, title, html } → create a NEW page seeded with it.
 *  - mode 'replace-page'    { siteId, path, html }        → replace the current page's content (Edit with AI).
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
  const html = typeof body?.html === 'string' ? body.html : ''
  const mode = String(body?.mode || 'section')
  const pathname = String(body?.path || '/')
  const index = Number.isInteger(Number(body?.index)) ? Number(body.index) : 0
  if (!siteId || !html.trim()) return NextResponse.json({ ok: false, message: 'Bad request.' }, { status: 400 })

  try {
    let res: { ok: boolean; message?: string }
    if (mode === 'page') {
      const title = String(body?.title || 'New Page').trim() || 'New Page'
      res = await addConnectedPage(tenantId, siteId, { fromPath: pathname, title, mainHtml: html })
    } else if (mode === 'replace-page') {
      res = await replacePageMain(tenantId, siteId, pathname, html)
    } else if (mode === 'replace-section') {
      res = await replaceGeneratedSection(tenantId, siteId, pathname, index, html)
    } else if (mode === 'replace-item') {
      res = await replaceItemToPage(tenantId, siteId, pathname, index, html)
    } else {
      res = await insertGeneratedSection(tenantId, siteId, pathname, index, html)
    }
    return NextResponse.json(res, { status: res.ok ? 200 : 400 })
  } catch (err) {
    return NextResponse.json({ ok: false, message: err instanceof Error ? err.message : 'Could not add that.' }, { status: 500 })
  }
}
