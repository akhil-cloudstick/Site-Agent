import { headers as nextHeaders } from 'next/headers'
import { redirect } from 'next/navigation'

import { resolveEffectiveTenant } from '@/auth/session'

import { LoginForm } from './workspace/LoginForm'
import './styles.css'

export const dynamic = 'force-dynamic'

/** Root: the shared login. Signed out → login form; signed in → role redirect
 *  (operator → /admin, tenant → /workspace). A suspended tenant member stays on the login
 *  form with a notice (so /workspace can safely redirect here without a loop). */
export default async function RootPage() {
  const reqHeaders = (await nextHeaders()) as unknown as Headers
  const eff = await resolveEffectiveTenant(reqHeaders)
  if (!eff.user) return <LoginForm />
  if (eff.user.isOperator) redirect('/admin')
  if (eff.suspended) return <LoginForm notice="Your account has been suspended. Please contact support." />
  redirect('/workspace')
}
