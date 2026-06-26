import { headers as nextHeaders } from 'next/headers'

import { getSessionUser } from '@/auth/session'
import { loadOperatorErrors } from '@/operator/errorLog'

import { AdminErrorsClient } from './AdminErrorsClient'

export const dynamic = 'force-dynamic'

/** Operator error log — every failure a tenant hit (what they tried + why). (Layout already gated;
 *  a transient null session here shouldn't crash the page, so we fall back to an empty list.) */
export default async function AdminErrorsPage() {
  const user = await getSessionUser((await nextHeaders()) as unknown as Headers)
  const errors = await loadOperatorErrors(user).catch(() => []) // asserts operator inside
  return <AdminErrorsClient errors={errors} />
}
