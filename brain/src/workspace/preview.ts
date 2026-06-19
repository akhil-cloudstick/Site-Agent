import { listTenantPages } from '../broker/adapter'
import type { PreviewDto } from './types'

/** Load the in-Brain draft preview DTO for a tenant (allowlisted public fields only). */
export async function loadPreviewDto(tenantId: number): Promise<PreviewDto | null> {
  const pages = await listTenantPages(tenantId)
  const page = pages[0] as any
  if (!page) return null
  return {
    title: page.title ?? '',
    heading: page.hero?.heading ?? '',
    subheading: page.hero?.subheading ?? '',
  }
}
