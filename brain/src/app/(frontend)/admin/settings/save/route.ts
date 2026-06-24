import { type NextRequest, NextResponse } from 'next/server'

import { getSessionUser } from '@/auth/session'
import { getBrokerClient } from '@/broker/payload-client'
import { getEnv } from '@/config/env'
import { encryptSecret } from '@/lib/crypto/secretBox'

/** POST /admin/settings/save — operator updates the platform AI settings.
 *  Body: { provider, models: string[], apiKey?: string }. A non-empty apiKey is encrypted
 *  and stored; an empty apiKey leaves the existing key untouched (replace-only). */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req.headers)
  if (!user?.isOperator) {
    return NextResponse.json({ ok: false, message: 'Operators only.' }, { status: 403 })
  }
  let body: any
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const provider = body?.provider === 'openrouter' ? 'openrouter' : null
  if (!provider) return NextResponse.json({ ok: false, message: 'Unsupported provider.' }, { status: 400 })

  const models = Array.isArray(body?.models)
    ? body.models.map((s: any) => String(s ?? '').trim()).filter(Boolean)
    : []
  if (models.length === 0) {
    return NextResponse.json({ ok: false, message: 'Add at least one model.' }, { status: 400 })
  }

  const data: any = { aiProvider: provider, aiModels: models.map((slug: string) => ({ slug })) }
  const apiKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : ''
  if (apiKey) {
    data.aiApiKeyCiphertext = encryptSecret(apiKey, getEnv().payloadSecret)
  }

  const payload = await getBrokerClient()
  await payload.updateGlobal({ slug: 'settings', data, overrideAccess: true })
  return NextResponse.json({ ok: true })
}
