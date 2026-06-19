/**
 * Verifies the audited adapter + cross-tenant isolation (m5-localapi-adapter /
 * m5-isolation-tests / m4-ensure-changeset). Run AFTER the seed:
 *   pnpm payload run src/broker/verify-isolation.ts   (result -> isolation-result.txt)
 */
import { writeFileSync } from 'node:fs'

import { applyContentWrite, resolveServicePrincipal } from './adapter'
import { getBrokerClient } from './payload-client'

const RESULT_FILE = 'S:/SiteAgent/brain/isolation-result.txt'
const idOf = (v: any): number => (v && typeof v === 'object' ? v.id : v)
const out: string[] = []

async function findOne(payload: any, collection: string, where: any) {
  return (await payload.find({ collection, where, limit: 1, depth: 0, overrideAccess: true })).docs[0]
}

try {
  const payload = await getBrokerClient()
  const acme = await findOne(payload, 'tenants', { slug: { equals: 'acme' } })
  const globex = await findOne(payload, 'tenants', { slug: { equals: 'globex' } })
  if (!acme || !globex) throw new Error('seed data missing (need acme + globex) — run the seed first')
  const failures: string[] = []

  // A: adapter write as the service principal -> stamped into Acme's active ChangeSet.
  const acmeCs = await findOne(payload, 'changesets', {
    and: [{ tenant: { equals: acme.id } }, { status: { equals: 'active' } }],
  })
  const pageA = await applyContentWrite(acme.id, (p, principal) =>
    p.create({
      collection: 'pages',
      data: { tenant: acme.id, title: 'Adapter test', hero: {} },
      user: principal,
      overrideAccess: false,
      draft: true,
    }),
  )
  if (idOf(pageA.changeSetId) === acmeCs.id) out.push('PASS A: adapter write stamped into the active ChangeSet as the service principal')
  else {
    out.push(`FAIL A: stamped ${idOf(pageA.changeSetId)}, expected ${acmeCs.id}`)
    failures.push('A')
  }
  await payload.delete({ collection: 'pages', id: pageA.id, overrideAccess: true })

  // B: cross-tenant WRITE — Acme principal must not be able to write Globex content.
  const acmePrincipal = await resolveServicePrincipal(payload, acme.id)
  try {
    const bad = await payload.create({
      collection: 'pages',
      data: { tenant: globex.id, title: 'Cross', hero: {} },
      user: acmePrincipal,
      overrideAccess: false,
      draft: true,
    })
    if (idOf(bad.tenant) === globex.id) {
      out.push('FAIL B: Acme principal wrote Globex content')
      failures.push('B')
    } else {
      out.push('PASS B: cross-tenant write could not target Globex (re-scoped, not leaked)')
    }
    await payload.delete({ collection: 'pages', id: bad.id, overrideAccess: true })
  } catch {
    out.push('PASS B: cross-tenant write denied')
  }

  // C: cross-tenant READ — Acme principal sees no Globex pages.
  const acmeView = await payload.find({ collection: 'pages', user: acmePrincipal, overrideAccess: false, limit: 100, depth: 0 })
  const leaked = acmeView.docs.filter((d: any) => idOf(d.tenant) === globex.id)
  if (leaked.length === 0) out.push('PASS C: Acme principal sees no Globex pages')
  else {
    out.push(`FAIL C: leaked ${leaked.length} Globex pages`)
    failures.push('C')
  }

  // D: ensure-create — with no active ChangeSet, the adapter auto-opens one on write.
  await payload.update({ collection: 'changesets', id: acmeCs.id, data: { status: 'aborted' }, overrideAccess: true })
  const pageD = await applyContentWrite(acme.id, (p, principal) =>
    p.create({
      collection: 'pages',
      data: { tenant: acme.id, title: 'Ensure test', hero: {} },
      user: principal,
      overrideAccess: false,
      draft: true,
    }),
  )
  const newCsId = idOf(pageD.changeSetId)
  if (newCsId && newCsId !== acmeCs.id) out.push('PASS D: adapter auto-opened a new active ChangeSet on first write')
  else {
    out.push(`FAIL D: no new ChangeSet (${newCsId})`)
    failures.push('D')
  }
  // cleanup + restore original active ChangeSet
  await payload.delete({ collection: 'pages', id: pageD.id, overrideAccess: true })
  if (newCsId && newCsId !== acmeCs.id) await payload.delete({ collection: 'changesets', id: newCsId, overrideAccess: true }).catch(() => {})
  await payload.update({ collection: 'changesets', id: acmeCs.id, data: { status: 'active' }, overrideAccess: true })

  writeFileSync(RESULT_FILE, (failures.length ? 'ISOLATION_FAIL' : 'ISOLATION_OK') + '\n' + out.join('\n') + '\n')
  process.exit(failures.length ? 1 : 0)
} catch (err: any) {
  writeFileSync(RESULT_FILE, 'ISOLATION_ERROR\n' + out.join('\n') + '\n' + (err?.stack ?? String(err)) + '\n')
  process.exit(1)
}
