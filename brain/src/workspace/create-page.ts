import { createTenantPage, listTenantPages } from '@/broker/adapter'

/** Turn a page title into a URL-safe, length-capped slug. */
export function slugifyPageTitle(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'page'
}

/**
 * Add a new page to a tenant's site with a unique slug, seeded with a single
 * hero section. Shared by the "+ Add page" button route and the chat's
 * "add a new page X" command so both behave identically.
 */
export async function addTenantPage(tenantId: number, title: string, navLabel?: string, operatorUserId?: number) {
  const cleanTitle = title.trim() || 'New Page'
  const pages = await listTenantPages(tenantId, 0)
  const used = new Set(pages.map((p: any) => p.slug).filter(Boolean))
  let slug = slugifyPageTitle(cleanTitle)
  if (slug === 'home' || used.has(slug)) {
    let n = 2
    while (used.has(`${slug}-${n}`)) n++
    slug = `${slug}-${n}`
  }
  return createTenantPage(tenantId, {
    title: cleanTitle,
    slug,
    navLabel: (navLabel && navLabel.trim()) || cleanTitle,
    navOrder: pages.length,
    layout: [{ blockType: 'hero', heading: cleanTitle, subheading: '' }],
  }, operatorUserId)
}
