import { notFound } from 'next/navigation'

import { loadPublishedSite } from '@/publish/published'
import { renderSiteBody } from '@/publish/render-html'

export const dynamic = 'force-dynamic'

/** Public, no-login view of a customer's PUBLISHED site at /site/<slug>[/page]. */
export default async function PublicSitePage({ params }: { params: Promise<{ slug: string; path?: string[] }> }) {
  const { slug, path } = await params
  const site = await loadPublishedSite(slug)
  if (!site) {
    return (
      <main style={{ fontFamily: 'system-ui, sans-serif', padding: 60, textAlign: 'center', color: '#666' }}>
        <h2 style={{ color: '#111' }}>Not published yet</h2>
        <p>This site has not been published, or does not exist.</p>
      </main>
    )
  }
  const route = path && path.length ? '/' + path.join('/') : '/'
  const current = site.pages.find((p) => p.route === route) ?? site.pages.find((p) => p.route === '/') ?? site.pages[0]
  if (!current) notFound()
  return <div dangerouslySetInnerHTML={{ __html: renderSiteBody(site, current, `/site/${slug}`) }} />
}
