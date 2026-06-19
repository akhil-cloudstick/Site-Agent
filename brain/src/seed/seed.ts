/**
 * Bootstrap seed (slice-1 substitute for real provisioning, PLAN.md §22).
 *
 * Creates one Operator and two Tenants (Acme, Globex); each tenant gets a human
 * editor, a minimal-role SERVICE PRINCIPAL (the machine identity the broker
 * writes as), an active ChangeSet, and a starter page. Two tenants exist so the
 * isolation tests can prove cross-tenant separation. Idempotent.
 *
 * Narrow BOOTSTRAP path: Local API + `overrideAccess`, starter page via the
 * allowlisted `systemPurpose: 'bootstrap'`. NOT the audited adapter, NOT a
 * general bypass (Codex R1 #4). Run: pnpm payload run src/seed/seed.ts
 */
import { writeFileSync } from 'node:fs'

import config from '@payload-config'
import { getPayload, type Payload } from 'payload'

const RESULT_FILE = 'S:/SiteAgent/brain/seed-result.txt'
const DEV_PASSWORD = 'changeme123' // dev only
const log: string[] = []

async function findOne(payload: Payload, collection: any, where: any) {
  const res = await payload.find({ collection, where, limit: 1, depth: 0, overrideAccess: true })
  return res.docs[0]
}

async function ensureUser(payload: Payload, email: string, extra: Record<string, unknown>) {
  let user = await findOne(payload, 'users', { email: { equals: email } })
  if (!user) {
    user = await payload.create({
      collection: 'users',
      data: { email, password: DEV_PASSWORD, ...extra },
      overrideAccess: true,
    })
    log.push(`created user ${email}`)
  }
  return user
}

async function ensureTenant(payload: Payload, name: string, slug: string) {
  let tenant = await findOne(payload, 'tenants', { slug: { equals: slug } })
  if (!tenant) {
    tenant = await payload.create({
      collection: 'tenants',
      data: { name, slug, status: 'active' },
      overrideAccess: true,
    })
    log.push(`created tenant ${name}`)
  }

  await ensureUser(payload, `editor@${slug}.test`, { tenants: [{ tenant: tenant.id }] })
  await ensureUser(payload, `agent@${slug}.test`, {
    isServicePrincipal: true,
    tenants: [{ tenant: tenant.id }],
  })

  let changeset = await findOne(payload, 'changesets', {
    and: [{ tenant: { equals: tenant.id } }, { status: { equals: 'active' } }],
  })
  if (!changeset) {
    changeset = await payload.create({
      collection: 'changesets',
      data: { tenant: tenant.id, status: 'active', kind: 'content', gitBranch: 'cs/seed' },
      overrideAccess: true,
    })
    log.push(`created active changeset ${changeset.id} for ${name}`)
  }

  const existingPage = await findOne(payload, 'pages', { tenant: { equals: tenant.id } })
  if (!existingPage) {
    await payload.create({
      collection: 'pages',
      data: {
        tenant: tenant.id,
        changeSetId: changeset.id,
        title: 'Home',
        hero: { heading: `Welcome to ${name}`, subheading: 'Your new site' },
      },
      draft: true,
      overrideAccess: true,
      context: { systemPurpose: 'bootstrap' },
    })
    log.push(`created starter page for ${name}`)
  }
}

try {
  const payload = await getPayload({ config })

  await ensureUser(payload, 'operator@siteagent.local', { isOperator: true })
  await ensureTenant(payload, 'Acme', 'acme')
  await ensureTenant(payload, 'Globex', 'globex')

  writeFileSync(RESULT_FILE, 'SEED_OK\n' + log.join('\n') + '\n')
  process.exit(0)
} catch (err: any) {
  writeFileSync(RESULT_FILE, 'SEED_FAIL\n' + log.join('\n') + '\n' + (err?.stack ?? String(err)) + '\n')
  process.exit(1)
}
