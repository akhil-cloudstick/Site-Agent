import { type NextRequest, NextResponse } from 'next/server'

import { getSessionUser } from '@/auth/session'
import { getBrokerClient } from '@/broker/payload-client'
import { removeTenant } from '@/operator/removeTenant'

/**
 * POST /admin/tenants/[id]/remove { confirm: <slug>, deleteCloudflare?: boolean }
 * Permanently delete a tenant. Requires the operator to type the tenant's slug (typed
 * confirmation) so it can't be triggered by accident.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req.headers)
  if (!user?.isOperator) return NextResponse.json({ ok: false, message: 'Operators only.' }, { status: 403 })

  const tenantId = Number((await params).id)
  if (!tenantId) return NextResponse.json({ ok: false, message: 'Bad request.' }, { status: 400 })

  let body: any
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const confirm = typeof body?.confirm === 'string' ? body.confirm.trim() : ''
  const deleteCloudflare = body?.deleteCloudflare === true

  // Verify the typed confirmation matches the tenant's slug before doing anything destructive.
  const payload = await getBrokerClient()
  const tenant: any = await payload.findByID({ collection: 'tenants', id: tenantId, overrideAccess: true, depth: 0 }).catch(() => null)
  if (!tenant) return NextResponse.json({ ok: false, message: 'Tenant not found.' }, { status: 404 })
  if (confirm !== tenant.slug) {
    return NextResponse.json({ ok: false, message: `Type the tenant slug "${tenant.slug}" to confirm.` }, { status: 400 })
  }

  try {
    const result = await removeTenant(user, tenantId, { deleteCloudflare })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json({ ok: false, message: err instanceof Error ? err.message : 'Could not remove the tenant.' }, { status: 500 })
  }
}
