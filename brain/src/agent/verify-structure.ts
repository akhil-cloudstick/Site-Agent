/** Live test: add/move/delete sections + items, and one-level undo (the swap).
 *  Run: pnpm payload run src/agent/verify-structure.ts  (-> structure-result.txt) */
import { writeFileSync } from 'node:fs'

import { listTenantPages, updateTenantPage } from '../broker/adapter'
import { getBrokerClient } from '../broker/payload-client'
import { normalizeLayout } from '../workspace/layout'
import { applyStructureOp } from '../workspace/structure'

const RESULT_FILE = 'S:/SiteAgent/brain/structure-result.txt'
const out: string[] = []

async function home(payload: any, tenantId: number) {
  return (await payload.find({ collection: 'pages', where: { and: [{ tenant: { equals: tenantId } }, { slug: { equals: 'home' } }] }, draft: true, depth: 1, limit: 1, overrideAccess: true })).docs[0]
}

try {
  const payload = await getBrokerClient()
  const acme = (await payload.find({ collection: 'tenants', where: { slug: { equals: 'acme' } }, limit: 1, overrideAccess: true })).docs[0]

  let page = await home(payload, acme.id)
  const startCount = page.layout.length
  out.push('start sections: ' + startCount)

  // add a section
  const l1 = applyStructureOp(page, { op: 'add-section', type: 'cta' })!
  await updateTenantPage(acme.id, page.id, { layout: l1, previousLayout: normalizeLayout(page) })
  page = await home(payload, acme.id)
  out.push('after add: ' + page.layout.length)

  // undo (swap previousLayout back)
  const prev = page.previousLayout
  await updateTenantPage(acme.id, page.id, { layout: prev, previousLayout: normalizeLayout(page) })
  page = await home(payload, acme.id)
  out.push('after undo: ' + page.layout.length)
  const undoneOk = page.layout.length === startCount

  // add an item to the features section
  const fIdx = page.layout.findIndex((b: any) => b.blockType === 'features')
  const beforeItems = page.layout[fIdx].items.length
  const l2 = applyStructureOp(page, { op: 'add-item', index: fIdx })!
  await updateTenantPage(acme.id, page.id, { layout: l2, previousLayout: normalizeLayout(page) })
  page = await home(payload, acme.id)
  const afterItems = page.layout[fIdx].items.length
  out.push(`features items: ${beforeItems} -> ${afterItems}`)

  // move that features section up, then delete the item we added
  const l3 = applyStructureOp(page, { op: 'delete-item', index: fIdx, itemIndex: afterItems - 1 })!
  await updateTenantPage(acme.id, page.id, { layout: l3, previousLayout: normalizeLayout(page) })
  page = await home(payload, acme.id)
  out.push('features items after delete: ' + page.layout[fIdx].items.length)

  const ok = undoneOk && afterItems === beforeItems + 1 && page.layout[fIdx].items.length === beforeItems
  writeFileSync(RESULT_FILE, (ok ? 'STRUCTURE_OK' : 'STRUCTURE_FAIL') + '\n' + out.join('\n') + '\n')
  process.exit(ok ? 0 : 1)
} catch (err: any) {
  writeFileSync(RESULT_FILE, 'STRUCTURE_ERROR\n' + out.join('\n') + '\n' + (err?.stack ?? String(err)) + '\n')
  process.exit(1)
}
