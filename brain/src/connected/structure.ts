import { HTMLElement, parse } from 'node-html-parser'

import type { ContentMap } from './content'
import { extractContent } from './html'
import { itemEls } from './items'

/**
 * Structural editing for connected sites — operating on the page's top-level
 * "bands" (the big full-width sections you scroll past). A section is a direct
 * ELEMENT child of `<main>` (fallback `<body>`); move/delete/insert act on those
 * whole bands. Everything here is pure string→string so the same op is replayable
 * at preview and publish (publish already re-serialises via `applyContent`).
 *
 * Sibling concern — keeping prior CONTENT edits alive across a structural change:
 * connected content ids are positional (`auto:<n>`), so inserting/moving/removing a
 * section shifts them. `remapDraft` re-anchors the customer's edits by matching each
 * element's ORIGINAL text (which a move/delete never changes) — unique match or no
 * remap, never a guess (a wrong remap silently corrupts an edit).
 */

const collapse = (s: string) => s.trim().replace(/\s+/g, ' ')

/**
 * Children that are NOT visual bands and must never count as a "section" — so the
 * server's section indices line up with the client's (which applies the same rule,
 * plus it ignores injected editor UI marked `data-sa-ui`).
 */
const NON_SECTION_TAGS = new Set(['script', 'style', 'link', 'noscript', 'template', 'base', 'meta', 'title', 'head'])

const tagOf = (el: HTMLElement) => (el.rawTagName || '').toLowerCase()

/**
 * The page's visible top-level "bands", in document order. When the page wraps its content
 * in <main>, we FLATTEN: body-level chrome (header/nav/footer/aside siblings of <main>) are
 * included ALONGSIDE <main>'s own children — so the nav and footer are editable sections
 * too, not just the content bands. (When there's no <main>, every body child is a band.)
 */
function sectionEls(root: HTMLElement): HTMLElement[] {
  const body = (root.querySelector('body') as HTMLElement) ?? root
  const kids = body.children
  const main = kids.find((c) => tagOf(c) === 'main')
  const out: HTMLElement[] = []
  for (const child of kids) {
    if (NON_SECTION_TAGS.has(tagOf(child))) continue
    if (child === main) {
      for (const gc of child.children) if (!NON_SECTION_TAGS.has(tagOf(gc))) out.push(gc)
    } else {
      out.push(child)
    }
  }
  return out
}

function firstHeadingText(el: HTMLElement): string {
  const h = el.querySelector('h1,h2,h3,h4,h5,h6')
  return h ? collapse(h.text).slice(0, 80) : ''
}

/** A stable-ish signature of a section: tag + sorted classes + its first heading. */
function sectionFingerprint(el: HTMLElement): string {
  const tag = (el.rawTagName || '').toLowerCase()
  const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).sort().join('.')
  return `${tag}|${cls}|${firstHeadingText(el).toLowerCase()}`
}

export interface SectionInfo {
  index: number
  label: string // human label for the editor (first heading, else "<tag> section N")
  tag: string
  fingerprint: string
}

/** List the page's top-level sections, in document order (indices match applySectionOp). */
export function detectSections(html: string): SectionInfo[] {
  const root = parse(html, { comment: true })
  return sectionEls(root).map((el, index) => {
    const tag = tagOf(el) || 'div'
    const heading = firstHeadingText(el)
    const label = heading || (tag === 'header' || tag === 'nav' ? 'Header / nav' : tag === 'footer' ? 'Footer' : `${tag} section ${index + 1}`)
    return { index, tag, label, fingerprint: sectionFingerprint(el) }
  })
}

// ── Page helpers (Track F: add / remove / reorder pages) ────────────────────────

const escapeHtml = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string)
const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

/** Turn a page title into a URL route like "/about-us" (lowercase, dashed, capped). */
export function routeFromTitle(title: string): string {
  const slug = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'page'
  return '/' + slug
}

/** Pick a route not already in `taken` (append -2, -3, … on collision). */
export function uniqueRoute(base: string, taken: string[]): string {
  const set = new Set(taken)
  if (base !== '/' && !set.has(base)) return base
  let n = 2
  while (set.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

/** Normalize an href to an internal page route (or null if it isn't one). */
function routeOfHref(href: string | undefined): string | null {
  if (!href) return null
  let h = href.trim()
  if (/^(mailto:|tel:|javascript:|#)/i.test(h)) return null
  try {
    if (/^https?:\/\//i.test(h)) h = new URL(h).pathname
  } catch {
    /* keep as-is */
  }
  h = h.split('#')[0].split('?')[0]
  if (h.startsWith('//')) return null // protocol-relative external
  if (!h.startsWith('/')) h = '/' + h
  h = h.replace(/\/index\.html?$/i, '/').replace(/\.html?$/i, '')
  if (h.length > 1) h = h.replace(/\/+$/, '')
  return h || '/'
}

/**
 * Clone a page's HTML to seed a NEW page: keep the site's chrome (header/nav/footer)
 * and, when there is a <main>, replace its content with a minimal editable starter.
 * If there's no <main>, the clone is left whole (the customer can delete/replace
 * sections) — safer than guessing where the content region is.
 */
export function clonePageForNewRoute(html: string, title: string): string {
  const root = parse(html, { comment: true })
  const main = root.querySelector('main')
  if (main) {
    main.set_content(
      `<section><h1>${escapeHtml(title)}</h1><p>New page — use the chat or “+ Add section” to build it.</p></section>`,
    )
  }
  return root.toString()
}

/** Replace a page's <main> content with the given (already-sanitised) HTML. If there's
 *  no <main>, the content is appended inside a new <main> at the end of <body>. */
export function setMainContent(html: string, mainHtml: string): string {
  const root = parse(html, { comment: true })
  const main = root.querySelector('main')
  if (main) {
    main.set_content(mainHtml)
  } else {
    const body = (root.querySelector('body') as HTMLElement) ?? root
    body.insertAdjacentHTML('beforeend', `<main>${mainHtml}</main>`)
  }
  return root.toString()
}

/** Remove top-level chrome (header/nav/footer) from generated PAGE content — the page being
 *  cloned already has those, so a generated page must contribute ONLY its inner sections. */
export function stripPageChrome(html: string): string {
  const root = parse(html, { comment: true })
  for (const el of root.querySelectorAll('header, nav, footer')) el.parentNode?.removeChild(el)
  return root.toString()
}

/**
 * Find the best anchor to clone for a new nav link. Prefer an anchor inside the page's
 * <nav> (the real menu — NOT a separate "Contact Us" CTA that often sits after it), then
 * <header>, then any internal link. Prefer internal links, else the last one in scope, so
 * the new link lands among the menu items (after e.g. Contact).
 */
// A brand LOGO link (often href="/" too) is not a menu item — it wraps an image/icon.
const isNavLogo = (a: HTMLElement) => a.querySelector('img, svg, picture') != null

/** The "list container" a menu anchor belongs to: the <ul>/<ol> for <li> items, else its parent. */
function navContainerOf(a: HTMLElement): HTMLElement | null {
  const p = a.parentNode as HTMLElement | null
  if (p && tagOf(p) === 'li' && p.parentNode) return p.parentNode as HTMLElement
  return p
}

/** True if `el` has an ancestor element whose tag is in `tags`. */
function hasAncestorTag(el: HTMLElement, tags: string[]): boolean {
  let p = el.parentNode as HTMLElement | null
  while (p) {
    if (tags.includes(tagOf(p))) return true
    p = p.parentNode as HTMLElement | null
  }
  return false
}

/**
 * The MENU links within one container, found by class-SHAPE majority — NOT by keyword guessing.
 * A menu list's items share a common class signature (e.g. `rounded-md px-3 py-2.5 text-sm
 * font-medium transition-colors`); the odd ones out — the logo (image/svg) and a CTA button (a
 * different padding / weight / solid background) — share fewer of those tokens and drop out. This
 * is robust across ANY site (the earlier keyword regex wrongly flagged every `rounded-md` link as
 * a CTA, so nothing matched). Returns [] if the container isn't a real menu list (<2 menu links).
 */
function menuLinksInContainer(links: HTMLElement[]): HTMLElement[] {
  const real = links.filter((a) => !isNavLogo(a))
  if (real.length < 2) return []
  const freq = new Map<string, number>()
  const sets = real.map((a) => {
    const s = new Set((a.getAttribute('class') || '').split(/\s+/).filter(Boolean))
    for (const t of s) freq.set(t, (freq.get(t) || 0) + 1)
    return s
  })
  // The shared "menu signature" = tokens common to MORE than half the links.
  const sig = new Set([...freq].filter(([, n]) => n > real.length / 2).map(([t]) => t))
  if (sig.size < 2) return real // no clear shared shape → treat them all as menu links
  const need = Math.ceil(sig.size * 0.7)
  const menu = real.filter((_, i) => [...sets[i]].filter((t) => sig.has(t)).length >= need)
  return menu.length >= 2 ? menu : real
}

/**
 * A responsive site renders its nav links TWICE — a desktop bar AND a separate mobile/hamburger
 * drawer — each in its OWN list container. To add a link consistently we must touch EVERY menu
 * list, not just one (the old bug: a new page showed in the desktop bar but not the mobile menu).
 * Returns one `{container, template}` per distinct menu list in <nav>/<header> (skipping the
 * footer); `template` is the last real menu link, whose styling a new item is cloned from.
 */
function navMenuGroups(root: HTMLElement): { container: HTMLElement; template: HTMLElement }[] {
  const anchors = (root.querySelectorAll('nav a, header a') as HTMLElement[]).filter((a) => !hasAncestorTag(a, ['footer']))
  const order: HTMLElement[] = []
  const groups = new Map<HTMLElement, HTMLElement[]>()
  for (const a of anchors) {
    const c = navContainerOf(a)
    if (!c) continue
    if (!groups.has(c)) {
      groups.set(c, [])
      order.push(c)
    }
    groups.get(c)!.push(a)
  }
  const result: { container: HTMLElement; template: HTMLElement }[] = []
  for (const c of order) {
    const menu = menuLinksInContainer(groups.get(c)!)
    if (menu.length < 2) continue
    result.push({ container: c, template: menu[menu.length - 1] })
  }
  return result
}

/** Insert a new menu link styled like `tmpl`, right after it (cloning a wrapping <li> if present). */
function addNavCloneAfter(tmpl: HTMLElement, href: string, label: string): void {
  const cls = tmpl.getAttribute('class')
  const anchor = `<a href="${escapeAttr(href)}"${cls ? ` class="${escapeAttr(cls)}"` : ''}>${escapeHtml(label)}</a>`
  const parent = tmpl.parentNode as HTMLElement | null
  if (parent && tagOf(parent) === 'li') {
    const liCls = parent.getAttribute('class')
    parent.insertAdjacentHTML('afterend', `<li${liCls ? ` class="${escapeAttr(liCls)}"` : ''}>${anchor}</li>`)
  } else {
    tmpl.insertAdjacentHTML('afterend', anchor)
  }
}

export interface NavStyles {
  active: string
  inactive: string
}

const navMenuShare = (toks: string[], ref: Set<string>) =>
  toks.length > 0 && toks.filter((t) => ref.has(t)).length >= Math.max(2, Math.ceil(ref.size * 0.5))

/**
 * Learn a site's nav highlight styling ONCE, from any page that still has the standard
 * `aria-current="page"`: the active link's exact class string + an inactive menu sibling's exact
 * class string. Returns null if no page exposes the anchor. (Pages created/cloned by the editor
 * can lose their `aria-current`, so we read it from a page that kept it and reuse it everywhere.)
 */
export function detectNavStyles(pages: string[]): NavStyles | null {
  for (const html of pages) {
    if (typeof html !== 'string' || !/aria-current/i.test(html)) continue
    const links = parse(html, { comment: true }).querySelectorAll('nav a, header a') as HTMLElement[]
    const active = links.find((a) => a.getAttribute('aria-current'))
    if (!active) continue
    const activeCls = active.getAttribute('class') || ''
    const ref = new Set(activeCls.split(/\s+/).filter(Boolean))
    let inactive = ''
    for (const a of links)
      if (a !== active && !a.getAttribute('aria-current') && navMenuShare((a.getAttribute('class') || '').split(/\s+/).filter(Boolean), ref)) {
        inactive = a.getAttribute('class') || ''
        break
      }
    if (activeCls && inactive) return { active: activeCls, inactive }
  }
  return null
}

/**
 * GLOBAL, render-time nav-highlight normaliser — used by the preview + publish on ANY connected
 * site, NEVER stored. It makes the nav highlight only the current page, WITHOUT knowing the
 * site's class names:
 *  - `styles` (from `detectNavStyles`) carries the site's OWN active vs inactive menu-link class
 *    strings. If omitted, they're read from THIS page's `aria-current` anchor; if neither is
 *    available we leave the nav exactly as the site built it (no guessing).
 *  - Re-apply those whole class strings: the current-route link gets the active string +
 *    `aria-current`; the other MENU links get the inactive string. Copying whole strings means
 *    the site's styling/shape is preserved exactly — we never invent or move individual classes.
 *  - "Menu links" are detected by class-shape overlap with the active style, so the LOGO and a
 *    CTA button (which live in the nav but look nothing like a menu item) are left untouched.
 */
export function normalizeNavActive(html: string, currentRoute: string, styles?: NavStyles | null): string {
  const root = parse(html, { comment: true })
  const links = root.querySelectorAll('nav a, header a') as HTMLElement[]
  if (!links.length) return html
  let activeCls = styles?.active ?? ''
  let inactiveCls = styles?.inactive ?? ''
  if (!activeCls) {
    const active = links.find((a) => a.getAttribute('aria-current'))
    if (!active) return html // no styles passed AND no anchor on this page → don't touch it
    activeCls = active.getAttribute('class') || ''
    const ref = new Set(activeCls.split(/\s+/).filter(Boolean))
    for (const a of links)
      if (a !== active && !a.getAttribute('aria-current') && navMenuShare((a.getAttribute('class') || '').split(/\s+/).filter(Boolean), ref)) {
        inactiveCls = a.getAttribute('class') || ''
        break
      }
  }
  const ref = new Set(activeCls.split(/\s+/).filter(Boolean))
  for (const a of links) {
    if (!navMenuShare((a.getAttribute('class') || '').split(/\s+/).filter(Boolean), ref)) continue // logo / CTA → leave alone
    if (routeOfHref(a.getAttribute('href')) === currentRoute) {
      if (activeCls) a.setAttribute('class', activeCls)
      a.setAttribute('aria-current', 'page')
    } else {
      if (inactiveCls) a.setAttribute('class', inactiveCls)
      a.removeAttribute('aria-current')
    }
  }
  return root.toString()
}

/**
 * Best-effort: add a nav link for `newPath` to a page, by cloning an existing menu anchor
 * (so it inherits the nav's styling) and retargeting it. If the menu uses <li> wrappers,
 * a whole <li> is cloned so the new item renders correctly. Returns the HTML unchanged if
 * no nav anchor is found (the page is still reachable by its tab/URL).
 */
export function addNavLink(html: string, newPath: string, label: string, _knownRoutes: string[] = []): string {
  const root = parse(html, { comment: true })
  // SELF-HEAL: remove any existing nav/header link to this path first (clears prior broken
  // or wrongly-placed adds), then add exactly one proper menu item.
  for (const a of root.querySelectorAll('nav a, header a') as HTMLElement[]) {
    if (routeOfHref(a.getAttribute('href')) !== newPath) continue
    const parent = a.parentNode as HTMLElement | null
    if (parent && tagOf(parent) === 'li' && (parent.querySelectorAll('a') as HTMLElement[]).length === 1 && parent.parentNode) {
      ;(parent.parentNode as HTMLElement).removeChild(parent) // drop the whole <li> if it only held this link
    } else parent?.removeChild(a)
  }
  // Add one proper menu item to EVERY menu list (desktop bar + mobile/hamburger drawer), each
  // cloning that list's OWN link styling. The current-page highlight is decided at render by
  // normalizeNavActive (per page), so we don't special-case the active class here.
  const groups = navMenuGroups(root)
  if (!groups.length) return html
  for (const g of groups) addNavCloneAfter(g.template, newPath, label)
  return root.toString()
}

// ── Deterministic button/link editing (no AI): set a redirect, remove, add a button ──

/** Every link/button in the page body, in document order (matches the client's indexing). */
export function linkEls(root: HTMLElement): HTMLElement[] {
  const body = (root.querySelector('body') as HTMLElement) ?? root
  return body.querySelectorAll('a, button') as HTMLElement[]
}

/** Page images in document order — the index a "link this image" op targets (images aren't
 *  in `linkEls`). Mirrors the server-stamped `data-sa-img` index the client reads. */
export function imgEls(root: HTMLElement): HTMLElement[] {
  const body = (root.querySelector('body') as HTMLElement) ?? root
  return body.querySelectorAll('img') as HTMLElement[]
}

/** Keep a redirect target safe: relative/route/anchor, or http(s)/mailto/tel; else "#". */
function safeHref(href: string): string {
  const v = (href || '').trim()
  if (!v) return '#'
  if (/^(javascript:|vbscript:|data:)/i.test(v)) return '#'
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return /^(https?:|mailto:|tel:)/i.test(v) ? v : '#'
  return v // relative path / route / #anchor
}

export type ElementOp =
  | { op: 'set-link'; index: number; href: string }
  | { op: 'remove'; index: number }
  | { op: 'add-button'; sectionIndex: number; text: string; href: string }
  | { op: 'add-after'; index: number; text: string; href: string }
  | { op: 'link-image'; imgIndex: number; href: string }

/** Apply one deterministic button/link op to a page's HTML; null if invalid. */
export function applyElementOp(html: string, op: ElementOp): string | null {
  const root = parse(html, { comment: true })
  if (op.op === 'link-image') {
    // Wrap a bare <img> in an <a> so a standalone image/logo becomes a link.
    const img = imgEls(root)[op.imgIndex]
    if (!img) return null
    if (tagOf(img.parentNode as HTMLElement) === 'a') {
      ;(img.parentNode as HTMLElement).setAttribute('href', safeHref(op.href)) // already linked → just retarget
    } else {
      img.insertAdjacentHTML('beforebegin', `<a href="${escapeAttr(safeHref(op.href))}" style="display:inline-block;text-decoration:none">${img.outerHTML}</a>`)
      img.parentNode?.removeChild(img)
    }
    return root.toString()
  }
  if (op.op === 'add-button') {
    const sec = sectionEls(root)[op.sectionIndex]
    if (!sec) return null
    const href = safeHref(op.href)
    const text = escapeHtml((op.text || 'Button').slice(0, 80))
    // Match the section's look by cloning an existing button/link's class/style, else a default.
    const existing = sec.querySelector('a, button') as HTMLElement | null
    const cls = existing?.getAttribute('class')
    const style = existing?.getAttribute('style')
    const attrs = cls
      ? ` class="${escapeAttr(cls)}"`
      : style
        ? ` style="${escapeAttr(style)}"`
        : ' style="display:inline-block;padding:12px 22px;border-radius:8px;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;margin:10px 10px 0 0"'
    sec.insertAdjacentHTML('beforeend', `<a href="${escapeAttr(href)}"${attrs}>${text}</a>`)
    return root.toString()
  }
  const el = linkEls(root)[op.index]
  if (!el) return null
  if (syncNavMenus(root, el, op)) return root.toString() // nav menu add/remove → keep all menu lists in sync
  return applyToElement(el, op) ? root.toString() : null
}

/**
 * If `el` is a nav MENU link, keep EVERY menu list (desktop bar + mobile/hamburger drawer) in sync
 * for an add-after or remove, and return true (handled). Returns false for non-nav links or other
 * ops, so the caller falls back to the plain single-element op. Used by BOTH the page path
 * (applyElementOp) AND the shared-component path (applyElementOpInComponent) — nav links go through
 * the latter, so the sync MUST live here, not just inline above.
 */
function syncNavMenus(root: HTMLElement, el: HTMLElement, op: ElementOp): boolean {
  if (op.op !== 'add-after' && op.op !== 'remove') return false
  if (!hasAncestorTag(el, ['nav', 'header']) || isNavLogo(el)) return false
  const clicked = navContainerOf(el)
  const groups = navMenuGroups(root)
  if (!groups.some((g) => g.container === clicked)) return false // el isn't part of a detected menu list

  if (op.op === 'remove') {
    const href = el.getAttribute('href') || ''
    removeNavAnchor(el)
    // remove the same-href counterpart from every OTHER menu list too (desktop ⇄ mobile)
    if (href)
      for (const g of navMenuGroups(root))
        for (const a of g.container.querySelectorAll('a') as HTMLElement[])
          if (!isNavLogo(a) && (a.getAttribute('href') || '') === href) removeNavAnchor(a)
    return true
  }
  // add-after: insert after the clicked item (unless that list already links there — avoids a
  // duplicate / heals a one-menu add), then fill every OTHER menu list, each in its own styling.
  const href = safeHref(op.href)
  const label = (op.text || 'Link').slice(0, 80)
  if (!containerLinksTo(clicked, href)) applyToElement(el, op)
  for (const g of groups) {
    if (g.container === clicked || containerLinksTo(g.container, href)) continue
    addNavCloneAfter(g.template, href, label)
  }
  return true
}

/** Remove a nav anchor (and its wrapping <li> if that's all it held). */
function removeNavAnchor(a: HTMLElement): void {
  const parent = a.parentNode as HTMLElement | null
  if (parent && tagOf(parent) === 'li' && (parent.querySelectorAll('a') as HTMLElement[]).length === 1 && parent.parentNode) {
    ;(parent.parentNode as HTMLElement).removeChild(parent)
  } else parent?.removeChild(a)
}

/** True if a menu container already has an anchor pointing at `href`. */
function containerLinksTo(c: HTMLElement | null, href: string): boolean {
  return !!c && (c.querySelectorAll('a') as HTMLElement[]).some((a) => (a.getAttribute('href') || '') === href)
}

/** Apply a single element op (set-link / remove / add-after) to a specific element node. */
function applyToElement(el: HTMLElement, op: ElementOp): boolean {
  if (op.op === 'remove') {
    el.parentNode?.removeChild(el)
    return true
  }
  if (op.op === 'add-after') {
    // Clone the element's tag/class/style, retarget it, insert right after — so a new nav
    // item / button inherits the EXACT styling + position of the one beside it.
    const href = safeHref(op.href)
    const cls = el.getAttribute('class')
    const style = el.getAttribute('style')
    const attr = (cls ? ` class="${escapeAttr(cls)}"` : '') + (style ? ` style="${escapeAttr(style)}"` : '')
    const text = escapeHtml((op.text || 'Link').slice(0, 80))
    const newEl = `<a href="${escapeAttr(href)}"${attr}>${text}</a>`
    const parent = el.parentNode as HTMLElement | null
    if (parent && tagOf(parent) === 'li') {
      const liCls = parent.getAttribute('class')
      parent.insertAdjacentHTML('afterend', `<li${liCls ? ` class="${escapeAttr(liCls)}"` : ''}>${newEl}</li>`)
    } else {
      el.insertAdjacentHTML('afterend', newEl)
    }
    return true
  }
  if (op.op === 'set-link') {
    const href = safeHref(op.href)
    if (tagOf(el) === 'a') {
      el.setAttribute('href', href)
    } else {
      el.insertAdjacentHTML('beforebegin', `<a href="${escapeAttr(href)}" style="text-decoration:none">${el.outerHTML}</a>`)
      el.parentNode?.removeChild(el)
    }
    return true
  }
  return false // add-button is handled at the section level, not here
}

/**
 * If the element at `globalIndex` lives inside a SHARED component (header/nav/footer),
 * return how to find the same element on OTHER pages: the component tag, its index among
 * same-tag elements, and the element's index among a/button WITHIN the component (stable
 * across pages despite per-page "active" classes). Null if not in a shared component.
 */
export function sharedComponentLocator(html: string, globalIndex: number): { tag: string; compIndex: number; elIndex: number } | null {
  const root = parse(html, { comment: true })
  const el = linkEls(root)[globalIndex]
  if (!el) return null
  let anc = el.parentNode as HTMLElement | null
  let comp: HTMLElement | null = null
  while (anc) {
    const t = tagOf(anc)
    if (t === 'header' || t === 'nav' || t === 'footer') comp = anc
    anc = anc.parentNode as HTMLElement | null
  }
  if (!comp) return null
  const tag = tagOf(comp)
  const compIndex = (root.querySelectorAll(tag) as HTMLElement[]).indexOf(comp)
  const elIndex = (comp.querySelectorAll('a, button') as HTMLElement[]).indexOf(el)
  if (compIndex < 0 || elIndex < 0) return null
  return { tag, compIndex, elIndex }
}

// ── Repeated items (cards, nav links, button groups): reorder / duplicate / remove ──────
//
// Items are detected by `itemEls` (a repeated sibling group inside a section). Ops target an
// item by its index in that flat list; the same index the client reads from `data-sa-item`.

export type ItemOp =
  | { op: 'move'; index: number; dir: 'prev' | 'next' } // reorder within its sibling group (◀▶ / ▲▼)
  | { op: 'duplicate'; index: number } // clone the item right after itself (the "add another card")
  | { op: 'remove'; index: number }

/** Mutate the item at `index` within an already-detected item list. Returns false if invalid. */
function doItemOp(items: HTMLElement[], op: ItemOp): boolean {
  const el = items[op.index]
  if (!el) return false
  if (op.op === 'remove') {
    el.parentNode?.removeChild(el)
    return true
  }
  if (op.op === 'duplicate') {
    el.insertAdjacentHTML('afterend', el.outerHTML)
    return true
  }
  // move: swap with the adjacent item in the SAME parent — works in any layout direction
  // (a flex row reorders left/right, a grid/column reorders up/down).
  const parent = el.parentNode
  const sibs = items.filter((it) => it.parentNode === parent)
  const pos = sibs.indexOf(el)
  const j = pos + (op.dir === 'prev' ? -1 : 1)
  if (j < 0 || j >= sibs.length) return true // at the edge — nothing to swap with (no-op, still ok)
  const other = sibs[j]
  const movingHtml = el.outerHTML
  el.parentNode?.removeChild(el)
  other.insertAdjacentHTML(op.dir === 'prev' ? 'beforebegin' : 'afterend', movingHtml)
  return true
}

/** Apply one item op (reorder / duplicate / remove) to a page's HTML; null if invalid. */
export function applyItemOp(html: string, op: ItemOp): string | null {
  const root = parse(html, { comment: true })
  return doItemOp(itemEls(root), op) ? root.toString() : null
}

/** The page's items that live INSIDE `comp`, in document order. (Scanning `comp` as a root
 *  doesn't work — itemEls treats its top children as sections — so we filter the full list.) */
function itemsInside(root: HTMLElement, comp: HTMLElement): HTMLElement[] {
  return itemEls(root).filter((it) => {
    let a = it.parentNode as HTMLElement | null
    while (a) {
      if (a === comp) return true
      a = a.parentNode as HTMLElement | null
    }
    return false
  })
}

/** If the item at `globalIndex` lives in a SHARED component (header/nav/footer) — e.g. a nav
 *  link — return how to find it on other pages: {tag, compIndex, itemIndex within the comp}. */
export function sharedItemLocator(html: string, globalIndex: number): { tag: string; compIndex: number; itemIndex: number } | null {
  const root = parse(html, { comment: true })
  const el = itemEls(root)[globalIndex]
  if (!el) return null
  let anc = el.parentNode as HTMLElement | null
  let comp: HTMLElement | null = null
  while (anc) {
    const t = tagOf(anc)
    if (t === 'header' || t === 'nav' || t === 'footer') comp = anc
    anc = anc.parentNode as HTMLElement | null
  }
  if (!comp) return null
  const tag = tagOf(comp)
  const compIndex = (root.querySelectorAll(tag) as HTMLElement[]).indexOf(comp)
  const itemIndex = itemsInside(root, comp).indexOf(el)
  if (compIndex < 0 || itemIndex < 0) return null
  return { tag, compIndex, itemIndex }
}

/** Apply an item op to the item at `loc.itemIndex` WITHIN the located shared component. */
export function applyItemOpInComponent(html: string, loc: { tag: string; compIndex: number; itemIndex: number }, op: ItemOp): string | null {
  const root = parse(html, { comment: true })
  const comp = (root.querySelectorAll(loc.tag) as HTMLElement[])[loc.compIndex]
  if (!comp) return null
  const items = itemsInside(root, comp)
  // Removing a nav MENU item (e.g. a nav link, which is also a repeated item) must clear its
  // counterpart in the OTHER menu list (desktop ⇄ mobile drawer) too — same as element-remove.
  if (op.op === 'remove') {
    const target = items[loc.itemIndex]
    const link = target && (tagOf(target) === 'a' ? target : (target.querySelector('a') as HTMLElement | null))
    const href = link?.getAttribute('href') || ''
    const inMenu = !!link && !isNavLogo(link) && navMenuGroups(root).some((g) => g.container === navContainerOf(link))
    if (!doItemOp(items, { ...op, index: loc.itemIndex })) return null
    if (inMenu && href)
      for (const g of navMenuGroups(root))
        for (const a of g.container.querySelectorAll('a') as HTMLElement[])
          if (!isNavLogo(a) && (a.getAttribute('href') || '') === href) removeNavAnchor(a)
    return root.toString()
  }
  return doItemOp(items, { ...op, index: loc.itemIndex }) ? root.toString() : null
}

/** The clean outer HTML of the item at `index` — sent to the AI as edit context for item "Edit with AI". */
export function getItemHtml(html: string, index: number): string | null {
  const el = itemEls(parse(html, { comment: true }))[index]
  return el ? el.outerHTML : null
}

/** Replace the item at `index` with new (already-sanitised) HTML; null if invalid. */
export function replaceItemHtml(html: string, index: number, newHtml: string): string | null {
  const frag = (newHtml || '').trim()
  if (!frag) return null
  const root = parse(html, { comment: true })
  const el = itemEls(root)[index]
  if (!el) return null
  el.insertAdjacentHTML('beforebegin', frag)
  el.parentNode?.removeChild(el)
  return root.toString()
}

/** Replace the item at `loc.itemIndex` within the located shared component (sync an item AI-edit across pages). */
export function replaceItemInComponent(html: string, loc: { tag: string; compIndex: number; itemIndex: number }, newHtml: string): string | null {
  const frag = (newHtml || '').trim()
  if (!frag) return null
  const root = parse(html, { comment: true })
  const comp = (root.querySelectorAll(loc.tag) as HTMLElement[])[loc.compIndex]
  if (!comp) return null
  const el = itemsInside(root, comp)[loc.itemIndex]
  if (!el) return null
  el.insertAdjacentHTML('beforebegin', frag)
  el.parentNode?.removeChild(el)
  return root.toString()
}

/** Apply an element op to the element at `op.index` WITHIN the located shared component. */
export function applyElementOpInComponent(html: string, loc: { tag: string; compIndex: number }, op: ElementOp): string | null {
  if (op.op === 'add-button' || op.op === 'link-image') return null // not shared-component ops
  const root = parse(html, { comment: true })
  const comp = (root.querySelectorAll(loc.tag) as HTMLElement[])[loc.compIndex]
  if (!comp) return null
  const el = (comp.querySelectorAll('a, button') as HTMLElement[])[op.index]
  if (!el) return null
  // A nav link lives in a shared component (header/nav) that holds BOTH the desktop bar and the
  // mobile drawer — so add/remove must hit every menu list here too, not just the clicked element.
  if (syncNavMenus(root, el, op)) return root.toString()
  return applyToElement(el, op) ? root.toString() : null
}

/** If the section at `sectionIndex` is itself a shared component (header/nav/footer),
 *  return how to find it on other pages ({tag, compIndex}); else null. */
export function sharedSectionLocator(html: string, sectionIndex: number): { tag: string; compIndex: number } | null {
  const root = parse(html, { comment: true })
  const sec = sectionEls(root)[sectionIndex]
  if (!sec) return null
  const tag = tagOf(sec)
  if (tag !== 'header' && tag !== 'nav' && tag !== 'footer') return null
  const compIndex = (root.querySelectorAll(tag) as HTMLElement[]).indexOf(sec)
  return compIndex >= 0 ? { tag, compIndex } : null
}

/** Replace a shared component (found by tag+index) with new HTML, wrapped in the component
 *  tag if the replacement isn't already. Used to sync an AI/section edit across pages. */
export function replaceComponent(html: string, loc: { tag: string; compIndex: number }, newHtml: string): string | null {
  const root = parse(html, { comment: true })
  const comp = (root.querySelectorAll(loc.tag) as HTMLElement[])[loc.compIndex]
  if (!comp) return null
  const top = parse(newHtml, { comment: true }).children as HTMLElement[]
  const wrapped = top.length === 1 && tagOf(top[0]) === loc.tag ? newHtml : `<${loc.tag}>${newHtml}</${loc.tag}>`
  comp.insertAdjacentHTML('beforebegin', wrapped)
  comp.parentNode?.removeChild(comp)
  return root.toString()
}

/** Remove a shared component (found by tag+index). Used to delete a nav/footer site-wide. */
export function deleteComponent(html: string, loc: { tag: string; compIndex: number }): string | null {
  const root = parse(html, { comment: true })
  const comp = (root.querySelectorAll(loc.tag) as HTMLElement[])[loc.compIndex]
  if (!comp) return null
  comp.parentNode?.removeChild(comp)
  return root.toString()
}

/** Best-effort: remove every nav link pointing at `targetPath` from a page. */
export function removeNavLinks(html: string, targetPath: string): string {
  const root = parse(html, { comment: true })
  let changed = false
  for (const a of root.querySelectorAll('a')) {
    if (routeOfHref(a.getAttribute('href')) === targetPath && a.parentNode) {
      a.parentNode.removeChild(a)
      changed = true
    }
  }
  return changed ? root.toString() : html
}

/** The clean HTML of the section at `index` (for sending to the AI as edit context). */
export function getSectionHtml(html: string, index: number): string | null {
  const root = parse(html, { comment: true })
  const els = sectionEls(root)
  return els[index] ? els[index].outerHTML : null
}

/** The inner HTML of a page's <main> (for "edit this whole page with AI"). */
export function getMainInnerHtml(html: string): string {
  const root = parse(html, { comment: true })
  const main = root.querySelector('main') as HTMLElement | null
  return main ? main.innerHTML : ''
}

export type SectionOp =
  | { op: 'move'; index: number; dir: 'up' | 'down' }
  | { op: 'delete'; index: number }
  | { op: 'insert'; index: number; html: string }
  | { op: 'replace'; index: number; html: string }

/**
 * Apply one section op to a page's HTML and return the new HTML, or null if the op
 * or its index is invalid. Uses node-html-parser's insertAdjacentHTML/removeChild so
 * comments and inter-section structure are preserved as much as the parser allows.
 */
export function applySectionOp(html: string, op: SectionOp): string | null {
  const root = parse(html, { comment: true })
  const sections = sectionEls(root)
  const n = sections.length
  const inRange = Number.isInteger(op.index) && op.index >= 0 && op.index < n

  switch (op.op) {
    case 'delete': {
      if (!inRange) return null
      sections[op.index].parentNode?.removeChild(sections[op.index])
      return root.toString()
    }
    case 'move': {
      if (!inRange) return null
      const j = op.index + (op.dir === 'up' ? -1 : 1)
      if (j < 0 || j >= n) return root.toString() // edge: nothing to swap with — no-op
      const moving = sections[op.index]
      const movingHtml = moving.outerHTML
      moving.parentNode?.removeChild(moving)
      // sections[j] is a different, still-attached node; insert the moved markup beside it.
      sections[j].insertAdjacentHTML(op.dir === 'up' ? 'beforebegin' : 'afterend', movingHtml)
      return root.toString()
    }
    case 'insert': {
      const frag = typeof op.html === 'string' ? op.html.trim() : ''
      if (!frag) return null
      if (n === 0) {
        const body = (root.querySelector('body') as HTMLElement) ?? root
        const main = body.children.find((c) => tagOf(c) === 'main')
        ;(main ?? body).insertAdjacentHTML('afterbegin', frag)
      } else if (op.index >= n) {
        sections[n - 1].insertAdjacentHTML('afterend', frag)
      } else if (op.index <= 0) {
        sections[0].insertAdjacentHTML('beforebegin', frag)
      } else {
        sections[op.index].insertAdjacentHTML('beforebegin', frag)
      }
      return root.toString()
    }
    case 'replace': {
      if (!inRange) return null
      const frag = typeof op.html === 'string' ? op.html.trim() : ''
      if (!frag) return null
      sections[op.index].insertAdjacentHTML('beforebegin', frag) // new node goes before the old…
      sections[op.index].parentNode?.removeChild(sections[op.index]) // …then drop the old one
      return root.toString()
    }
    default:
      return null
  }
}

// ── AI-generated / edited HTML sanitiser (Track D/G) ────────────────────────────
//
// Generated / pasted / fetched / EDITED HTML is UNTRUSTED. A strict allowlist also rejects
// the harmless attributes real sites use (media, data-*, framework attrs) — turning AI
// edits of real markup into whack-a-mole — so this is a DENYLIST: reject the genuinely
// dangerous things (active-content tags, JS event handlers / framework bindings, dangerous
// URL schemes, unsafe inline CSS) and allow everything else, then re-validate after
// serialisation (mutation-XSS guard). Fail-closed on a real threat; permissive on inert markup.

// Tags that can execute or inject — rejected. (Presentational svg tags like path/rect/g are
// inert and intentionally NOT listed; only the dangerous svg children are.)
const DANGEROUS_TAGS = new Set([
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet',
  'base', 'meta', 'link', 'title', 'head', 'html', 'body', 'noscript', 'template', 'slot', 'portal',
  'foreignobject', 'use', 'image', 'animate', 'animatetransform', 'animatemotion', 'set', 'handler', 'listener', 'math',
])
// Attributes carrying a URL — scheme-checked (no javascript:/vbscript:; data: for images only).
const URL_ATTRS = new Set(['href', 'xlink:href', 'src', 'action', 'poster', 'background', 'cite', 'data', 'ping', 'longdesc'])

/**
 * A safe-enough inline `style` value: presentational CSS is allowed (so generated
 * sections can look polished on their own), but the classic CSS injection vectors are
 * rejected — `expression()`, `behavior`, `-moz-binding`, `@import`, and `url(...)` that
 * points at a script/non-image-data scheme.
 */
function safeStyle(value: string): boolean {
  const s = value.toLowerCase()
  if (/(expression\s*\(|javascript:|vbscript:|behavior\s*:|-moz-binding|@import)/.test(s)) return false
  for (const u of s.match(/url\s*\([^)]*\)/g) ?? []) {
    const inner = u.replace(/url\s*\(/, '').replace(/\)$/, '').replace(/['"]/g, '').trim()
    if (/^(javascript:|vbscript:|data:(?!image\/))/.test(inner)) return false
  }
  return true
}

function schemeOk(value: string, kind: 'href' | 'src'): boolean {
  const v = value.trim()
  if (v === '') return true
  if (/^(javascript:|vbscript:)/i.test(v)) return false
  if (/^data:/i.test(v)) return kind === 'src' && /^data:image\//i.test(v) // images only, never href
  if (/^https?:\/\//i.test(v)) return true
  if (/^(mailto:|tel:)/i.test(v)) return kind === 'href'
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return false // any other explicit scheme → reject
  return true // relative path / anchor / query
}

function validateFragment(html: string): { ok: true; html: string } | { ok: false; error: string } {
  const root = parse(html, { comment: false })
  for (const el of root.querySelectorAll('*')) {
    const tag = (el.rawTagName || '').toLowerCase()
    if (DANGEROUS_TAGS.has(tag)) return { ok: false, error: `disallowed tag <${tag}>` }
    for (const name of Object.keys(el.attributes || {})) {
      const lname = name.toLowerCase()
      const val = el.getAttribute(name) ?? ''
      // JS execution vectors → reject.
      if (lname.startsWith('on')) return { ok: false, error: `event handler ${lname}` }
      if (lname.startsWith('@') || lname.startsWith(':') || lname.startsWith('v-') || lname.startsWith('x-'))
        return { ok: false, error: `framework binding ${lname}` }
      if (lname === 'srcset' || lname === 'formaction') return { ok: false, error: `disallowed attribute ${lname}` }
      // CSS injection → validated (presentational CSS is fine).
      if (lname === 'style') {
        if (!safeStyle(val)) return { ok: false, error: 'unsafe inline style' }
        continue
      }
      // URL attributes → scheme-checked (javascript:/vbscript: and non-image data: rejected).
      if (URL_ATTRS.has(lname) && !schemeOk(val, lname === 'src' || lname === 'poster' || lname === 'background' ? 'src' : 'href')) {
        return { ok: false, error: `unsafe ${lname}` }
      }
      // Everything else (class, id, media, data-*, aria-*, width, role, custom static attrs)
      // is inert in static HTML → allowed.
    }
  }
  return { ok: true, html: root.toString() }
}

export type ParsedSection = { ok: true; html: string; message?: string } | { ok: false; error: string }

/**
 * Validate an AI/pasted/fetched section's HTML. Closed top-level object ({html, message}),
 * tag/attr/scheme allowlist, no scripts/styles/handlers/foreign content, size-capped, and
 * re-validated after serialisation (mutation-XSS guard). Fail-closed.
 */
export function parseGeneratedSection(raw: unknown): ParsedSection {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'not an object' }
  const o = raw as Record<string, unknown>
  for (const k of Object.keys(o)) if (k !== 'html' && k !== 'message') return { ok: false, error: `unknown field: ${k}` }
  const htmlStr = typeof o.html === 'string' ? o.html : ''
  if (!htmlStr.trim()) return { ok: false, error: 'empty html' }
  if (htmlStr.length > 50000) return { ok: false, error: 'html too large' }

  const first = validateFragment(htmlStr)
  if (!first.ok) return first
  const second = validateFragment(first.html) // mutation-XSS guard: must survive a round-trip unchanged in shape
  if (!second.ok) return second

  const message = typeof o.message === 'string' ? o.message.slice(0, 300) : undefined
  return { ok: true, html: second.html, message }
}

/** Validate a bare HTML string (pasted template / fetched page body) the same way. */
export function sanitizeHtmlFragment(html: string): ParsedSection {
  return parseGeneratedSection({ html })
}

/** A sample of the class names used on a page, to prompt the model to style to the site. */
export function sampleSiteClasses(html: string, max = 80): string[] {
  const root = parse(html)
  const set = new Set<string>()
  for (const el of root.querySelectorAll('[class]')) {
    for (const c of (el.getAttribute('class') || '').split(/\s+/)) if (c) set.add(c)
    if (set.size >= max) break
  }
  return Array.from(set).slice(0, max)
}

/**
 * Re-anchor a page's draft content after a structural change to its source HTML, so
 * prior edits survive instead of landing on the wrong element.
 *
 * Inputs are the OLD source HTML (pre-op), the OLD draft (current edited values keyed
 * by old ids), and the NEW source HTML (post-op). Returns the new draft keyed by the
 * NEW ids, plus how many edits were dropped for safety.
 *
 * Rules (conservative — a wrong remap is worse than a dropped one):
 *  - Base = the new originals (every new id starts at its freshly-extracted value).
 *  - For every OLD id whose draft value DIFFERS from its old original (a real edit):
 *      1. if it's a stable `data-sa` marker id that still exists → carry it straight over;
 *      2. else find the unique NEW id whose ORIGINAL value+kind equals the old original
 *         (a moved element keeps its original text) → carry the edit there;
 *      3. else (ambiguous or vanished) → skip; keep the new original. Logged by caller.
 */
export function remapDraft(
  oldSourceHtml: string,
  oldDraft: ContentMap,
  newSourceHtml: string,
): { draft: ContentMap; skipped: number; carried: number } {
  const oldOriginal = extractContent(oldSourceHtml)
  const newOriginal = extractContent(newSourceHtml)

  const draft: ContentMap = {}
  for (const [id, e] of Object.entries(newOriginal)) draft[id] = { ...e }

  // Index new ids by kind|normalized-value for unique-match lookups.
  const byValue = new Map<string, string[]>()
  for (const [id, e] of Object.entries(newOriginal)) {
    const k = `${e.type}|${collapse(e.value)}`
    const list = byValue.get(k)
    if (list) list.push(id)
    else byValue.set(k, [id])
  }

  let skipped = 0
  let carried = 0
  for (const [oldId, oldEntry] of Object.entries(oldDraft)) {
    const orig = oldOriginal[oldId]
    if (!orig) continue // id no longer exists in the old extraction — nothing to preserve
    if (collapse(orig.value) === collapse(oldEntry.value)) continue // unedited — base already covers it

    // (1) stable marker id that still exists post-op
    if (!oldId.startsWith('auto:') && newOriginal[oldId]) {
      draft[oldId] = { ...oldEntry }
      carried++
      continue
    }
    // (2) unique match by original value + kind
    const candidates = byValue.get(`${orig.type}|${collapse(orig.value)}`) ?? []
    if (candidates.length === 1) {
      draft[candidates[0]] = { ...oldEntry }
      carried++
    } else {
      skipped++ // ambiguous or removed — don't guess
    }
  }
  return { draft, skipped, carried }
}
