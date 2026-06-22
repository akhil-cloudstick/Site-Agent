import { rm } from 'node:fs/promises'
import path from 'node:path'

import { resolveServicePrincipal } from '../broker/adapter'
import { getBrokerClient } from '../broker/payload-client'
import type { ContentMap } from './content'
import { extractContent } from './html'
import { ingestBuiltSite } from './ingest-folder'

/** Where SiteAgent keeps its managed copy of each connected site's built folder. */
const SITES_DIR = path.join(process.cwd(), '.connected-sites')

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
 * Connect a WHOLE built site from a folder on this machine (a `dist` folder, or a
 * repo we build). Copies the built site into managed storage (keeping all pages +
 * CSS/JS/images), reads every page's editable content into Payload, and records
 * where the folder lives so we can preview + redeploy the whole site.
 */
export async function connectFromFolder(
  tenantId: number,
  data: { name: string; originUrl: string; repo?: string; cloudflareProject?: string; sourcePath: string },
) {
  const payload = await getBrokerClient()
  const principal = await resolveServicePrincipal(payload, tenantId)

  // Create the record first so the managed folder can be keyed by its id.
  const created = await payload.create({
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

  try {
    const destDir = path.join(SITES_DIR, String(created.id), 'source')
    const { sourcePath, pages, pagePaths } = await ingestBuiltSite(data.sourcePath, destDir)
    const content: SiteContentMap = {}
    for (const [pathname, html] of Object.entries(pages)) content[pathname] = extractContent(html)
    return await payload.update({
      collection: 'connectedSites',
      id: created.id,
      data: { sourceHtml: pages, sourcePath, pagePaths, draftContent: content, publishedContent: content } as any,
      user: principal,
      overrideAccess: false,
    })
  } catch (err) {
    // A failed connect shouldn't leave a junk site behind — remove the half-created record.
    await payload.delete({ collection: 'connectedSites', id: created.id, user: principal, overrideAccess: false }).catch(() => {})
    throw err
  }
}

/** Remove a connected site AND its managed files (the pulled repo / built site copy and
 *  any publish temp), so removing a site doesn't leave folders behind on disk. */
export async function deleteConnectedSite(tenantId: number, siteId: number) {
  const payload = await getBrokerClient()
  const principal = await resolveServicePrincipal(payload, tenantId)
  const res = await payload.delete({ collection: 'connectedSites', id: siteId, user: principal, overrideAccess: false })
  // Tidy up the on-disk folders for this site (the cloned repo + built copy, + publish temp).
  await rm(path.join(SITES_DIR, String(siteId)), { recursive: true, force: true }).catch(() => {})
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

/** Set one draft content value (text or image) for a page. Returns the updated site. */
export async function setDraftValue(
  tenantId: number,
  siteId: number,
  pathname: string,
  id: string,
  kind: 'text' | 'image',
  value: string,
) {
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
  return next
}

/** Undo the most recent draft edit (restore the previous value(s) — incl. shared edits). */
export async function undoConnectedEdit(tenantId: number, siteId: number) {
  const site = (await getConnectedSite(tenantId, siteId)) as any
  if (!site) throw new Error('Site not found')
  const stack = Array.isArray(site.undoStack) ? [...site.undoStack] : []
  const last = stack.pop()
  if (!last) return { undone: false, canUndo: false }
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
  return { undone: true, canUndo: stack.length > 0 }
}
