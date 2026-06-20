import { type NextRequest, NextResponse } from 'next/server'

import { listTenantPages, updateTenantPage, uploadTenantMedia } from '@/broker/adapter'
import { getSessionUser, tenantIdOfUser } from '@/auth/session'
import { normalizeLayout, setImageForUpload } from '@/workspace/layout'
import { loadWorkspaceDto } from '@/workspace/preview'

/**
 * POST /workspace/upload — set an image somewhere in the page.
 *  - multipart (file [+ optional path]) → upload a new image and place it at the
 *    path (or the hero by default).
 *  - JSON ({ path, mediaId|null }) → point a path at an existing image, or clear
 *    it (mediaId: null). Used for the one-click revert.
 * Always returns the fresh workspace plus `undo` (the previous image at that path).
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req.headers)
  if (!user) return NextResponse.json({ ok: false, message: 'Please log in.' }, { status: 401 })

  const tenantId = tenantIdOfUser(user)
  if (!tenantId) {
    return NextResponse.json({ ok: false, message: 'Your account is not linked to a site.' }, { status: 403 })
  }

  const contentType = req.headers.get('content-type') ?? ''
  let path: string | undefined
  let pageId: number | undefined
  let newMediaId: number | null
  let message = 'Image updated.'

  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      const file = form.get('file')
      const p = form.get('path')
      const pid = form.get('pageId')
      path = typeof p === 'string' && p ? p : undefined
      pageId = pid != null && pid !== '' ? Number(pid) : undefined
      if (!(file instanceof File) || file.size === 0) {
        return NextResponse.json({ ok: false, message: 'No image provided.' }, { status: 400 })
      }
      if (!file.type.startsWith('image/')) {
        return NextResponse.json({ ok: false, message: 'Please upload an image file.' }, { status: 400 })
      }
      const buffer = Buffer.from(await file.arrayBuffer())
      const media = await uploadTenantMedia(tenantId, { buffer, filename: file.name || 'upload', mimetype: file.type, alt: file.name || 'image' })
      newMediaId = (media as any).id
    } else {
      const body = await req.json()
      path = typeof body?.path === 'string' && body.path ? body.path : undefined
      pageId = body?.pageId != null && body?.pageId !== '' ? Number(body.pageId) : undefined
      newMediaId = typeof body?.mediaId === 'number' ? body.mediaId : null
      message = newMediaId == null ? 'Image removed.' : 'Reverted to the previous image.'
    }

    const pages = await listTenantPages(tenantId, 1)
    const page = ((pageId && pages.find((p: any) => p.id === pageId)) || pages[0]) as any
    if (!page) return NextResponse.json({ ok: false, message: 'No page to edit yet.' }, { status: 400 })

    const result = setImageForUpload(page, path, newMediaId)
    if (!result) return NextResponse.json({ ok: false, message: 'That image cannot be set here.' }, { status: 400 })

    await updateTenantPage(tenantId, page.id, { layout: result.layout, previousLayout: normalizeLayout(page) })
    const workspace = await loadWorkspaceDto(tenantId, page.id)
    return NextResponse.json({ ok: true, message, workspace, undo: { path: result.path, previousMediaId: result.previous } })
  } catch {
    return NextResponse.json({ ok: false, message: 'Could not update the image.' }, { status: 500 })
  }
}
