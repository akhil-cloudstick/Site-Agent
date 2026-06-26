import { type NextRequest, NextResponse } from 'next/server'

import { getSessionUser } from '@/auth/session'
import { resetModelUsage } from '@/agent/recordModelUsage'

/** POST /admin/settings/usage/reset — operator zeroes the per-model usage counters. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req.headers)
  if (!user?.isOperator) return NextResponse.json({ ok: false, message: 'Operators only.' }, { status: 403 })
  await resetModelUsage()
  return NextResponse.json({ ok: true })
}
