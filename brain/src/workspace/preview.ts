import { listTenantPages } from '../broker/adapter'
import { layoutToPreview } from './layout'
import type { CurrentPage, PageSummary, PreviewDto, WorkspaceDto } from './types'

/** A page's route from its slug: 'home'/empty => '/', otherwise '/<slug>'. */
export function routeOf(slug: unknown): string {
  const s = typeof slug === 'string' ? slug.trim() : ''
  return !s || s === 'home' ? '/' : '/' + s.replace(/^\/+/, '')
}

/** Map a stored page to the allowlisted public preview DTO. */
function pageToDto(page: any): PreviewDto {
  const primaryColor = typeof page.theme?.primaryColor === 'string' && page.theme.primaryColor ? page.theme.primaryColor : '#2563eb'
  return {
    title: typeof page.title === 'string' ? page.title : '',
    theme: { primaryColor, font: page.theme?.font === 'serif' ? 'serif' : 'sans' },
    layout: layoutToPreview(page),
  }
}

/** Load the whole workspace: every page (for nav + switcher) plus the open one. */
export async function loadWorkspaceDto(tenantId: number, currentPageId?: number): Promise<WorkspaceDto> {
  // depth 2 so block image relationships (layout -> block -> image) populate with URLs.
  const pages = await listTenantPages(tenantId, 2)

  const summaries: PageSummary[] = pages.map((p: any) => ({
    id: p.id,
    title: typeof p.title === 'string' ? p.title : 'Untitled',
    navLabel: (typeof p.navLabel === 'string' && p.navLabel) || (typeof p.title === 'string' ? p.title : 'Page'),
    route: routeOf(p.slug),
  }))

  const chosen = (currentPageId && pages.find((p: any) => p.id === currentPageId)) || pages[0]
  const current: CurrentPage | null = chosen
    ? {
        id: (chosen as any).id,
        route: routeOf((chosen as any).slug),
        canUndo: Array.isArray((chosen as any).previousLayout) && (chosen as any).previousLayout.length > 0,
        ...pageToDto(chosen),
      }
    : null

  return { pages: summaries, current }
}

/** Back-compat single-page loader (first page only). */
export async function loadPreviewDto(tenantId: number): Promise<PreviewDto | null> {
  const { current } = await loadWorkspaceDto(tenantId)
  return current
}
