import { type NextRequest, NextResponse } from 'next/server'

import { uploadTenantMedia } from '@/broker/adapter'
import { getSessionUser, tenantIdOfUser } from '@/auth/session'
import { setDraftValue } from '@/connected/store'

/** POST /workspace/connected/edit — set one draft value.
 *  - JSON { siteId, path, id, value } for text.
 *  - multipart { siteId, path, id, file } for an image (uploaded, then its URL stored). */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req.headers)
  if (!user) return NextResponse.json({ ok: false, message: 'Please log in.' }, { status: 401 })
  const tenantId = tenantIdOfUser(user)
  if (!tenantId) return NextResponse.json({ ok: false, message: 'No site linked.' }, { status: 403 })

  const contentType = req.headers.get('content-type') ?? ''
  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      const siteId = Number(form.get('siteId'))
      const pathname = String(form.get('path') || '/')
      const id = String(form.get('id') || '')
      const file = form.get('file')
      if (!siteId || !id || !(file instanceof File) || file.size === 0) {
        return NextResponse.json({ ok: false, message: 'Bad request.' }, { status: 400 })
      }
      if (!file.type.startsWith('image/')) return NextResponse.json({ ok: false, message: 'Please upload an image.' }, { status: 400 })
      const buffer = Buffer.from(await file.arrayBuffer())
      const media = (await uploadTenantMedia(tenantId, { buffer, filename: file.name || 'upload', mimetype: file.type, alt: file.name || 'image' })) as any
      await setDraftValue(tenantId, siteId, pathname, id, 'image', media.url ?? '')
      return NextResponse.json({ ok: true, value: media.url })
    }

    const body = await req.json()
    const siteId = Number(body?.siteId)
    const pathname = String(body?.path || '/')
    const id = String(body?.id || '')
    const value = String(body?.value ?? '')
    if (!siteId || !id) return NextResponse.json({ ok: false, message: 'Bad request.' }, { status: 400 })
    await setDraftValue(tenantId, siteId, pathname, id, 'text', value)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ ok: false, message: err instanceof Error ? err.message : 'Could not save.' }, { status: 500 })
  }
}
