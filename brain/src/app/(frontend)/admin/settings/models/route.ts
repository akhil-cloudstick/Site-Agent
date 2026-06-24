import { type NextRequest, NextResponse } from 'next/server'

import { getAiApiKey } from '@/agent/aiSettings'
import { getSessionUser } from '@/auth/session'

/** GET /admin/settings/models — the list of models the provider (OpenRouter) actually
 *  offers, so the operator selects from real models only (no free-text). Uses the saved
 *  API key when set; OpenRouter's catalogue is otherwise public. */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req.headers)
  if (!user?.isOperator) {
    return NextResponse.json({ ok: false, message: 'Operators only.' }, { status: 403 })
  }

  const headers: Record<string, string> = {}
  try {
    headers.Authorization = `Bearer ${await getAiApiKey()}`
  } catch {
    // No usable key yet — fall back to the public catalogue.
  }

  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', { headers })
    if (!res.ok) {
      return NextResponse.json({ ok: false, message: `Could not load models (HTTP ${res.status}).` }, { status: 502 })
    }
    const data: any = await res.json()
    const models = (Array.isArray(data?.data) ? data.data : [])
      .map((m: any) => ({ id: String(m?.id ?? ''), name: String(m?.name ?? m?.id ?? '') }))
      .filter((m: { id: string }) => m.id)
      .sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id))
    return NextResponse.json({ ok: true, models })
  } catch {
    return NextResponse.json({ ok: false, message: 'Could not reach the model provider.' }, { status: 502 })
  }
}
