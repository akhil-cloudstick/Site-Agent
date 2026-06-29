/**
 * Live smoke test for CONNECTED-site structural editing — the end-to-end runner the plan
 * called for (Phase 2). Pure functions only (no DB), so it runs anywhere:
 *
 *   pnpm payload run src/connected/verify-structure-connected.ts
 *   # or:  npx tsx src/connected/verify-structure-connected.ts
 *
 * Exercises: detect → move/delete/insert/replace sections → reorder/duplicate/remove items →
 * remap drafts survive a structural change → add/remove a page + nav link. Writes
 * connected-structure-result.txt and exits non-zero on the first failure.
 */
import { writeFileSync } from 'node:fs'

import { parse } from 'node-html-parser'

import { extractContent } from './html'
import { itemEls } from './items'
import {
  addNavLink,
  applyItemOp,
  applySectionOp,
  clonePageForNewRoute,
  detectSections,
  getItemHtml,
  remapDraft,
  removeNavLinks,
  replaceItemHtml,
  setMainContent,
  stripPageChrome,
} from './structure'

const RESULT_FILE = 'S:/SiteAgent/brain/connected-structure-result.txt'
const out: string[] = []
let failures = 0
function check(name: string, cond: boolean) {
  out.push(`${cond ? 'PASS' : 'FAIL'}  ${name}`)
  if (!cond) failures++
}
const headings = (html: string) => detectSections(html).map((s) => s.label)
const cardTitles = (html: string) =>
  itemEls(parse(html)).map((el) => el.querySelector('h3')?.text ?? el.text.trim())

const NAV = '<header><nav><a href="/">Home</a><a href="/blog">Blog</a></nav></header>'
const HOME = `<html><body>${NAV}<main>
  <section class="hero"><h1>Welcome</h1><p>Intro</p></section>
  <section class="features"><h2>Features</h2><p>Fast</p></section>
  <section class="cta"><h2>Get started</h2></section>
</main></body></html>`
// No nav here on purpose — nav links are ALSO items, which would shift the card indices.
const BLOG = `<html><body><main>
  <section class="posts"><div class="grid">
    <article class="card"><h3>One</h3><p>a</p></article>
    <article class="card"><h3>Two</h3><p>b</p></article>
    <article class="card"><h3>Three</h3><p>c</p></article>
  </div></section>
</main></body></html>`

try {
  // ── Sections: detect / move / delete / insert / replace ────────────────────────
  check('detect home sections', JSON.stringify(headings(HOME)) === JSON.stringify(['Header / nav', 'Welcome', 'Features', 'Get started']))
  const moved = applySectionOp(HOME, { op: 'move', index: 1, dir: 'down' })!
  check('move hero down', JSON.stringify(headings(moved)) === JSON.stringify(['Header / nav', 'Features', 'Welcome', 'Get started']))
  const deleted = applySectionOp(HOME, { op: 'delete', index: 2 })!
  check('delete features', JSON.stringify(headings(deleted)) === JSON.stringify(['Header / nav', 'Welcome', 'Get started']))
  const inserted = applySectionOp(HOME, { op: 'insert', index: 2, html: '<section><h2>New band</h2></section>' })!
  check('insert at index 2', JSON.stringify(headings(inserted)) === JSON.stringify(['Header / nav', 'Welcome', 'New band', 'Features', 'Get started']))
  const replaced = applySectionOp(HOME, { op: 'replace', index: 3, html: '<section><h2>Reworked</h2></section>' })!
  check('replace cta', JSON.stringify(headings(replaced)) === JSON.stringify(['Header / nav', 'Welcome', 'Features', 'Reworked']))

  // ── Items (cards): detect / reorder / duplicate / remove / get+replace ──────────
  check('detect blog cards', JSON.stringify(cardTitles(BLOG)) === JSON.stringify(['One', 'Two', 'Three']))
  const reordered = applyItemOp(BLOG, { op: 'move', index: 0, dir: 'next' })!
  check('reorder card One→after Two', JSON.stringify(cardTitles(reordered)) === JSON.stringify(['Two', 'One', 'Three']))
  const dup = applyItemOp(BLOG, { op: 'duplicate', index: 2 })!
  check('duplicate card Three', JSON.stringify(cardTitles(dup)) === JSON.stringify(['One', 'Two', 'Three', 'Three']))
  const rm = applyItemOp(BLOG, { op: 'remove', index: 1 })!
  check('remove card Two', JSON.stringify(cardTitles(rm)) === JSON.stringify(['One', 'Three']))
  check('get item HTML', (getItemHtml(BLOG, 1) ?? '').includes('Two'))
  const itemReplaced = replaceItemHtml(BLOG, 1, '<article class="card"><h3>Brand New</h3></article>')!
  check('replace card Two', JSON.stringify(cardTitles(itemReplaced)) === JSON.stringify(['One', 'Brand New', 'Three']))

  // ── Remap: a prior content edit must survive a structural change ────────────────
  const draft = extractContent(HOME)
  const introId = Object.entries(draft).find(([, e]) => e.value === 'Intro')![0]
  draft[introId] = { ...draft[introId], value: 'EDITED INTRO' }
  const afterMove = applySectionOp(HOME, { op: 'move', index: 3, dir: 'up' })! // move CTA above features
  const remapped = remapDraft(HOME, draft, afterMove).draft
  check('edited intro survives a section move', Object.values(remapped).some((e) => e.value === 'EDITED INTRO'))

  // ── Pages: add (clone keeps chrome, resets main) / remove (strip nav links) ─────
  const cloned = clonePageForNewRoute(HOME, 'Pricing')
  check('cloned page keeps the shared nav', cloned.includes('<nav') && cloned.includes('href="/"'))
  check('cloned page resets main to the new title', cloned.includes('>Pricing<'))
  // AI-page path: strip any chrome the model emitted, then drop it into the kept page <main>.
  const seeded = setMainContent(HOME, stripPageChrome('<header><nav>JUNK</nav></header><section><h1>Custom</h1></section>'))
  check('setMainContent keeps nav + strips chrome from new content', seeded.includes('href="/"') && seeded.includes('>Custom<') && !seeded.includes('JUNK'))
  const withLink = addNavLink(HOME, '/pricing', 'Pricing', ['/', '/blog'])
  check('add nav link to /pricing', withLink.slice(withLink.indexOf('<nav'), withLink.indexOf('</nav>')).includes('/pricing'))
  const withoutBlog = removeNavLinks(withLink, '/blog')
  check('remove nav links to /blog', !withoutBlog.slice(withoutBlog.indexOf('<nav'), withoutBlog.indexOf('</nav>')).includes('/blog'))

  const ok = failures === 0
  writeFileSync(RESULT_FILE, (ok ? 'CONNECTED_STRUCTURE_OK' : `CONNECTED_STRUCTURE_FAIL (${failures})`) + '\n' + out.join('\n') + '\n')
  // eslint-disable-next-line no-console
  console.log(out.join('\n'))
  process.exit(ok ? 0 : 1)
} catch (err: any) {
  writeFileSync(RESULT_FILE, 'CONNECTED_STRUCTURE_ERROR\n' + out.join('\n') + '\n' + (err?.stack ?? String(err)) + '\n')
  process.exit(1)
}
