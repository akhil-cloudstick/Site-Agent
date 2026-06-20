/** Live test: a site can have multiple pages, each with its own route.
 *  Run: pnpm payload run src/agent/verify-multipage.ts  (-> multipage-result.txt) */
import { writeFileSync } from 'node:fs'

import { createTenantPage, listTenantPages } from '../broker/adapter'
import { getBrokerClient } from '../broker/payload-client'
import { loadWorkspaceDto } from '../workspace/preview'

const RESULT_FILE = 'S:/SiteAgent/brain/multipage-result.txt'
const out: string[] = []

try {
  const payload = await getBrokerClient()
  const acme = (await payload.find({ collection: 'tenants', where: { slug: { equals: 'acme' } }, limit: 1, overrideAccess: true })).docs[0]
  if (!acme) throw new Error('seed data missing')

  const before = await loadWorkspaceDto(acme.id)
  out.push('before: pages=' + before.pages.map((p) => `${p.navLabel}(${p.route})`).join(', '))

  // Add an About page if it isn't there yet (idempotent).
  const existing = (await listTenantPages(acme.id, 0)).find((p: any) => p.slug === 'about')
  if (!existing) {
    await createTenantPage(acme.id, {
      title: 'About',
      slug: 'about',
      navLabel: 'About',
      navOrder: 1,
      layout: [{ blockType: 'hero', heading: 'About Acme', subheading: 'Who we are' }],
    })
    out.push('created About page')
  } else {
    out.push('About page already present')
  }

  const after = await loadWorkspaceDto(acme.id)
  out.push('after: pages=' + after.pages.map((p) => `${p.navLabel}(${p.route})`).join(', '))

  const aboutSummary = after.pages.find((p) => p.route === '/about')
  const aboutView = aboutSummary ? await loadWorkspaceDto(acme.id, aboutSummary.id) : null
  out.push('about view: route=' + aboutView?.current?.route + ' title=' + aboutView?.current?.title)

  const ok =
    after.pages.length >= 2 &&
    after.pages.some((p) => p.route === '/') &&
    aboutView?.current?.route === '/about' &&
    aboutView?.current?.title === 'About'
  writeFileSync(RESULT_FILE, (ok ? 'MULTIPAGE_OK' : 'MULTIPAGE_FAIL') + '\n' + out.join('\n') + '\n')
  process.exit(ok ? 0 : 1)
} catch (err: any) {
  writeFileSync(RESULT_FILE, 'MULTIPAGE_ERROR\n' + out.join('\n') + '\n' + (err?.stack ?? String(err)) + '\n')
  process.exit(1)
}
