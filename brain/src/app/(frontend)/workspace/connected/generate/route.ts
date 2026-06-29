import { type NextRequest, NextResponse } from 'next/server'

import { requireWritableTenant } from '@/auth/requireTenant'
import { planConnectedPage, planConnectedSection } from '@/connected/agent'
import { fetchPageHtml } from '@/connected/fetch'
import { getConnectedSite } from '@/connected/store'
import { getItemHtml, getMainInnerHtml, getSectionHtml, sampleSiteClasses } from '@/connected/structure'
import { logTenantError } from '@/operator/errorLog'

/**
 * POST /workspace/connected/generate — generate a section or a whole page's content as
 * SAFE HTML styled to the site, from a description and/or a reference (image, pasted
 * markup, or a URL we fetch SSRF-guarded). Returns the sanitised HTML for a
 * preview-before-commit overlay; it is NOT persisted here (commit goes via /insert).
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
  const mode = body?.mode === 'page' ? 'page' : body?.mode === 'item' ? 'item' : 'section'
  if (!siteId) return NextResponse.json({ ok: false, message: 'Bad request.' }, { status: 400 })

  const site = (await getConnectedSite(tenantId, siteId)) as any
  if (!site) return NextResponse.json({ ok: false, message: 'Site not found.' }, { status: 404 })
  const html = (site.sourceHtml ?? {})[pathname] ?? Object.values(site.sourceHtml ?? {})[0] ?? ''
  const siteClasses = typeof html === 'string' ? sampleSiteClasses(html) : []

  // Reference intake: a pasted markup string and/or a URL we fetch (SSRF-guarded).
  let referenceHtml: string | undefined = typeof body?.referenceHtml === 'string' ? body.referenceHtml.slice(0, 20000) : undefined
  if (!referenceHtml && typeof body?.referenceUrl === 'string' && body.referenceUrl.trim()) {
    try {
      referenceHtml = (await fetchPageHtml(body.referenceUrl.trim())).slice(0, 20000)
    } catch (err) {
      return NextResponse.json({ ok: false, message: err instanceof Error ? err.message : 'Could not fetch that URL.' }, { status: 400 })
    }
  }
  const refImageUrl =
    typeof body?.refImage === 'string' && body.refImage.startsWith('data:image/') ? body.refImage : undefined

  // Edit context: the current section's / page's / item's HTML, when this is an "Edit with AI" request.
  let editHtml: string | undefined
  if (typeof html === 'string') {
    if (mode === 'item' && Number.isInteger(Number(body?.editIndex))) {
      editHtml = getItemHtml(html, Number(body.editIndex)) ?? undefined
    } else if (mode === 'section' && Number.isInteger(Number(body?.editIndex))) {
      editHtml = getSectionHtml(html, Number(body.editIndex)) ?? undefined
    } else if (mode === 'page' && body?.editPage) {
      editHtml = getMainInnerHtml(html) || undefined
    }
  }

  const t = body?.theme && typeof body.theme === 'object' && !Array.isArray(body.theme) ? body.theme : null
  const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.slice(0, max) : undefined)
  const theme = t ? { bg: str(t.bg, 60), color: str(t.color, 60), accent: str(t.accent, 60), font: str(t.font, 120) } : undefined

  const opts = {
    request: typeof body?.prompt === 'string' ? body.prompt.slice(0, 2000) : undefined,
    kind: typeof body?.kind === 'string' ? body.kind.slice(0, 40) : undefined,
    siteClasses,
    refImageUrl,
    referenceHtml,
    editHtml,
    theme,
  }

  const action = mode === 'page' ? 'generate_page' : 'generate_section'
  try {
    const res = mode === 'page' ? await planConnectedPage(opts) : await planConnectedSection(opts)
    if (!res.ok) {
      await logTenantError(tenantId, action, res.error, { siteId, detail: opts.request })
      return NextResponse.json({ ok: false, message: `Couldn’t generate that (${res.error}).` }, { status: 400 })
    }
    return NextResponse.json({ ok: true, mode, html: res.html, message: res.message ?? 'Here’s a draft — keep it or discard.' })
  } catch (err) {
    await logTenantError(tenantId, action, err, { siteId, detail: opts.request })
    return NextResponse.json({ ok: false, message: err instanceof Error ? err.message : 'Could not generate.' }, { status: 500 })
  }
}
