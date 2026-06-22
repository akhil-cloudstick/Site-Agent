import type { CollectionConfig } from 'payload'

/**
 * ConnectedSites — an external website (built by the client) that SiteAgent edits
 * the CONTENT of and republishes. The site's design/templates live in the client's
 * code; here we hold the editable content + where to publish it.
 *
 * Content is kept as three snapshots so the live site can never break:
 *   - draftContent: the working copy you edit (chat / click). Not live.
 *   - publishedContent: what is currently live at the URL.
 *   - previousContent: the prior live version → one-click rollback.
 *
 * Tenant-scoped via the multi-tenant plugin.
 */
export const ConnectedSites: CollectionConfig = {
  slug: 'connectedSites',
  admin: { useAsTitle: 'name' },
  fields: [
    { name: 'name', type: 'text', required: true },
    // The live web address the published site is served at.
    { name: 'originUrl', type: 'text', required: true },
    // Where the site's code lives (GitHub URL or local path) — optional metadata.
    { name: 'repo', type: 'text' },
    // The Cloudflare Pages project to (re)deploy to, so the same URL updates.
    { name: 'cloudflareProject', type: 'text' },
    // Where the editable content lives in the site's code (relative path).
    { name: 'contentPath', type: 'text', defaultValue: 'content.json' },
    { name: 'status', type: 'select', options: ['connected', 'error'], defaultValue: 'connected' },
    // The site's built HTML pages: { "<pathname>": "<html>" }. Content edits are
    // applied onto these on publish; the design lives here, untouched.
    { name: 'sourceHtml', type: 'json' },
    // Path to SiteAgent's managed copy of the WHOLE built site folder (all pages +
    // CSS/JS/images). Source of truth for the preview + the whole-site redeploy.
    { name: 'sourcePath', type: 'text' },
    // The page routes discovered in the built site, e.g. ["/", "/about", "/contact"].
    { name: 'pagePaths', type: 'json' },
    { name: 'lastError', type: 'text', admin: { readOnly: true } },
    { name: 'liveUrl', type: 'text', admin: { readOnly: true } },
    // The content snapshots (a tree of { key -> text | { image } } the templates render).
    { name: 'draftContent', type: 'json' },
    { name: 'publishedContent', type: 'json' },
    { name: 'previousContent', type: 'json' },
    // Undo history for draft edits: [{ path, id, prev }] — most recent last.
    { name: 'undoStack', type: 'json' },
  ],
}
