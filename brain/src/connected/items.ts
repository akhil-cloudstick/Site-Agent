import { HTMLElement } from 'node-html-parser'

/**
 * "Items" = repeated sibling elements: the cards in a blog/feature grid, the links in a
 * nav, the tiers in a pricing row, the buttons in a button group. They are the connected-
 * site analogue of the builder's repeatable items, and the unit for the per-item controls
 * (reorder ◀▶/▲▼, duplicate, remove).
 *
 * Detection (heuristic, deliberately conservative): within any parent, take the DOMINANT
 * group of element children that share a tag+class signature — it must have ≥2 members AND
 * make up ≥half the parent's element children, so two coincidental matches among many
 * different siblings don't qualify. Each member must be a real block (has an element child)
 * or an a/button/li, so leaf text repeats (e.g. several <p>) are NOT treated as items.
 *
 * The page's top-level bands (direct children of <body>/<main>) are EXCLUDED — those are
 * "sections", handled by the section controls; items live INSIDE sections.
 *
 * Pure and shared by html.ts (stamps `data-sa-item` indices server-side) and structure.ts
 * (applies ops by the same index) so the client never has to re-run this heuristic.
 */

const NON_ITEM_TAGS = new Set(['script', 'style', 'link', 'noscript', 'template', 'base', 'meta', 'title', 'head', 'br', 'hr'])
const tagOf = (el: HTMLElement) => (el.rawTagName || '').toLowerCase()
const classesOf = (el: HTMLElement) => (el.getAttribute('class') || '').split(/\s+/).filter(Boolean)
const hasElementChild = (el: HTMLElement) => (el.children as HTMLElement[]).some((c) => !!c.rawTagName)
const isItemLike = (el: HTMLElement) => hasElementChild(el) || ['a', 'button', 'li'].includes(tagOf(el))

export function itemEls(root: HTMLElement): HTMLElement[] {
  const body = (root.querySelector('body') as HTMLElement) ?? root
  const main = (body.children as HTMLElement[]).find((c) => tagOf(c) === 'main') ?? null
  const parents = [body, ...(body.querySelectorAll('*') as HTMLElement[])]
  const members = new Set<HTMLElement>()
  for (const parent of parents) {
    if (parent === body || parent === main) continue // those children are SECTIONS, not items
    const kids = (parent.children as HTMLElement[]).filter((c) => !NON_ITEM_TAGS.has(tagOf(c)))
    if (kids.length < 2) continue
    // Group siblings by tag + ANY shared class (and tag-alone for class-less ones), so a varied
    // grid — "card", "card large", "card wide" — groups as cards because they all share "card".
    // The largest such group is the item set (≥2 AND ≥half the parent's element children).
    const groups = new Map<string, HTMLElement[]>()
    const add = (key: string, k: HTMLElement) => {
      const g = groups.get(key)
      if (g) g.push(k)
      else groups.set(key, [k])
    }
    for (const k of kids) {
      const cls = classesOf(k)
      if (cls.length === 0) add(tagOf(k) + '|', k)
      else for (const c of cls) add(tagOf(k) + '|' + c, k)
    }
    let best: HTMLElement[] = []
    for (const g of groups.values()) if (g.length > best.length) best = g
    if (best.length < 2 || best.length * 2 < kids.length) continue // ≥2 AND ≥half the parent's children
    if (!best.every(isItemLike)) continue
    for (const m of best) members.add(m)
  }
  // Return in document order (querySelectorAll yields document order) so indices are stable.
  return (body.querySelectorAll('*') as HTMLElement[]).filter((el) => members.has(el))
}
