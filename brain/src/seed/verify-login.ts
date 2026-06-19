/** Verifies the seeded credentials work via the Local API login.
 *  Run: pnpm payload run src/seed/verify-login.ts  (result -> login-result.txt) */
import { writeFileSync } from 'node:fs'

import config from '@payload-config'
import { getPayload } from 'payload'

const RESULT_FILE = 'S:/SiteAgent/brain/login-result.txt'
const out: string[] = []

try {
  const payload = await getPayload({ config })
  for (const email of ['operator@siteagent.local', 'editor@acme.test']) {
    try {
      const res = await payload.login({ collection: 'users', data: { email, password: 'changeme123' } })
      out.push(`OK    ${email} -> token=${Boolean(res?.token)} user.id=${res?.user?.id}`)
    } catch (e: any) {
      out.push(`FAIL  ${email} -> ${e?.message}`)
    }
  }
  writeFileSync(RESULT_FILE, out.join('\n') + '\n')
  process.exit(0)
} catch (err: any) {
  writeFileSync(RESULT_FILE, 'ERROR\n' + out.join('\n') + '\n' + (err?.stack ?? String(err)) + '\n')
  process.exit(1)
}
