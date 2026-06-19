/**
 * End-to-end agent check (needs OPENROUTER_API_KEY in brain/.env). Asks the
 * agent to change Acme's hero heading and confirms the draft was updated through
 * the broker. Run: pnpm payload run src/agent/verify-agent.ts  (-> agent-result.txt)
 */
import { writeFileSync } from 'node:fs'

import config from '@payload-config'
import { getPayload } from 'payload'

import { runContentEdit } from './content-agent'

const RESULT_FILE = 'S:/SiteAgent/brain/agent-result.txt'
const out: string[] = []

try {
  const payload = await getPayload({ config })
  const acme = (await payload.find({ collection: 'tenants', where: { slug: { equals: 'acme' } }, limit: 1, overrideAccess: true })).docs[0]
  if (!acme) throw new Error('seed data missing — run the seed first')

  const result = await runContentEdit(acme.id, 'change the hero heading to "Summer Sale"')
  out.push('agent result: ' + JSON.stringify(result))

  const page = (await payload.find({ collection: 'pages', where: { tenant: { equals: acme.id } }, draft: true, limit: 1, depth: 0, overrideAccess: true })).docs[0]
  out.push('page hero now: ' + JSON.stringify((page as any)?.hero))

  const ok = result.ok && (page as any)?.hero?.heading === 'Summer Sale'
  writeFileSync(RESULT_FILE, (ok ? 'AGENT_OK' : 'AGENT_FAIL') + '\n' + out.join('\n') + '\n')
  process.exit(ok ? 0 : 1)
} catch (err: any) {
  writeFileSync(RESULT_FILE, 'AGENT_ERROR\n' + out.join('\n') + '\n' + (err?.stack ?? String(err)) + '\n')
  process.exit(1)
}
