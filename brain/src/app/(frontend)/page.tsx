import { headers as nextHeaders } from 'next/headers'
import { redirect } from 'next/navigation'

import { getSessionUser } from '@/auth/session'

import { LoginForm } from './workspace/LoginForm'
import './styles.css'

export const dynamic = 'force-dynamic'

/** Root: the shared login. Signed out → login form; signed in → role redirect
 *  (operator → /admin, tenant → /workspace). Replaces the old marketing page. */
export default async function RootPage() {
  const reqHeaders = (await nextHeaders()) as unknown as Headers
  const user = await getSessionUser(reqHeaders)
  if (!user) return <LoginForm />
  if (user.isOperator) redirect('/admin')
  redirect('/workspace')
}
