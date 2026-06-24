import { headers as nextHeaders } from 'next/headers'

import { getSessionUser } from '@/auth/session'
import { loadOperatorDashboard } from '@/operator/dashboard'

import { AdminClient } from './AdminClient'

export const dynamic = 'force-dynamic'

/** Operator dashboard — tenants list + totals + add-tenant. (Layout already gated.) */
export default async function AdminTenantsPage() {
  const user = await getSessionUser((await nextHeaders()) as unknown as Headers)
  const data = await loadOperatorDashboard(user) // asserts operator inside
  return <AdminClient data={data} />
}
