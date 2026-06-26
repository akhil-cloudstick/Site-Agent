import { rm } from 'node:fs/promises'
import path from 'node:path'

import { resolveServicePrincipal } from '../broker/adapter'
import { getBrokerClient } from '../broker/payload-client'
import { noopCtx, type JobCtx } from '../jobs/registry'
import type { ContentMap } from './content'
import { applyContent, extractContent } from './html'
import { ingestBuiltSite } from './ingest-folder'
import {
  addNavLink,
  applyElementOp,
  applyElementOpInComponent,
  applyItemOp,
  applyItemOpInComponent,
  applySectionOp,
  replaceItemHtml,
  replaceItemInComponent,
  clonePageForNewRoute,
  deleteComponent,
  parseGeneratedSection,
  remapDraft,
  removeNavLinks,
  replaceComponent,
  routeFromTitle,
  setMainContent,
  sharedComponentLocator,
  sharedItemLocator,
  sharedSectionLocator,
  stripPageChrome,
  uniqueRoute,
  type ElementOp,
  type ItemOp,
  type SectionOp,
} from './structure'

/** Where SiteAgent keeps its managed copy of each connected site's built folder. */
const SITES_DIR = path.join(process.cwd(), '.connected-sites')

/** The managed on-disk folder for a connected site (cloned repo + built copy). */
export const siteFolder = (siteId: number) => path.join(SITES_DIR, String(siteId))

/**
 * Tenant-scoped reads/writes for ConnectedSites, as the tenant's service principal
 * with overrideAccess:false (multi-tenant rules apply). These sites have their own
 * draft/published snapshots, so they don't use the page ChangeSet machinery.
 */

/** Built HTML keyed by pathname, e.g. { "/": "<html>…" }. */
export type PageHtmlMap = Record<string, string>
/** Content keyed by pathname → its content map, e.g. { "/": { "hero.heading": {…} } }. */
export type SiteContentMap = Record<string, ContentMap>

/** Connect a site from its built HTML pages: extract editable content per page + store. */
export async function connectSite(
  tenantId: number,
  data: { name: string; originUrl: string; repo?: string; cloudflareProject?: string; pages: PageHtmlMap },
) {
  const payload = await getBrokerClient()
  const principal = await resolveServicePrincipal(payload, tenantId)

  const content: SiteContentMap = {}
  for (const [pathname, html] of Object.entries(data.pages)) content[pathname] = extractContent(html)

  return payload.create({
    collection: 'connectedSites',
    data: {
      tenant: tenantId,
      name: data.name,
      originUrl: data.originUrl,
      repo: data.repo,
      cloudflareProject: data.cloudflareProject,
      status: 'connected',
      sourceHtml: data.pages,
      // On connect the current content is both the live snapshot and the working copy.
      draftContent: content,
      publishedContent: content,
    } as any,
    user: principal,
    overrideAccess: false,
  })
}

/**
 * Create the ConnectedSites record up-front (no content yet) so the managed folder can
 * be keyed by its id and the caller can show progress against a real site id. The slow
 * ingest (clone/build/copy/read) then runs separately via `ingestConnectedSite`.
 */
export async function createConnectedSiteShell(
  tenantId: number,
  data: { name: string; originUrl: string; repo?: string; cloudflareProject?: string },
) {
  const payload = await getBrokerClient()
  const principal = await resolveServicePrincipal(payload, tenantId)
  return payload.create({
    collection: 'connectedSites',
    data: {
      tenant: tenantId,
      name: data.name,
      originUrl: data.originUrl,
      repo: data.repo,
      cloudflareProject: data.cloudflareProject,
      status: 'connected',
    } as any,
    user: principal,
    overrideAccess: false,
  })
}

/**
 * Ingest a WHOLE built site into an existing shell record: copy the built site into
 * managed storage (all pages + CSS/JS/images), read every page's editable content, and
 * record where the folder lives. Reports progress + honors cancel via `ctx`. Throws on
 * failure/cancel; the caller (job runner) removes the shell + folder on cleanup.
 */
export async function ingestConnectedSite(
  tenantId: number,
  siteId: number,
  sourcePath: string,
  ctx: JobCtx = noopCtx,
  name = 'the site',
) {
  const payload = await getBrokerClient()
  const principal = await resolveServicePrincipal(payload, tenantId)
  const destDir = path.join(siteFolder(siteId), 'source')
  const { sourcePath: managed, pages, pagePaths } = await ingestBuiltSite(sourcePath, destDir, ctx, name)
  const content: SiteContentMap = {}
  for (const [pathname, html] of Object.entries(pages)) content[pathname] = extractContent(html)
  await payload.update({
    collection: 'connectedSites',
    id: siteId,
    data: { sourceHtml: pages, sourcePath: managed, pagePaths, draftContent: content, publishedContent: content } as any,
    user: principal,
    overrideAccess: false,
  })
  return { pagePaths }
}

/**
 * Connect a WHOLE built site in one call (shell + ingest). Used outside the job flow.
 * The job-based connect uses `createConnectedSiteShell` + `ingestConnectedSite` so it
 * can stream progress and clean up the folder + shell on cancel/failure.
 */
export async function connectFromFolder(
  tenantId: number,
  data: { name: string; originUrl: string; repo?: string; cloudflareProject?: string; sourcePath: string },
) {
  const created = (await createConnectedSiteShell(tenantId, data)) as any
  try {
    await ingestConnectedSite(tenantId, created.id, data.sourcePath, noopCtx, data.name)
    return await getConnectedSite(tenantId, created.id)
  } catch (err) {
    // A failed connect shouldn't leave a junk site or folder behind.
    await deleteConnectedSite(tenantId, created.id).catch(() => {})
    throw err
  }
}

/** Remove a connected site AND its managed files (the pulled repo / built site copy and
 *  any publish temp), so removing a site doesn't leave folders behind on disk. Reports
 *  progress via `ctx` (removal of a large cloned repo can take a moment). */
export async function deleteConnectedSite(tenantId: number, siteId: number, ctx: JobCtx = noopCtx) {
  const payload = await getBrokerClient()
  const principal = await resolveServicePrincipal(payload, tenantId)
  ctx.reporter(40, 'Removing the site record…')
  const res = await payload.delete({ collection: 'connectedSites', id: siteId, user: principal, overrideAccess: false })
  // Tidy up the on-disk folders for this site (the cloned repo + built copy, + publish temp).
  ctx.reporter(75, 'Removing the copied files…')
  await rm(siteFolder(siteId), { recursive: true, force: true }).catch(() => {})
  await rm(path.join(process.cwd(), '.connected-publish', String(siteId)), { recursive: true, force: true }).catch(() => {})
  return res
}

export async function listConnectedSites(tenantId: number) {
  const payload = await getBrokerClient()
  const principal = await resolveServicePrincipal(payload, tenantId)
  return (await payload.find({ collection: 'connectedSites', user: principal, overrideAccess: false, limit: 50, depth: 0 })).docs
}

export async function getConnectedSite(tenantId: number, siteId: number) {
  const payload = await getBrokerClient()
  const principal = await resolveServicePrincipal(payload, tenantId)
  const res = await payload.find({
    collection: 'connectedSites',
    where: { id: { equals: siteId } },
    user: principal,
    overrideAccess: false,
    limit: 1,
    depth: 0,
  })
  return res.docs[0] ?? null
}

export async function updateConnectedSite(tenantId: number, siteId: number, data: Record<string, unknown>) {
  const payload = await getBrokerClient()
  const principal = await resolveServicePrincipal(payload, tenantId)
  return payload.update({ collection: 'connectedSites', id: siteId, data: data as any, user: principal, overrideAccess: false })
}

/**
 * Find every copy of an item that should change together. A built site compiles shared
 * components (footer, nav, logo) into each page, so the same value appears on multiple
 * pages. If the value being edited appears on 2+ pages, ALL copies are returned (so a
 * footer/nav/logo edit on one page updates them everywhere); otherwise just this item.
 * Works for both text and images (e.g. a shared logo).
 */
export function sharedTargets(draft: SiteContentMap, pathname: string, id: string, kind: 'text' | 'image'): { path: string; id: string }[] {
  const self = [{ path: pathname, id }]
  const oldValue = draft[pathname]?.[id]?.value
  if (typeof oldValue !== 'string' || oldValue.trim().length === 0) return self
  const matches: { path: string; id: string }[] = []
  const pagesWith = new Set<string>()
  for (const [p, map] of Object.entries(draft)) {
    for (const [i, e] of Object.entries(map)) {
      if (e.type === kind && e.value === oldValue) {
        matches.push({ path: p, id: i })
        pagesWith.add(p)
      }
    }
  }
  return pagesWith.size >= 2 ? matches : self
}

/**
 * Set one draft content value (text or image) for a page. A shared component (footer /
 * nav / logo) is compiled into every page, so the same value can live on several pages;
 * `sharedTargets` updates ALL of them together. Returns the distinct page paths changed,
 * so the workspace can refresh every affected page's preview (not just the current one).
 */
export async function setDraftValue(
  tenantId: number,
  siteId: number,
  pathname: string,
  id: string,
  kind: 'text' | 'image',
  value: string,
): Promise<string[]> {
  const site = (await getConnectedSite(tenantId, siteId)) as any
  if (!site) throw new Error('Site not found')
  const draft: SiteContentMap = site.draftContent ?? {}
  const targets = sharedTargets(draft, pathname, id, kind)

  const next: SiteContentMap = { ...draft }
  const changes: { path: string; id: string; prev: any }[] = []
  for (const t of targets) {
    const page = { ...(next[t.path] ?? {}) }
    changes.push({ path: t.path, id: t.id, prev: page[t.id] ?? null })
    page[t.id] = { type: kind, value }
    next[t.path] = page
  }
  // One undo entry covers all the copies changed together.
  const stack = Array.isArray(site.undoStack) ? site.undoStack.slice(-49) : []
  stack.push({ changes })
  await updateConnectedSite(tenantId, siteId, { draftContent: next, undoStack: stack })
  return Array.from(new Set(targets.map((t) => t.path)))
}

/**
 * Apply one structural op (move/delete/insert a top-level section) to a connected
 * page. Mutates the page's stored `sourceHtml`, then RE-ANCHORS the page's draft
 * content (`remapDraft`) so prior edits survive the structural change, and pushes a
 * structural undo entry (a page-level snapshot, since a DOM op isn't reversible
 * field-by-field). Returns the affected page path(s) for preview refresh.
 */
export async function applyStructureToPage(
  tenantId: number,
  siteId: number,
  pathname: string,
  op: SectionOp,
): Promise<{ ok: boolean; message?: string; paths: string[]; skipped?: number }> {
  const site = (await getConnectedSite(tenantId, siteId)) as any
  if (!site) throw new Error('Site not found')
  const sourceHtml: PageHtmlMap = site.sourceHtml ?? {}
  const oldHtml = sourceHtml[pathname]
  if (typeof oldHtml !== 'string') return { ok: false, message: 'Page not found.', paths: [] }
  const draftAll: SiteContentMap = site.draftContent ?? {}

  // If this section IS a shared component (header/nav/footer), a REPLACE (e.g. Edit-with-AI)
  // or DELETE reflects on EVERY page — so an AI nav edit isn't stranded on one page.
  const sharedLoc = op.op === 'replace' || op.op === 'delete' ? sharedSectionLocator(oldHtml, op.index) : null
  if (sharedLoc) {
    const nextSourceAll: PageHtmlMap = { ...sourceHtml }
    const nextDraftAll: SiteContentMap = { ...draftAll }
    const snaps: { path: string; prevSourceHtml: string; prevDraft: ContentMap }[] = []
    for (const p of Object.keys(sourceHtml)) {
      const ph = sourceHtml[p]
      const nh = op.op === 'replace' ? replaceComponent(ph, sharedLoc, op.html) : deleteComponent(ph, sharedLoc)
      if (nh && nh !== ph) {
        snaps.push({ path: p, prevSourceHtml: ph, prevDraft: draftAll[p] ?? {} })
        nextSourceAll[p] = nh
        nextDraftAll[p] = remapDraft(ph, draftAll[p] ?? {}, nh).draft
      }
    }
    if (snaps.length) {
      const st = Array.isArray(site.undoStack) ? site.undoStack.slice(-49) : []
      st.push({ kind: 'structure', pages: snaps })
      await updateConnectedSite(tenantId, siteId, { sourceHtml: nextSourceAll, draftContent: nextDraftAll, undoStack: st })
      return { ok: true, paths: snaps.map((s) => s.path) }
    }
    // fall through to single-page if nothing matched
  }

  const newHtml = applySectionOp(oldHtml, op)
  if (newHtml == null) return { ok: false, message: 'That change is not allowed.', paths: [] }
  if (newHtml === oldHtml) return { ok: true, paths: [pathname] } // edge move = no-op

  const oldDraft: ContentMap = draftAll[pathname] ?? {}
  const { draft: newDraft, skipped } = remapDraft(oldHtml, oldDraft, newHtml)

  const nextSource: PageHtmlMap = { ...sourceHtml, [pathname]: newHtml }
  const nextDraft: SiteContentMap = { ...draftAll, [pathname]: newDraft }

  const stack = Array.isArray(site.undoStack) ? site.undoStack.slice(-49) : []
  stack.push({ kind: 'structure', pages: [{ path: pathname, prevSourceHtml: oldHtml, prevDraft: oldDraft }] })

  await updateConnectedSite(tenantId, siteId, { sourceHtml: nextSource, draftContent: nextDraft, undoStack: stack })
  return { ok: true, paths: [pathname], skipped }
}

/**
 * Apply one deterministic button/link op (set redirect, remove, add a button) to a page,
 * remapping the page's draft so existing edits survive. Returns the affected page path.
 */
export async function applyElementToPage(
  tenantId: number,
  siteId: number,
  pathname: string,
  op: ElementOp,
): Promise<{ ok: boolean; message?: string; paths: string[] }> {
  const site = (await getConnectedSite(tenantId, siteId)) as any
  if (!site) throw new Error('Site not found')
  const sourceHtml: PageHtmlMap = site.sourceHtml ?? {}
  const oldHtml = sourceHtml[pathname]
  if (typeof oldHtml !== 'string') return { ok: false, message: 'Page not found.', paths: [] }
  const draftAll: SiteContentMap = site.draftContent ?? {}

  // If the edited button/link is inside a SHARED component (nav/header/footer), apply the
  // SAME op to every page's matching component — so the change reflects site-wide (like
  // content edits), applied per-page so each page keeps its own "active" highlight.
  const loc = op.op !== 'add-button' && op.op !== 'link-image' ? sharedComponentLocator(oldHtml, op.index) : null
  if (loc) {
    const nextSource: PageHtmlMap = { ...sourceHtml }
    const nextDraft: SiteContentMap = { ...draftAll }
    const snaps: { path: string; prevSourceHtml: string; prevDraft: ContentMap }[] = []
    const scopedOp = { ...op, index: loc.elIndex } as ElementOp
    for (const p of Object.keys(sourceHtml)) {
      const ph = sourceHtml[p]
      const nh = applyElementOpInComponent(ph, loc, scopedOp)
      if (nh && nh !== ph) {
        snaps.push({ path: p, prevSourceHtml: ph, prevDraft: draftAll[p] ?? {} })
        nextSource[p] = nh
        nextDraft[p] = remapDraft(ph, draftAll[p] ?? {}, nh).draft
      }
    }
    if (!snaps.length) return { ok: false, message: 'That change is not allowed.', paths: [] }
    const stack = Array.isArray(site.undoStack) ? site.undoStack.slice(-49) : []
    stack.push({ kind: 'structure', pages: snaps })
    await updateConnectedSite(tenantId, siteId, { sourceHtml: nextSource, draftContent: nextDraft, undoStack: stack })
    return { ok: true, paths: snaps.map((s) => s.path) }
  }

  // Otherwise it's a main-content element → this page only.
  const newHtml = applyElementOp(oldHtml, op)
  if (newHtml == null) return { ok: false, message: 'That change is not allowed.', paths: [] }
  if (newHtml === oldHtml) return { ok: true, paths: [pathname] }

  const oldDraft: ContentMap = draftAll[pathname] ?? {}
  const { draft: newDraft } = remapDraft(oldHtml, oldDraft, newHtml)
  const stack = Array.isArray(site.undoStack) ? site.undoStack.slice(-49) : []
  stack.push({ kind: 'structure', pages: [{ path: pathname, prevSourceHtml: oldHtml, prevDraft: oldDraft }] })

  await updateConnectedSite(tenantId, siteId, {
    sourceHtml: { ...sourceHtml, [pathname]: newHtml },
    draftContent: { ...draftAll, [pathname]: newDraft },
    undoStack: stack,
  })
  return { ok: true, paths: [pathname] }
}

/**
 * Apply one deterministic item op (reorder / duplicate / remove a card, nav link, or button
 * in a group) to a page, remapping drafts so existing edits survive. If the item is in a
 * SHARED component (nav/header/footer) the same op runs on every page so it stays in sync.
 */
export async function applyItemToPage(
  tenantId: number,
  siteId: number,
  pathname: string,
  op: ItemOp,
): Promise<{ ok: boolean; message?: string; paths: string[] }> {
  const site = (await getConnectedSite(tenantId, siteId)) as any
  if (!site) throw new Error('Site not found')
  const sourceHtml: PageHtmlMap = site.sourceHtml ?? {}
  const oldHtml = sourceHtml[pathname]
  if (typeof oldHtml !== 'string') return { ok: false, message: 'Page not found.', paths: [] }
  const draftAll: SiteContentMap = site.draftContent ?? {}

  // Shared component (e.g. reordering / duplicating / removing a nav link) → apply per-page.
  const loc = sharedItemLocator(oldHtml, op.index)
  if (loc) {
    const nextSource: PageHtmlMap = { ...sourceHtml }
    const nextDraft: SiteContentMap = { ...draftAll }
    const snaps: { path: string; prevSourceHtml: string; prevDraft: ContentMap }[] = []
    for (const p of Object.keys(sourceHtml)) {
      const ph = sourceHtml[p]
      const nh = applyItemOpInComponent(ph, loc, op)
      if (nh && nh !== ph) {
        snaps.push({ path: p, prevSourceHtml: ph, prevDraft: draftAll[p] ?? {} })
        nextSource[p] = nh
        nextDraft[p] = remapDraft(ph, draftAll[p] ?? {}, nh).draft
      }
    }
    if (!snaps.length) return { ok: false, message: 'That change is not allowed.', paths: [] }
    const stack = Array.isArray(site.undoStack) ? site.undoStack.slice(-49) : []
    stack.push({ kind: 'structure', pages: snaps })
    await updateConnectedSite(tenantId, siteId, { sourceHtml: nextSource, draftContent: nextDraft, undoStack: stack })
    return { ok: true, paths: snaps.map((s) => s.path) }
  }

  // Otherwise a content item (a card etc.) → this page only.
  const newHtml = applyItemOp(oldHtml, op)
  if (newHtml == null) return { ok: false, message: 'That change is not allowed.', paths: [] }
  if (newHtml === oldHtml) return { ok: true, paths: [pathname] } // edge move = no-op

  const oldDraft: ContentMap = draftAll[pathname] ?? {}
  const { draft: newDraft } = remapDraft(oldHtml, oldDraft, newHtml)
  const stack = Array.isArray(site.undoStack) ? site.undoStack.slice(-49) : []
  stack.push({ kind: 'structure', pages: [{ path: pathname, prevSourceHtml: oldHtml, prevDraft: oldDraft }] })

  await updateConnectedSite(tenantId, siteId, {
    sourceHtml: { ...sourceHtml, [pathname]: newHtml },
    draftContent: { ...draftAll, [pathname]: newDraft },
    undoStack: stack,
  })
  return { ok: true, paths: [pathname] }
}

/** Replace ONE item (a card / nav item) with AI-edited HTML (re-sanitised). Used by item "Edit
 *  with AI". Syncs across pages when the item is in a shared nav/header/footer. */
export async function replaceItemToPage(
  tenantId: number,
  siteId: number,
  pathname: string,
  index: number,
  rawHtml: string,
): Promise<{ ok: boolean; message?: string; paths: string[] }> {
  const safe = parseGeneratedSection({ html: rawHtml })
  if (!safe.ok) return { ok: false, message: `That change couldn’t be applied safely (${safe.error}).`, paths: [] }
  const site = (await getConnectedSite(tenantId, siteId)) as any
  if (!site) throw new Error('Site not found')
  const sourceHtml: PageHtmlMap = site.sourceHtml ?? {}
  const oldHtml = sourceHtml[pathname]
  if (typeof oldHtml !== 'string') return { ok: false, message: 'Page not found.', paths: [] }
  const draftAll: SiteContentMap = site.draftContent ?? {}

  const loc = sharedItemLocator(oldHtml, index)
  if (loc) {
    const nextSource: PageHtmlMap = { ...sourceHtml }
    const nextDraft: SiteContentMap = { ...draftAll }
    const snaps: { path: string; prevSourceHtml: string; prevDraft: ContentMap }[] = []
    for (const p of Object.keys(sourceHtml)) {
      const ph = sourceHtml[p]
      const nh = replaceItemInComponent(ph, loc, safe.html)
      if (nh && nh !== ph) {
        snaps.push({ path: p, prevSourceHtml: ph, prevDraft: draftAll[p] ?? {} })
        nextSource[p] = nh
        nextDraft[p] = remapDraft(ph, draftAll[p] ?? {}, nh).draft
      }
    }
    if (!snaps.length) return { ok: false, message: 'That change is not allowed.', paths: [] }
    const stack = Array.isArray(site.undoStack) ? site.undoStack.slice(-49) : []
    stack.push({ kind: 'structure', pages: snaps })
    await updateConnectedSite(tenantId, siteId, { sourceHtml: nextSource, draftContent: nextDraft, undoStack: stack })
    return { ok: true, paths: snaps.map((s) => s.path) }
  }

  const newHtml = replaceItemHtml(oldHtml, index, safe.html)
  if (newHtml == null) return { ok: false, message: 'That change is not allowed.', paths: [] }
  const oldDraft: ContentMap = draftAll[pathname] ?? {}
  const { draft: newDraft } = remapDraft(oldHtml, oldDraft, newHtml)
  const stack = Array.isArray(site.undoStack) ? site.undoStack.slice(-49) : []
  stack.push({ kind: 'structure', pages: [{ path: pathname, prevSourceHtml: oldHtml, prevDraft: oldDraft }] })
  await updateConnectedSite(tenantId, siteId, {
    sourceHtml: { ...sourceHtml, [pathname]: newHtml },
    draftContent: { ...draftAll, [pathname]: newDraft },
    undoStack: stack,
  })
  return { ok: true, paths: [pathname] }
}

/**
 * Insert an AI-generated section into a page at `index`. The HTML is RE-SANITISED here
 * (never trust the client's submitted markup) before it is inserted via the structural
 * op — so a hostile payload can't reach the page even if the route is called directly.
 */
export async function insertGeneratedSection(
  tenantId: number,
  siteId: number,
  pathname: string,
  index: number,
  html: string,
): Promise<{ ok: boolean; message?: string; paths: string[] }> {
  const safe = parseGeneratedSection({ html })
  if (!safe.ok) return { ok: false, message: `That section couldn’t be added safely (${safe.error}).`, paths: [] }
  return applyStructureToPage(tenantId, siteId, pathname, { op: 'insert', index, html: safe.html })
}

/** Replace the section at `index` with AI-edited HTML (re-sanitised). Used by section "Edit with AI". */
export async function replaceGeneratedSection(
  tenantId: number,
  siteId: number,
  pathname: string,
  index: number,
  html: string,
): Promise<{ ok: boolean; message?: string; paths: string[] }> {
  const safe = parseGeneratedSection({ html })
  if (!safe.ok) return { ok: false, message: `That change couldn’t be applied safely (${safe.error}).`, paths: [] }
  return applyStructureToPage(tenantId, siteId, pathname, { op: 'replace', index, html: safe.html })
}

/** Replace a page's whole <main> with AI-edited content (re-sanitised). Used by page "Edit with AI". */
export async function replacePageMain(
  tenantId: number,
  siteId: number,
  pathname: string,
  mainHtml: string,
): Promise<{ ok: boolean; message?: string; paths: string[] }> {
  const safe = parseGeneratedSection({ html: mainHtml })
  if (!safe.ok) return { ok: false, message: `That page couldn’t be built safely (${safe.error}).`, paths: [] }
  const site = (await getConnectedSite(tenantId, siteId)) as any
  if (!site) throw new Error('Site not found')
  const sourceHtml: PageHtmlMap = { ...(site.sourceHtml ?? {}) }
  const oldHtml = sourceHtml[pathname]
  if (typeof oldHtml !== 'string') return { ok: false, message: 'Page not found.', paths: [] }

  const newHtml = setMainContent(oldHtml, stripPageChrome(safe.html))
  const draftAll: SiteContentMap = { ...(site.draftContent ?? {}) }
  const oldDraft: ContentMap = draftAll[pathname] ?? {}
  const { draft: newDraft } = remapDraft(oldHtml, oldDraft, newHtml)

  const stack = Array.isArray(site.undoStack) ? site.undoStack.slice(-49) : []
  stack.push({ kind: 'structure', path: pathname, prevSourceHtml: oldHtml, prevDraft: oldDraft })
  sourceHtml[pathname] = newHtml
  draftAll[pathname] = newDraft
  await updateConnectedSite(tenantId, siteId, { sourceHtml, draftContent: draftAll, undoStack: stack })
  return { ok: true, paths: [pathname] }
}

/** Current page routes for a site (the stored list, else the source-HTML keys). */
function sitePagePaths(site: any): string[] {
  return Array.isArray(site.pagePaths) && site.pagePaths.length ? [...site.pagePaths] : Object.keys(site.sourceHtml ?? {})
}

/**
 * Add a new page to a connected site by cloning an existing page (keeps the site's
 * header/nav/footer + styling), inserting a best-effort nav link across pages, and
 * remapping each touched page's draft so prior edits survive. Returns the new route.
 */
export async function addConnectedPage(
  tenantId: number,
  siteId: number,
  opts: { fromPath?: string; title: string; mainHtml?: string },
): Promise<{ ok: boolean; message?: string; path?: string; pagePaths?: string[] }> {
  const site = (await getConnectedSite(tenantId, siteId)) as any
  if (!site) throw new Error('Site not found')
  const sourceHtml: PageHtmlMap = { ...(site.sourceHtml ?? {}) }
  const draft: SiteContentMap = { ...(site.draftContent ?? {}) }
  const published: SiteContentMap = { ...(site.publishedContent ?? {}) }
  const pagePaths = sitePagePaths(site)

  const title = (opts.title || 'New Page').trim().slice(0, 60) || 'New Page'
  const fromPath = opts.fromPath && sourceHtml[opts.fromPath] ? opts.fromPath : sourceHtml['/'] ? '/' : Object.keys(sourceHtml)[0]
  if (!fromPath || !sourceHtml[fromPath]) return { ok: false, message: 'No page to clone from.' }
  const newPath = uniqueRoute(routeFromTitle(title), pagePaths)

  // The new page is NOT auto-linked into the nav — the customer adds a nav link explicitly
  // (choosing the page) via addSiteNavLink. The page is reachable by its tab meanwhile.
  // The new page = the chosen page with its <main> reset to a starter, OR seeded with
  // AI-generated, RE-SANITISED main content.
  // Clone from the source page with its CURRENT edits applied (renamed nav labels, swapped
  // images, edited text) — not the raw stored HTML, which still holds the pre-edit values.
  const fromHtml = applyContent(sourceHtml[fromPath], draft[fromPath] ?? {})
  let cloneHtml: string
  if (opts.mainHtml) {
    const safe = parseGeneratedSection({ html: opts.mainHtml })
    // Strip any generated header/nav/footer — the cloned page already has the site chrome.
    cloneHtml = safe.ok ? setMainContent(fromHtml, stripPageChrome(safe.html)) : clonePageForNewRoute(fromHtml, title)
  } else {
    cloneHtml = clonePageForNewRoute(fromHtml, title)
  }
  // (The cloned page's nav highlight is corrected per page at render by normalizeNavActive — we
  // don't touch the stored markup.)
  sourceHtml[newPath] = cloneHtml
  const newContent = extractContent(cloneHtml)
  draft[newPath] = newContent
  published[newPath] = newContent
  pagePaths.push(newPath)

  await updateConnectedSite(tenantId, siteId, { sourceHtml, draftContent: draft, publishedContent: published, pagePaths })
  return { ok: true, path: newPath, pagePaths }
}

/** Remove a page from a connected site (home is protected; a site keeps ≥1 page). Strips
 *  its nav links across remaining pages and remaps their drafts. */
export async function removeConnectedPage(
  tenantId: number,
  siteId: number,
  pathname: string,
): Promise<{ ok: boolean; message?: string; pagePaths?: string[] }> {
  const site = (await getConnectedSite(tenantId, siteId)) as any
  if (!site) throw new Error('Site not found')
  const sourceHtml: PageHtmlMap = { ...(site.sourceHtml ?? {}) }
  const pagePaths = sitePagePaths(site)
  if (pathname === '/') return { ok: false, message: 'The home page can’t be removed.' }
  if (!sourceHtml[pathname]) return { ok: false, message: 'Page not found.' }
  if (pagePaths.length <= 1) return { ok: false, message: 'A site needs at least one page.' }

  const draft: SiteContentMap = { ...(site.draftContent ?? {}) }
  const published: SiteContentMap = { ...(site.publishedContent ?? {}) }
  const previous: SiteContentMap = { ...(site.previousContent ?? {}) }
  for (const p of Object.keys(sourceHtml)) {
    if (p === pathname) continue
    const oldHtml = sourceHtml[p]
    const newHtml = removeNavLinks(oldHtml, pathname)
    if (newHtml !== oldHtml) {
      sourceHtml[p] = newHtml
      draft[p] = remapDraft(oldHtml, draft[p] ?? {}, newHtml).draft
    }
  }
  delete sourceHtml[pathname]
  delete draft[pathname]
  delete published[pathname]
  delete previous[pathname]
  const nextPaths = pagePaths.filter((p) => p !== pathname)

  await updateConnectedSite(tenantId, siteId, {
    sourceHtml,
    draftContent: draft,
    publishedContent: published,
    previousContent: previous,
    pagePaths: nextPaths,
  })
  return { ok: true, pagePaths: nextPaths }
}

/** Reorder the site's page list (must be a permutation of the current routes). Changes
 *  the workspace tab order; the site's own live nav order is left as-is. */
export async function reorderConnectedPages(
  tenantId: number,
  siteId: number,
  ordered: string[],
): Promise<{ ok: boolean; message?: string; pagePaths?: string[] }> {
  const site = (await getConnectedSite(tenantId, siteId)) as any
  if (!site) throw new Error('Site not found')
  const current = sitePagePaths(site)
  const a = [...current].sort()
  const b = [...ordered].sort()
  if (a.length !== b.length || a.some((x, i) => x !== b[i])) return { ok: false, message: 'Invalid page order.' }
  await updateConnectedSite(tenantId, siteId, { pagePaths: ordered })
  return { ok: true, pagePaths: ordered }
}

/**
 * Explicitly add a navigation menu link to `targetPath` (with `label`) across every page
 * of the site — the user-driven "Add nav link → choose page" action. Deduped (never adds a
 * second link to the same page) and draft-remapped so existing edits survive.
 */
export async function addSiteNavLink(
  tenantId: number,
  siteId: number,
  targetPath: string,
  label?: string,
): Promise<{ ok: boolean; message?: string; paths?: string[] }> {
  const site = (await getConnectedSite(tenantId, siteId)) as any
  if (!site) throw new Error('Site not found')
  const sourceHtml: PageHtmlMap = { ...(site.sourceHtml ?? {}) }
  if (targetPath !== '/' && !sourceHtml[targetPath]) return { ok: false, message: 'That page does not exist.' }
  const pagePaths = sitePagePaths(site)
  const draft: SiteContentMap = { ...(site.draftContent ?? {}) }
  const lbl =
    (label || '').trim().slice(0, 40) ||
    (targetPath === '/' ? 'Home' : (targetPath.replace(/^\//, '').split('/').pop() || 'Page').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))

  let changed = false
  for (const p of Object.keys(sourceHtml)) {
    const oldHtml = sourceHtml[p]
    const newHtml = addNavLink(oldHtml, targetPath, lbl, pagePaths)
    if (newHtml !== oldHtml) {
      sourceHtml[p] = newHtml
      draft[p] = remapDraft(oldHtml, draft[p] ?? {}, newHtml).draft
      changed = true
    }
  }
  if (!changed) {
    const hasNav = Object.values(sourceHtml).some((h) => /<nav[\s>]/i.test(h) || /<header[\s>]/i.test(h))
    return hasNav
      ? { ok: true, message: 'That page is already in the menu.', paths: [] }
      : { ok: false, message: 'No navigation menu was found on this site to add the link to.' }
  }
  await updateConnectedSite(tenantId, siteId, { sourceHtml, draftContent: draft })
  return { ok: true, paths: Object.keys(sourceHtml) }
}

/** Undo the most recent draft edit (restore the previous value(s) — incl. shared + structural edits). */
export async function undoConnectedEdit(tenantId: number, siteId: number) {
  const site = (await getConnectedSite(tenantId, siteId)) as any
  if (!site) throw new Error('Site not found')
  const stack = Array.isArray(site.undoStack) ? [...site.undoStack] : []
  const last = stack.pop()
  if (!last) return { undone: false, canUndo: false, paths: [] as string[] }

  // Structural ops snapshot the pre-op source + draft of one OR MORE pages (shared-component
  // edits touch every page); restore them all. Tolerates the older single-page entry shape.
  if (last.kind === 'structure') {
    const entries: { path: string; prevSourceHtml: string; prevDraft: any }[] = Array.isArray(last.pages)
      ? last.pages
      : [{ path: last.path, prevSourceHtml: last.prevSourceHtml, prevDraft: last.prevDraft }]
    const sourceHtml: PageHtmlMap = { ...(site.sourceHtml ?? {}) }
    const draftAll: SiteContentMap = { ...(site.draftContent ?? {}) }
    for (const e of entries) {
      sourceHtml[e.path] = e.prevSourceHtml
      draftAll[e.path] = e.prevDraft
    }
    await updateConnectedSite(tenantId, siteId, { sourceHtml, draftContent: draftAll, undoStack: stack })
    return { undone: true, canUndo: stack.length > 0, paths: entries.map((e) => e.path) }
  }

  const draft: SiteContentMap = site.draftContent ?? {}
  const next: SiteContentMap = { ...draft }
  // New entries are { changes:[…] }; tolerate any older single-change entries too.
  const changes: { path: string; id: string; prev: any }[] = Array.isArray(last.changes) ? last.changes : [last]
  for (const ch of changes) {
    const page = { ...(next[ch.path] ?? {}) }
    if (ch.prev) page[ch.id] = ch.prev
    else delete page[ch.id]
    next[ch.path] = page
  }
  await updateConnectedSite(tenantId, siteId, { draftContent: next, undoStack: stack })
  return { undone: true, canUndo: stack.length > 0, paths: Array.from(new Set(changes.map((c) => c.path))) }
}
