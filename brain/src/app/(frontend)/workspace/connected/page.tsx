import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Connected sites are now part of the one unified workspace. */
export default function ConnectedPage() {
  redirect('/workspace')
}
