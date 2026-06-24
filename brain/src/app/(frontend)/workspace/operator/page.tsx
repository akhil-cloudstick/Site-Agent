import { redirect } from 'next/navigation'

/** The operator panel moved to /admin. Keep the old path working via a redirect. */
export default function OperatorRedirect() {
  redirect('/admin')
}
