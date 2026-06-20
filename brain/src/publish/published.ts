import { getBrokerClient } from '../broker/payload-client'
import { layoutToPreview } from '../workspace/layout'
import { routeOf } from '../workspace/preview'
import type { PreviewBlock } from '../workspace/types'

export interface PublishedPage {
  route: string
  navLabel: string
  title: string
  theme: { primaryColor: string; font: 'sans' | 'serif' }
  layout: PreviewBlock[]
}
export interface PublishedSite {
  name: string
  pages: PublishedPage[]
}

/**
 * Load a tenant's PUBLISHED site by slug for the public (no-login) site route.
 * Reads only published versions and exposes only the allowlisted public DTO
 * (same posture the real publish-snapshot will use).
 */
export async function loadPublishedSite(slug: string): Promise<PublishedSite | null> {
  const payload = await getBrokerClient()
  const tenant = (await payload.find({ collection: 'tenants', where: { slug: { equals: slug } }, limit: 1, overrideAccess: true })).docs[0]
  if (!tenant) return null

  // draft:false => published versions only. Public content, so overrideAccess is
  // acceptable AND we still only serialize the allowlisted DTO below.
  const pages = (await payload.find({
    collection: 'pages',
    where: { tenant: { equals: tenant.id } },
    draft: false,
    depth: 2,
    limit: 50,
    sort: 'navOrder',
    overrideAccess: true,
  })).docs

  if (pages.length === 0) return null

  return {
    name: typeof (tenant as any).name === 'string' ? (tenant as any).name : slug,
    pages: pages.map((p: any) => {
      const primaryColor = typeof p.theme?.primaryColor === 'string' && p.theme.primaryColor ? p.theme.primaryColor : '#2563eb'
      return {
        route: routeOf(p.slug),
        navLabel: (typeof p.navLabel === 'string' && p.navLabel) || (typeof p.title === 'string' ? p.title : 'Page'),
        title: typeof p.title === 'string' ? p.title : '',
        theme: { primaryColor, font: p.theme?.font === 'serif' ? 'serif' : 'sans' },
        layout: layoutToPreview(p),
      }
    }),
  }
}
