/** Live test: the dynamic layout can GROW (add more items + add sections).
 *  Run: pnpm payload run src/agent/verify-layout.ts   (-> layout-result.txt) */
import { writeFileSync } from 'node:fs'

import { getBrokerClient } from '../broker/payload-client'
import { runContentEdit } from './content-agent'

const RESULT_FILE = 'S:/SiteAgent/brain/layout-result.txt'
const out: string[] = []

async function featuresCount(payload: any, tenantId: number) {
  const page = (await payload.find({ collection: 'pages', where: { tenant: { equals: tenantId } }, draft: true, depth: 1, limit: 1, overrideAccess: true })).docs[0]
  const f = (page?.layout ?? []).find((b: any) => b.blockType === 'features')
  return { count: f?.items?.length ?? 0, types: (page?.layout ?? []).map((b: any) => b.blockType) }
}

try {
  const payload = await getBrokerClient()
  const acme = (await payload.find({ collection: 'tenants', where: { slug: { equals: 'acme' } }, limit: 1, overrideAccess: true })).docs[0]
  if (!acme) throw new Error('seed data missing')

  const before = await featuresCount(payload, acme.id)
  out.push('before: ' + before.count + ' features; sections: ' + before.types.join(','))

  const result = await runContentEdit(acme.id, undefined, 'Add two more features to the features section, keeping the existing ones.')
  out.push('agent result: ' + JSON.stringify(result))

  const after = await featuresCount(payload, acme.id)
  out.push('after: ' + after.count + ' features; sections: ' + after.types.join(','))

  const ok = result.ok && after.count > before.count && after.count >= 4
  writeFileSync(RESULT_FILE, (ok ? 'LAYOUT_OK' : 'LAYOUT_FAIL') + '\n' + out.join('\n') + '\n')
  process.exit(ok ? 0 : 1)
} catch (err: any) {
  writeFileSync(RESULT_FILE, 'LAYOUT_ERROR\n' + out.join('\n') + '\n' + (err?.stack ?? String(err)) + '\n')
  process.exit(1)
}
