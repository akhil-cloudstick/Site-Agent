import type { Payload } from 'payload'

import { getBrokerClient } from '../broker/payload-client'
import { isReservedSlug, slugifyName } from '../lib/reservedSlugs'

/**
 * Create a tenant from the operator dashboard — the seed's per-tenant setup
 * (tenant + editor login + service principal + active ChangeSet + starter page),
 * with strict validation (Codex R1 #21) and COMPENSATING CLEANUP (Codex R2 #9):
 * `req.transactionID` isn't guaranteed in this path, so on any mid-step failure we
 * delete whatever was created — no partial tenant survives.
 *
 * Narrow bootstrap path: overrideAccess + the allowlisted `systemPurpose:'bootstrap'`
 * for the starter page (the same posture as the seed). NOT the audited adapter.
 */
const STARTER_LAYOUT = [
  { blockType: 'hero', heading: 'Welcome', subheading: 'Your new site' },
  {
    blockType: 'features',
    heading: 'What we offer',
    items: [
      { title: 'Fast', text: 'Lightning-quick performance.' },
      { title: 'Simple', text: 'Easy for anyone to use.' },
      { title: 'Reliable', text: 'Always up and running.' },
    ],
  },
  { blockType: 'cta', heading: 'Ready to get started?', buttonLabel: 'Contact us' },
]

async function uniqueSlug(payload: Payload, base: string): Promise<string> {
  const root = base || 'site'
  let candidate = root
  let n = 1
  // Reject reserved segments and existing slugs; retry with a numeric suffix.
  // eslint-disable-next-line no-await-in-loop
  while (isReservedSlug(candidate) || (await payload.find({ collection: 'tenants', where: { slug: { equals: candidate } }, limit: 1, depth: 0, overrideAccess: true })).docs.length > 0) {
    n += 1
    candidate = `${root}_${n}`
  }
  return candidate
}

export interface CreateTenantInput {
  name: string
  email: string
  password: string
}

export async function createTenant(input: CreateTenantInput): Promise<{ id: number; name: string; slug: string; email: string }> {
  const name = (input.name ?? '').trim()
  const email = (input.email ?? '').trim().toLowerCase()
  const password = input.password ?? ''
  if (!name) throw new Error('A site name is required.')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('A valid login email is required.')
  if (password.length < 8) throw new Error('Password must be at least 8 characters.')

  const payload = await getBrokerClient()

  const existing = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, depth: 0, overrideAccess: true })
  if (existing.docs.length > 0) throw new Error('A user with that email already exists.')

  const slug = await uniqueSlug(payload, slugifyName(name))

  const created: { collection: 'tenants' | 'users' | 'changesets' | 'pages'; id: number }[] = []
  const track = <T extends { id: number }>(collection: (typeof created)[number]['collection'], doc: T): T => {
    created.push({ collection, id: doc.id })
    return doc
  }

  try {
    const tenant = track('tenants', (await payload.create({ collection: 'tenants', data: { name, slug, status: 'active' }, overrideAccess: true })) as any)
    track('users', (await payload.create({ collection: 'users', data: { email, password, tenants: [{ tenant: tenant.id }] } as any, overrideAccess: true })) as any)
    track('users', (await payload.create({ collection: 'users', data: { email: `agent+${slug}@siteagent.local`, password: `${password}-sp9`, isServicePrincipal: true, tenants: [{ tenant: tenant.id }] } as any, overrideAccess: true })) as any)
    const changeset = track('changesets', (await payload.create({ collection: 'changesets', data: { tenant: tenant.id, status: 'active', kind: 'content', gitBranch: 'cs/seed' } as any, overrideAccess: true })) as any)
    track('pages', (await payload.create({
      collection: 'pages',
      data: { tenant: tenant.id, changeSetId: changeset.id, title: 'Home', slug: 'home', navLabel: 'Home', navOrder: 0, layout: STARTER_LAYOUT } as any,
      draft: true,
      overrideAccess: true,
      context: { systemPurpose: 'bootstrap' },
    })) as any)
    return { id: tenant.id, name, slug, email }
  } catch (err) {
    // Compensating cleanup — delete in reverse creation order so no partial tenant remains.
    for (const c of created.reverse()) {
      await payload.delete({ collection: c.collection, id: c.id, overrideAccess: true }).catch(() => {})
    }
    throw err instanceof Error ? err : new Error('Could not create the tenant.')
  }
}
