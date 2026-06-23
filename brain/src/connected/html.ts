import { HTMLElement, NodeType, parse, TextNode } from 'node-html-parser'

import type { ContentMap } from './content'

/**
 * Find and edit the content of a built static HTML page — at the TEXT-NODE level.
 *
 * Each non-whitespace text node is its own editable piece, so split/styled text like
 * `Powering <span class="accent">the AI era</span> built to last` edits piece by piece
 * (`[Powering] [the AI era] [built to last]`) with the coloured span preserved. Editing
 * is IN PLACE (TextNode.rawText) — the page is never re-serialised, so order, spacing,
 * comments and structure stay exactly as built. The same walk powers EXTRACT and APPLY,
 * so an item's id (`auto:<n>` by document order, or a `data-sa` marker key) is computed
 * identically each pass.
 */

const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'svg', 'head', 'title', 'meta', 'link'])
const escapeHtml = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string)
const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

interface Editable {
  id: string
  kind: 'text' | 'image'
  textNode?: TextNode // text edits mutate this in place
  el?: HTMLElement // images (and data-sa-marked elements)
}

const tagOf = (el: HTMLElement) => (el.rawTagName || '').toLowerCase()
const isText = (n: unknown): n is TextNode => (n as { nodeType?: number })?.nodeType === NodeType.TEXT_NODE

/** Collect every non-whitespace text node inside a marked element (document order),
 *  keyed by the marker: the first piece keeps the plain key, extra pieces get `key:1`,
 *  `key:2`… So `<h1 data-sa="text:hero.heading">A <span>B</span> C</h1>` → 3 editables. */
function collectMarkedText(el: HTMLElement, key: string): Editable[] {
  const out: Editable[] = []
  const rec = (node: HTMLElement) => {
    for (const child of node.childNodes) {
      if (isText(child)) {
        if (child.text.trim().length > 0) out.push({ id: out.length === 0 ? key : `${key}:${out.length}`, kind: 'text', textNode: child })
      } else if (child instanceof HTMLElement && !SKIP_TAGS.has(tagOf(child))) {
        rec(child)
      }
    }
  }
  rec(el)
  return out
}

/**
 * Walk the page body in order, yielding each editable piece with its stable id:
 *  - a `data-sa="text:key"` element → one editable per text piece (`key`, `key:1`, …),
 *  - a `data-sa="image:key"` element → an image editable by its key,
 *  - an `<img>` → an image editable,
 *  - otherwise every non-whitespace TEXT NODE → its own text editable (`auto:<n>`).
 * Only the <body> is walked, so the doctype/<head>/<title> are never content. Comments
 * and skip-tag subtrees are ignored.
 */
function walkEditables(root: HTMLElement): Editable[] {
  const found: Editable[] = []
  let auto = 0
  const visit = (node: HTMLElement) => {
    for (const child of node.childNodes) {
      if (isText(child)) {
        if (child.text.trim().length > 0) found.push({ id: `auto:${auto++}`, kind: 'text', textNode: child })
        continue
      }
      if (!(child instanceof HTMLElement)) continue // comments, etc.
      if (SKIP_TAGS.has(tagOf(child))) continue
      const marker = child.getAttribute('data-sa')
      if (marker) {
        const [kind, ...rest] = marker.split(':')
        const key = rest.join(':')
        if (key && kind === 'text') found.push(...collectMarkedText(child, key))
        else if (key && kind === 'image') found.push({ id: key, kind: 'image', el: child })
        continue // a marked element is handled whole — don't descend again
      }
      if (tagOf(child) === 'img') {
        found.push({ id: `auto:${auto++}`, kind: 'image', el: child })
        continue
      }
      visit(child)
    }
  }
  visit(root.querySelector('body') ?? root)
  return found
}

const currentValue = (e: Editable): string =>
  e.kind === 'image' ? e.el?.getAttribute('src') || '' : (e.textNode?.text || '').trim()

/** Set a text node's value IN PLACE, preserving its original surrounding whitespace
 *  (so spacing between pieces — e.g. `with ` + `high-density` — is never lost). */
function setTextInPlace(node: TextNode, value: string) {
  const orig = node.rawText
  const lead = orig.match(/^\s*/)?.[0] ?? ''
  const trail = orig.match(/\s*$/)?.[0] ?? ''
  node.rawText = lead + escapeHtml(value) + trail
}

/** PREVIEW only: wrap a text node in a `<span data-sa-id>` IN PLACE (no re-parse, same
 *  index → no reorder) so each text piece is individually clickable in the editor. */
function wrapTextNode(node: TextNode, id: string) {
  const parent = node.parentNode
  if (!parent) return
  const span = parse(`<span data-sa-id="${escapeAttr(id)}" data-sa-kind="text"></span>`).firstChild as HTMLElement
  parent.exchangeChild(node, span)
  span.appendChild(node)
}

/** Read the current editable content out of a built HTML page → a content map. */
export function extractContent(html: string): ContentMap {
  const root = parse(html, { comment: true })
  const out: ContentMap = {}
  for (const e of walkEditables(root)) {
    // First occurrence of an id wins (marker keys should be unique per page).
    if (!(e.id in out)) out[e.id] = { type: e.kind, value: currentValue(e) }
  }
  return out
}

/**
 * Rewrite root-absolute asset URLs (href/src/srcset starting with "/") to sit under
 * a prefix — needed only for the PREVIEW, which is served at /connected/<id>/… so the
 * browser would otherwise look for /_astro/… at the site root and miss it. Run BEFORE
 * applying content, so an edited <img>'s new (media) URL is left untouched.
 */
function rewriteAssetUrls(root: HTMLElement, prefix: string) {
  const fix = (u: string) => (u && u.startsWith('/') && !u.startsWith('//') ? prefix + u : u)
  const fixSrcset = (s: string) =>
    s
      .split(',')
      .map((part) => {
        const [u, ...rest] = part.trim().split(/\s+/)
        return [fix(u), ...rest].join(' ')
      })
      .join(', ')
  for (const el of root.querySelectorAll('[href],[src],[srcset]')) {
    const href = el.getAttribute('href')
    if (href) el.setAttribute('href', fix(href))
    const src = el.getAttribute('src')
    if (src) el.setAttribute('src', fix(src))
    const srcset = el.getAttribute('srcset')
    if (srcset) el.setAttribute('srcset', fixSrcset(srcset))
  }
}

/**
 * Apply a content map onto a built HTML page (set text / swap <img src>), and
 * optionally inject the in-workspace editor (tags each editable with data-sa-id
 * and adds the click-to-edit script). `assetPrefix` rewrites the page's own asset
 * links for the preview (see rewriteAssetUrls). Returns the new HTML.
 */
export function applyContent(html: string, content: ContentMap, opts: { editor?: boolean; assetPrefix?: string } = {}): string {
  const root = parse(html, { comment: true })
  if (opts.assetPrefix) rewriteAssetUrls(root, opts.assetPrefix)
  for (const e of walkEditables(root)) {
    const entry = content[e.id]
    if (e.kind === 'image' && e.el) {
      if (entry) e.el.setAttribute('src', entry.value)
      if (opts.editor) {
        e.el.setAttribute('data-sa-id', e.id)
        e.el.setAttribute('data-sa-kind', 'image')
      }
    } else if (e.kind === 'text' && e.textNode) {
      if (entry) setTextInPlace(e.textNode, entry.value)
      // Wrap for click-to-edit in the preview only; publish keeps the raw structure.
      if (opts.editor) wrapTextNode(e.textNode, e.id)
    }
  }
  let result = root.toString()
  if (opts.editor) {
    result = result.replace('</body>', `${EDITOR_SCRIPT}</body>`)
  }
  return result
}

/**
 * Injected into the preview. Edit mode is toggled by the parent via a postMessage
 * ({saEditMode:bool}) — NO page reload — so the toggle is smooth. When on, editable
 * items get a dashed outline and a single floating "⋮" (appended to <body>, so it is
 * never clipped by overflow). Text edits inline (only the element's own text, so icons
 * survive); images / "Edit with AI" post to the parent. When off, the page is a normal,
 * fully-clickable preview.
 */
const EDITOR_SCRIPT = `<script>(function(){
  function post(m){parent.postMessage(m,'*');}
  function directText(el){var t='';el.childNodes.forEach(function(n){if(n.nodeType===3)t+=n.textContent;});return t;}
  var DASH='1px dashed rgba(37,99,235,.5)', SOLID='2px solid #2563eb';
  var active=false, hovered=null;
  var items=[].slice.call(document.querySelectorAll('[data-sa-id]'));

  var fab=document.createElement('button');fab.type='button';fab.textContent='\\u22EE';fab.title='Options';
  fab.style.cssText='position:fixed;display:none;z-index:2147483646;width:24px;height:24px;border-radius:6px;border:1px solid rgba(0,0,0,.12);background:#fff;color:#475467;cursor:pointer;font-size:14px;line-height:1;padding:0;box-shadow:0 1px 4px rgba(0,0,0,.3);';
  document.body.appendChild(fab);
  function place(){
    if(!(active&&hovered)){fab.style.display='none';return;}
    var r=hovered.getBoundingClientRect();
    // Sit just ABOVE the block's top-right corner, OUTSIDE the box (never on top of it).
    // If there's no room above (block hugs the top), sit on the RIGHT side instead —
    // outside the box, never below it.
    var top,left;
    if(r.top<30){
      left=r.right+4;          // right side, outside the box
      top=Math.max(2,r.top);
    } else {
      left=r.right-24;         // top-right corner
      top=r.top-28;            // above the box, outside
    }
    left=Math.min(left,window.innerWidth-28);
    fab.style.left=Math.max(2,left)+'px';fab.style.top=Math.max(2,top)+'px';fab.style.display='block';
  }

  function closeMenu(){var m=document.getElementById('__sa_menu');if(m)m.remove();}
  document.addEventListener('click',function(e){var t=e.target;if(t!==fab&&!(t&&t.closest&&t.closest('#__sa_menu')))closeMenu();},true);
  function openMenu(x,y,rows){
    closeMenu();var m=document.createElement('div');m.id='__sa_menu';
    m.style.cssText='position:fixed;z-index:2147483647;min-width:170px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 10px 28px rgba(0,0,0,.16);padding:4px 0;font:13px system-ui,sans-serif;';
    rows.forEach(function(r){var b=document.createElement('button');b.type='button';b.textContent=r.label;b.style.cssText='display:block;width:100%;text-align:left;padding:8px 14px;border:none;background:none;cursor:pointer;color:#222;font:inherit;';b.addEventListener('mouseenter',function(){b.style.background='#f3f4f6';});b.addEventListener('mouseleave',function(){b.style.background='none';});b.addEventListener('click',function(ev){ev.preventDefault();ev.stopPropagation();closeMenu();r.onClick();});m.appendChild(b);});
    document.body.appendChild(m);m.style.left=Math.max(8,Math.min(x,window.innerWidth-m.offsetWidth-8))+'px';m.style.top=Math.max(8,Math.min(y,window.innerHeight-m.offsetHeight-8))+'px';
  }

  fab.addEventListener('click',function(ev){
    ev.preventDefault();ev.stopPropagation();if(!hovered)return;
    var el=hovered,id=el.getAttribute('data-sa-id'),kind=el.getAttribute('data-sa-kind'),r=fab.getBoundingClientRect();
    var rows=kind==='image'?[{label:'Change image',onClick:function(){post({saEdit:{id:id,kind:'image'}});}}]
      :[{label:'Edit with AI',onClick:function(){post({saAi:{id:id,kind:'text',value:directText(el).trim()}});}}];
    openMenu(r.left,r.bottom+4,rows);
  });

  function startTextEdit(el,id){
    if(el.isContentEditable)return;var before=directText(el);
    el.setAttribute('contenteditable','true');el.focus();
    function done(){el.removeAttribute('contenteditable');var after=directText(el);if(after.trim()!==before.trim())post({saEdit:{id:id,kind:'text',value:after.trim()}});el.removeEventListener('blur',done);}
    el.addEventListener('blur',done);
    el.addEventListener('keydown',function(k){if((k.key==='Enter'&&!k.shiftKey)||k.key==='Escape'){k.preventDefault();el.blur();}});
  }

  items.forEach(function(el){
    var id=el.getAttribute('data-sa-id'),kind=el.getAttribute('data-sa-kind');
    el.addEventListener('mouseenter',function(){if(active){hovered=el;el.style.outline=SOLID;place();}});
    el.addEventListener('mouseleave',function(){if(active&&!el.isContentEditable)el.style.outline=DASH;});
    el.addEventListener('click',function(ev){if(!active||el.isContentEditable)return;ev.preventDefault();ev.stopPropagation();if(kind==='image')post({saEdit:{id:id,kind:'image'}});else startTextEdit(el,id);});
  });

  function setActive(on){
    active=on;
    items.forEach(function(el){el.style.outline=on?DASH:'';el.style.outlineOffset='2px';if(on&&getComputedStyle(el).cursor==='auto')el.style.cursor='pointer';});
    if(!on){hovered=null;closeMenu();}
    place();
  }
  window.addEventListener('message',function(e){if(e.data&&typeof e.data.saEditMode==='boolean')setActive(e.data.saEditMode);});
  window.addEventListener('scroll',place,true);
  window.addEventListener('resize',place);
})();</script>`
