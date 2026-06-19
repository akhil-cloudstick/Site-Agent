/**
 * Verifies the ChangeSet-enforcement hook + system-write deny (m4-beforechange /
 * m4-system-deny). Run AFTER the seed: pnpm payload run src/seed/verify-hook.ts
 * Result is written to verify-result.txt (survives process.exit).
 *
 *   1. an editor write WITH an active ChangeSet is auto-stamped with it,
 *   2. an editor write with NO active ChangeSet is rejected (Forbidden),
 *   3. a system write with a disallowed purpose is rejected.
 */
import { writeFileSync } from 'node:fs'

import config from '@payload-config'
import { getPayload, type Payload } from 'payload'

const RESULT_FILE = 'S:/SiteAgent/brain/verify-result.txt'

async function findOne(payload: Payload, collection: any, where: any) {
  const res = await payload.find({ collection, where, limit: 1, depth: 0, overrideAccess: true })
  return res.docs[0]
}

const idOf = (v: any): number => (v && typeof v === 'object' ? v.id : v)
const out: string[] = []

try {
  const payload = await getPayload({ config })
  const editor = await findOne(payload, 'users', { email: { equals: 'editor@acme.test' } })
  const tenant = await findOne(payload, 'tenants', { slug: { equals: 'acme' } })
  const cs = await findOne(payload, 'changesets', {
    and: [{ tenant: { equals: tenant?.id } }, { status: { equals: 'active' } }],
  })
  if (!editor || !tenant || !cs) throw new Error('seed data missing — run the seed first')

  const failures: string[] = []

  // Test 1: editor write with an active ChangeSet -> auto-stamped.
  try {
    const page = await payload.create({
      collection: 'pages',
      data: { tenant: tenant.id, title: 'Hook test 1', hero: {} },
      user: editor,
      overrideAccess: false,
      draft: true,
    })
    if (idOf(page.changeSetId) === cs.id) out.push('PASS test1: changeSetId auto-stamped to the active ChangeSet')
    else {
      out.push(`FAIL test1: stamped ${idOf(page.changeSetId)}, expected ${cs.id}`)
      failures.push('test1')
    }
    await payload.delete({ collection: 'pages', id: page.id, overrideAccess: true })
  } catch (e: any) {
    out.push('FAIL test1: threw - ' + e?.message)
    failures.push('test1')
  }

  // Test 2: no active ChangeSet -> Forbidden.
  await payload.update({ collection: 'changesets', id: cs.id, data: { status: 'published' }, overrideAccess: true })
  try {
    await payload.create({
      collection: 'pages',
      data: { tenant: tenant.id, title: 'Hook test 2', hero: {} },
      user: editor,
      overrideAccess: false,
      draft: true,
    })
    out.push('FAIL test2: write succeeded with no active ChangeSet')
    failures.push('test2')
  } catch (e: any) {
    if (String(e?.message).includes('No active ChangeSet')) out.push('PASS test2: write rejected when there is no active ChangeSet')
    else {
      out.push('FAIL test2: wrong error - ' + e?.message)
      failures.push('test2')
    }
  }
  await payload.update({ collection: 'changesets', id: cs.id, data: { status: 'active' }, overrideAccess: true })

  // Test 3: system write with a disallowed purpose -> denied.
  try {
    await payload.create({
      collection: 'pages',
      data: { tenant: tenant.id, changeSetId: cs.id, title: 'Hook test 3', hero: {} },
      overrideAccess: true,
      context: { systemPurpose: 'evil' },
    })
    out.push('FAIL test3: a disallowed system purpose was accepted')
    failures.push('test3')
  } catch (e: any) {
    if (String(e?.message).includes('not permitted')) out.push('PASS test3: disallowed system purpose rejected')
    else {
      out.push('FAIL test3: wrong error - ' + e?.message)
      failures.push('test3')
    }
  }

  writeFileSync(RESULT_FILE, (failures.length ? 'HOOK_VERIFY_FAIL' : 'HOOK_VERIFY_OK') + '\n' + out.join('\n') + '\n')
  process.exit(failures.length ? 1 : 0)
} catch (err: any) {
  writeFileSync(RESULT_FILE, 'VERIFY_ERROR\n' + out.join('\n') + '\n' + (err?.stack ?? String(err)) + '\n')
  process.exit(1)
}
