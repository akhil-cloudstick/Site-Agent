/** Live test: the AI can compose the new Products section.
 *  Run: pnpm payload run src/agent/verify-products.ts  (-> products-result.txt) */
import { writeFileSync } from 'node:fs'

import { getBrokerClient } from '../broker/payload-client'
import { runContentEdit } from './content-agent'

const RESULT_FILE = 'S:/SiteAgent/brain/products-result.txt'
const out: string[] = []

try {
  const payload = await getBrokerClient()
  const globex = (await payload.find({ collection: 'tenants', where: { slug: { equals: 'globex' } }, limit: 1, overrideAccess: true })).docs[0]
  const home = (await payload.find({ collection: 'pages', where: { and: [{ tenant: { equals: globex.id } }, { slug: { equals: 'home' } }] }, draft: true, depth: 0, limit: 1, overrideAccess: true })).docs[0] as any

  const r = await runContentEdit(globex.id, home.id, 'Add a products section showcasing 3 products, each with a name, a price, an old price, and a discount badge.')
  out.push('agent: ' + JSON.stringify(r))

  const after = (await payload.find({ collection: 'pages', where: { id: { equals: home.id } }, draft: true, depth: 0, limit: 1, overrideAccess: true })).docs[0] as any
  const products = (after.layout ?? []).find((b: any) => b.blockType === 'products')
  out.push('sections: ' + (after.layout ?? []).map((b: any) => b.blockType).join(','))
  const items = products?.items ?? []
  out.push('product items: ' + items.length)
  out.push('first product: ' + JSON.stringify(items[0] ? { name: items[0].name, price: items[0].price, oldPrice: items[0].oldPrice, badge: items[0].badge } : null))

  const ok = r.ok && !!products && items.length >= 3 && !!items[0]?.name && !!items[0]?.price
  writeFileSync(RESULT_FILE, (ok ? 'PRODUCTS_OK' : 'PRODUCTS_FAIL') + '\n' + out.join('\n') + '\n')
  process.exit(ok ? 0 : 1)
} catch (err: any) {
  writeFileSync(RESULT_FILE, 'PRODUCTS_ERROR\n' + out.join('\n') + '\n' + (err?.stack ?? String(err)) + '\n')
  process.exit(1)
}
