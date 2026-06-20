/** The allowlisted public preview shape (no internal/tenant fields). */
export type PreviewBlock =
  | { type: 'hero'; heading: string; subheading: string; imageUrl?: string }
  | { type: 'features'; heading: string; imageUrl?: string; items: { title: string; text: string; imageUrl?: string }[] }
  | { type: 'products'; heading: string; imageUrl?: string; items: { name: string; description: string; price: string; oldPrice: string; badge: string; buttonLabel: string; imageUrl?: string }[] }
  | { type: 'testimonials'; heading: string; imageUrl?: string; items: { quote: string; author: string; imageUrl?: string }[] }
  | { type: 'cta'; heading: string; buttonLabel: string; imageUrl?: string }
  | { type: 'contact'; heading: string; text: string; buttonLabel: string; imageUrl?: string }
  | { type: 'richText'; heading: string; body: string; imageUrl?: string }

export interface PreviewDto {
  title: string
  theme: { primaryColor: string; font: 'sans' | 'serif' }
  layout: PreviewBlock[]
}

/** One page's entry in the site nav / page switcher. */
export interface PageSummary {
  id: number
  title: string
  navLabel: string
  route: string // '/', '/about', ...
}

/** The page currently open in the workspace. */
export interface CurrentPage extends PreviewDto {
  id: number
  route: string
  canUndo: boolean
}

/** Everything the workspace needs: all pages (for nav + switcher) + the open one. */
export interface WorkspaceDto {
  pages: PageSummary[]
  current: CurrentPage | null
}
