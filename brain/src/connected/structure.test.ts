import { describe, expect, it } from 'vitest'

import { extractContent } from './html'
import { itemEls } from './items'
import { parse } from 'node-html-parser'
import {
  addNavLink,
  applyElementOp,
  applyElementOpInComponent,
  applyItemOp,
  applyItemOpInComponent,
  applySectionOp,
  getItemHtml,
  replaceItemHtml,
  deleteComponent,
  detectSections,
  getSectionHtml,
  parseGeneratedSection,
  remapDraft,
  replaceComponent,
  sharedComponentLocator,
  sharedItemLocator,
  sharedSectionLocator,
} from './structure'

const PAGE = `<html><body><main>
  <section class="hero"><h1>Welcome</h1><p>Intro</p></section>
  <section class="features"><h2>Features</h2><p>F1</p></section>
  <script>var x=1</script>
  <section class="cta"><h2>Call</h2></section>
</main></body></html>`

const idOf = (draft: Record<string, { value: string }>, value: string) =>
  Object.entries(draft).find(([, e]) => e.value === value)![0]

describe('detectSections', () => {
  it('lists top-level bands and skips <script>', () => {
    const secs = detectSections(PAGE)
    expect(secs.map((s) => s.label)).toEqual(['Welcome', 'Features', 'Call'])
  })
})

describe('applySectionOp', () => {
  it('moves a section down', () => {
    const out = applySectionOp(PAGE, { op: 'move', index: 0, dir: 'down' })!
    expect(detectSections(out).map((s) => s.label)).toEqual(['Features', 'Welcome', 'Call'])
  })
  it('deletes a section', () => {
    const out = applySectionOp(PAGE, { op: 'delete', index: 1 })!
    expect(detectSections(out).map((s) => s.label)).toEqual(['Welcome', 'Call'])
  })
  it('inserts html at an index', () => {
    const out = applySectionOp(PAGE, { op: 'insert', index: 1, html: '<section><h2>New</h2></section>' })!
    expect(detectSections(out).map((s) => s.label)).toEqual(['Welcome', 'New', 'Features', 'Call'])
  })
  it('appends when the insert index is past the end', () => {
    const out = applySectionOp(PAGE, { op: 'insert', index: 999, html: '<section><h2>End</h2></section>' })!
    expect(detectSections(out).map((s) => s.label)).toEqual(['Welcome', 'Features', 'Call', 'End'])
  })
  it('replaces a section in place', () => {
    const out = applySectionOp(PAGE, { op: 'replace', index: 1, html: '<section><h2>Reworked</h2></section>' })!
    expect(detectSections(out).map((s) => s.label)).toEqual(['Welcome', 'Reworked', 'Call'])
  })
  it('returns null for an out-of-range delete', () => {
    expect(applySectionOp(PAGE, { op: 'delete', index: 9 })).toBeNull()
  })
})

const PAGE2 = `<html><body>
  <header><nav><a href="/">Home</a><a href="/contact">Contact</a></nav></header>
  <main>
    <section class="hero"><h1>Hi</h1></section>
    <section class="feat"><h2>Feat</h2></section>
  </main>
  <footer><p>© Co</p></footer>
</body></html>`

describe('section flattening (nav/header/footer are editable bands)', () => {
  it('includes body-level header + footer alongside <main> children, in order', () => {
    expect(detectSections(PAGE2).map((s) => s.tag)).toEqual(['header', 'section', 'section', 'footer'])
  })
  it('deletes the header band (parent-aware)', () => {
    const out = applySectionOp(PAGE2, { op: 'delete', index: 0 })!
    expect(detectSections(out).map((s) => s.tag)).toEqual(['section', 'section', 'footer'])
  })
  it('replaces the header in place (Edit-with-AI on the nav)', () => {
    const out = applySectionOp(PAGE2, { op: 'replace', index: 0, html: '<header><nav><a href="/">New</a></nav></header>' })!
    const secs = detectSections(out)
    expect(secs.map((s) => s.tag)).toEqual(['header', 'section', 'section', 'footer'])
    expect(out).toContain('New')
  })
})

describe('addNavLink (nav shortcut to a new page)', () => {
  // Realistic header: a <nav> menu PLUS a separate "Contact Us" CTA after it.
  const HEADER = `<header><nav><ul><li><a href="/">Home</a></li><li><a href="/contact">Contact</a></li></ul></nav><a class="cta" href="/contact">Contact Us</a></header><main></main>`
  it('adds the new link INSIDE the <nav> (not after the CTA), after the last menu item', () => {
    const out = addNavLink(HEADER, '/i-want', 'I Want', ['/', '/contact'])
    const nav = out.slice(out.indexOf('<nav'), out.indexOf('</nav>'))
    expect(nav).toContain('href="/i-want"') // it landed in the menu, not on the outside CTA
    expect(nav.indexOf('/contact') < nav.indexOf('/i-want')).toBe(true) // after Contact
    expect(nav).toContain('<li') // cloned as a proper <li> menu item
  })
  it('leaves the page unchanged when there is no nav/header link to clone', () => {
    expect(addNavLink('<main><p>hi</p></main>', '/x', 'X', ['/'])).toBe('<main><p>hi</p></main>')
  })
  it('clones a MENU link (not the CTA button) even when the menu is not a <nav>', () => {
    const header = `<header><div class="menu"><a href="/">Home</a><a href="/contact">Contact</a></div><a class="btn cta" href="/contact">Contact Us</a></header><main></main>`
    const out = addNavLink(header, '/products', 'Products', ['/', '/contact'])
    const menu = out.slice(out.indexOf('<div class="menu"'), out.indexOf('</div>'))
    expect(menu).toContain('href="/products"') // landed in the menu, not on the CTA
    expect(out).not.toMatch(/class="btn cta"[^>]*>Products/) // did not clone the red CTA
  })
})

describe('applyElementOp (deterministic button/link editing)', () => {
  const PG = `<html><body><main><section class="hero"><h1>Hi</h1><a href="/old">Quote</a><button>Demo</button></section></main></body></html>`
  it('sets a redirect on a link', () => {
    const out = applyElementOp(PG, { op: 'set-link', index: 0, href: '/i-want' })!
    expect(out).toContain('href="/i-want"')
    expect(out).not.toContain('href="/old"')
  })
  it('wraps a <button> in an anchor to redirect it', () => {
    const out = applyElementOp(PG, { op: 'set-link', index: 1, href: '/i-want' })!
    expect(out).toMatch(/<a href="\/i-want"[^>]*><button>Demo<\/button><\/a>/)
  })
  it('rejects a javascript: redirect (falls back to #)', () => {
    const out = applyElementOp(PG, { op: 'set-link', index: 0, href: 'javascript:alert(1)' })!
    expect(out).not.toContain('javascript:')
    expect(out).toContain('href="#"')
  })
  it('removes a button/link', () => {
    const out = applyElementOp(PG, { op: 'remove', index: 1 })! // remove the <button>Demo
    expect(out).not.toContain('Demo')
    expect(out).toContain('Quote')
  })
  it('adds a button to a section', () => {
    const out = applyElementOp(PG, { op: 'add-button', sectionIndex: 0, text: 'Get started', href: '/signup' })!
    expect(out).toContain('>Get started<')
    expect(out).toContain('href="/signup"')
  })
  it('adds a link right after another, cloning its style/position', () => {
    const out = applyElementOp(PG, { op: 'add-after', index: 0, text: 'Pricing', href: '/pricing' })!
    expect(out).toMatch(/href="\/old"[^>]*>Quote<\/a><a href="\/pricing"[^>]*>Pricing<\/a>/)
  })
})

describe('shared-component sync (nav/header edits reflect on every page)', () => {
  const home = `<html><body><header><nav><a href="/" class="active">Home</a><a href="/contact">Contact</a></nav></header><main><section><h1>Home</h1><a href="/x">More</a></section></main></body></html>`
  it('locates a nav link as a shared (header) component element', () => {
    // global link order: Home(0), Contact(1), More(2)
    expect(sharedComponentLocator(home, 1)).toEqual({ tag: 'header', compIndex: 0, elIndex: 1 })
  })
  it('returns null for a main-content link (not shared)', () => {
    expect(sharedComponentLocator(home, 2)).toBeNull()
  })
  it('replays the op in the same component on another page, keeping that page’s active highlight', () => {
    const blog = `<html><body><header><nav><a href="/">Home</a><a href="/contact" class="active">Contact</a></nav></header><main></main></body></html>`
    const out = applyElementOpInComponent(blog, { tag: 'header', compIndex: 0 }, { op: 'add-after', index: 1, text: 'Products', href: '/products' })!
    expect(out).toContain('href="/products"')
    expect(out).toContain('>Products<')
    expect(out).toMatch(/href="\/contact" class="active">Contact/) // the page's own active state is untouched
  })
})

describe('shared SECTION edits (Edit-with-AI / delete on the nav) reflect on every page', () => {
  const page = `<html><body><header><nav><a href="/">Home</a></nav></header><main><section><h1>Hi</h1></section></main></body></html>`
  it('locates a header section as a shared component (and not a content section)', () => {
    expect(sharedSectionLocator(page, 0)).toEqual({ tag: 'header', compIndex: 0 })
    expect(sharedSectionLocator(page, 1)).toBeNull()
  })
  it('replaces the shared component on another page', () => {
    const blog = `<html><body><header><nav><a href="/">Home</a></nav></header><main></main></body></html>`
    const out = replaceComponent(blog, { tag: 'header', compIndex: 0 }, '<header><nav><a href="/">Home</a><a href="/new">New</a></nav></header>')!
    expect(out).toContain('href="/new"')
  })
  it('wraps a bare replacement in the component tag', () => {
    const blog = `<html><body><header>old</header><main></main></body></html>`
    expect(replaceComponent(blog, { tag: 'header', compIndex: 0 }, '<nav><a href="/">Home</a></nav>')!).toMatch(/<header><nav>/)
  })
  it('deletes a shared component', () => {
    expect(deleteComponent(page, { tag: 'header', compIndex: 0 })!).not.toContain('<header>')
  })
})

describe('getSectionHtml', () => {
  it('returns the clean outer HTML of a section', () => {
    const h = getSectionHtml(PAGE, 1)
    expect(h).toContain('Features')
    expect(h).toContain('F1')
    expect(h).not.toContain('Welcome')
  })
  it('returns null out of range', () => expect(getSectionHtml(PAGE, 9)).toBeNull())
})

describe('parseGeneratedSection (sanitiser, fail-closed)', () => {
  const ok = (html: string) => parseGeneratedSection({ html }).ok
  it('accepts a safe section', () => {
    expect(ok('<section class="hero"><h1>Hi</h1><p>Yo</p><a href="/about">About</a></section>')).toBe(true)
  })
  it('rejects <script>', () => expect(ok('<section><script>alert(1)</script></section>')).toBe(false))
  it('allows a simple inline <svg> icon', () => expect(ok('<svg viewBox="0 0 24 24"><path d="M2 2h20v20H2z" fill="#fff"></path></svg>')).toBe(true))
  it('rejects <svg> with an event handler', () => expect(ok('<svg onload="x()"><path d="M0 0"></path></svg>')).toBe(false))
  it('rejects <svg> with <script>', () => expect(ok('<svg><script>x()</script></svg>')).toBe(false))
  it('rejects <svg> with <foreignObject>', () => expect(ok('<svg><foreignObject><div>x</div></foreignObject></svg>')).toBe(false))
  it('rejects <use> in svg', () => expect(ok('<svg><use href="#x"></use></svg>')).toBe(false))
  it('rejects a javascript: href on an svg element', () => expect(ok('<svg><path href="javascript:x" d="M0 0"></path></svg>')).toBe(false))
  it('allows harmless non-standard attributes (e.g. media on <ul>, data-*)', () =>
    expect(ok('<ul media="screen" data-x="1" class="menu"><li>Home</li></ul>')).toBe(true))
  it('rejects a framework JS binding (@click / x-on)', () => {
    expect(ok('<button @click="hack()">Go</button>')).toBe(false)
    expect(ok('<div x-on:click="hack()">x</div>')).toBe(false)
  })
  it('rejects <iframe>', () => expect(ok('<section><iframe src="/x"></iframe></section>')).toBe(false))
  it('allows a safe form field (e.g. a mobile-menu checkbox toggle)', () => expect(ok('<label><input type="checkbox"></label>')).toBe(true))
  it('allows a form with a safe action', () => expect(ok('<form action="/contact"><input type="email" name="email"><button type="submit">Send</button></form>')).toBe(true))
  it('rejects a javascript: form action', () => expect(ok('<form action="javascript:steal()"></form>')).toBe(false))
  it('rejects formaction (action override)', () => expect(ok('<button formaction="https://evil/x">Go</button>')).toBe(false))
  it('rejects an event handler on an input', () => expect(ok('<input type="text" oninput="x()">')).toBe(false))
  it('rejects event handlers', () => expect(ok('<button onclick="x()">Go</button>')).toBe(false))
  it('allows safe presentational inline style', () =>
    expect(ok('<div style="padding:24px;background:#f5f5f5;border-radius:8px;text-align:center">x</div>')).toBe(true))
  it('rejects dangerous inline style', () => {
    expect(ok('<div style="width:expression(alert(1))">x</div>')).toBe(false)
    expect(ok('<div style="background:url(javascript:alert(1))">x</div>')).toBe(false)
  })
  it('rejects javascript: href', () => expect(ok('<a href="javascript:alert(1)">x</a>')).toBe(false))
  it('rejects a non-image data: src', () => expect(ok('<img src="data:text/html,x">')).toBe(false))
  it('allows a data:image src', () => expect(ok('<img src="data:image/png;base64,AAAA" alt="x">')).toBe(true))
  it('rejects unknown top-level fields', () => expect(parseGeneratedSection({ html: '<p>x</p>', evil: 1 }).ok).toBe(false))
  it('rejects empty html', () => expect(parseGeneratedSection({ html: '  ' }).ok).toBe(false))
})

describe('remapDraft (fingerprint re-anchoring)', () => {
  it('carries an edit across a section move', () => {
    const oldDraft = extractContent(PAGE)
    oldDraft[idOf(oldDraft, 'Welcome')] = { type: 'text', value: 'Hello there' }
    const moved = applySectionOp(PAGE, { op: 'move', index: 0, dir: 'down' })!
    const { draft, carried } = remapDraft(PAGE, oldDraft, moved)
    expect(Object.values(draft).some((e) => e.value === 'Hello there')).toBe(true)
    expect(carried).toBeGreaterThan(0)
  })
  it('drops an edit whose section was deleted (never mis-anchors it)', () => {
    const oldDraft = extractContent(PAGE)
    oldDraft[idOf(oldDraft, 'F1')] = { type: 'text', value: 'EDITED F1' }
    const deleted = applySectionOp(PAGE, { op: 'delete', index: 1 })! // removes the Features band
    const { draft } = remapDraft(PAGE, oldDraft, deleted)
    expect(Object.values(draft).some((e) => e.value === 'EDITED F1')).toBe(false)
  })
})

// ── Repeated items: cards in a grid, links in a nav ─────────────────────────────
const GRID = `<html><body><main>
  <section class="blog"><div class="grid">
    <article class="card"><h3>One</h3><p>a</p></article>
    <article class="card"><h3>Two</h3><p>b</p></article>
    <article class="card"><h3>Three</h3><p>c</p></article>
  </div></section>
</main></body></html>`

const NAV = `<html><body>
  <nav><a href="/">Home</a><a href="/about">About</a><a href="/contact">Contact</a></nav>
  <main><section><h1>Hi</h1></section></main>
</body></html>`

describe('itemEls (repeated-sibling detection)', () => {
  it('detects the cards in a grid (and not their inner text)', () => {
    const items = itemEls(parse(GRID))
    expect(items.map((el) => el.querySelector('h3')!.text)).toEqual(['One', 'Two', 'Three'])
  })
  it('detects nav links as items', () => {
    expect(itemEls(parse(NAV)).map((el) => el.text)).toEqual(['Home', 'About', 'Contact'])
  })
  it('does NOT treat leaf text repeats (several <p>) as items', () => {
    const prose = `<html><body><main><section><p>one</p><p>two</p><p>three</p></section></main></body></html>`
    expect(itemEls(parse(prose))).toHaveLength(0)
  })
  it('does NOT treat top-level sections as items', () => {
    expect(itemEls(parse(PAGE))).toHaveLength(0)
  })
})

describe('applyItemOp', () => {
  it('moves a card to the next position', () => {
    const out = applyItemOp(GRID, { op: 'move', index: 0, dir: 'next' })!
    expect(itemEls(parse(out)).map((el) => el.querySelector('h3')!.text)).toEqual(['Two', 'One', 'Three'])
  })
  it('moving the first card "prev" is a safe no-op', () => {
    const out = applyItemOp(GRID, { op: 'move', index: 0, dir: 'prev' })!
    expect(itemEls(parse(out)).map((el) => el.querySelector('h3')!.text)).toEqual(['One', 'Two', 'Three'])
  })
  it('duplicates a card right after itself', () => {
    const out = applyItemOp(GRID, { op: 'duplicate', index: 2 })!
    expect(itemEls(parse(out)).map((el) => el.querySelector('h3')!.text)).toEqual(['One', 'Two', 'Three', 'Three'])
  })
  it('removes a card', () => {
    const out = applyItemOp(GRID, { op: 'remove', index: 1 })!
    expect(itemEls(parse(out)).map((el) => el.querySelector('h3')!.text)).toEqual(['One', 'Three'])
  })
  it('returns null for an out-of-range index', () => {
    expect(applyItemOp(GRID, { op: 'remove', index: 99 })).toBeNull()
  })
})

describe('item Edit-with-AI helpers', () => {
  it('reads one item’s outer HTML for the AI edit context', () => {
    const h = getItemHtml(GRID, 1)!
    expect(h).toContain('Two')
    expect(h).not.toContain('One')
    expect(h).not.toContain('Three')
  })
  it('replaces an item with new HTML in place', () => {
    const out = replaceItemHtml(GRID, 1, '<article class="card"><h3>Brand New</h3></article>')!
    expect(itemEls(parse(out)).map((el) => el.querySelector('h3')!.text)).toEqual(['One', 'Brand New', 'Three'])
  })
  it('returns null replacing an out-of-range item', () => {
    expect(replaceItemHtml(GRID, 9, '<article class="card"><h3>x</h3></article>')).toBeNull()
  })
})

describe('shared item ops (nav links sync across pages)', () => {
  it('locates a nav link inside its component', () => {
    const loc = sharedItemLocator(NAV, 0)
    expect(loc).toEqual({ tag: 'nav', compIndex: 0, itemIndex: 0 })
  })
  it('reorders a link within the located component', () => {
    const loc = sharedItemLocator(NAV, 0)!
    const out = applyItemOpInComponent(NAV, loc, { op: 'move', index: 0, dir: 'next' })!
    expect(itemEls(parse(out)).map((el) => el.text)).toEqual(['About', 'Home', 'Contact'])
  })
})
