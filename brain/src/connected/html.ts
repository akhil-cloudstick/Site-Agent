import { HTMLElement, NodeType, parse, TextNode } from 'node-html-parser'

import type { ContentMap } from './content'
import { itemEls } from './items'

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
  if (opts.editor) {
    // Stamp repeated items (cards / nav links / button groups) with their index BEFORE text
    // nodes get wrapped below, so the stamped index matches structure.ts's itemEls on the
    // raw source HTML the ops mutate (server-authoritative, no client re-detection).
    // Never let item detection break the whole preview — fall back to no item stamps.
    try {
      ;(itemEls(root) as HTMLElement[]).forEach((el, i) => el.setAttribute('data-sa-item', String(i)))
    } catch {
      /* item stamping is best-effort */
    }
  }
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
  if (opts.editor) {
    // Stamp each real link/button with its index (server-authoritative, same order as the
    // server's linkEls), so deterministic ops target the exact element with no client-side
    // counting that could drift from the server.
    const body = (root.querySelector('body') as HTMLElement) ?? root
    ;(body.querySelectorAll('a, button') as HTMLElement[]).forEach((el, i) => el.setAttribute('data-sa-link', String(i)))
    // Stamp images too, so "Add link" on a bare <img> can target the exact one server-side.
    ;(body.querySelectorAll('img') as HTMLElement[]).forEach((el, i) => el.setAttribute('data-sa-img', String(i)))
  }
  let result = root.toString()
  if (opts.editor) {
    result = result.replace('</body>', `${EDITOR_SCRIPT}${SECTION_SCRIPT}</body>`)
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

  var fab=document.createElement('button');fab.type='button';fab.textContent='\\u22EE';fab.title='Options';fab.setAttribute('data-sa-ui','1');
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
    closeMenu();var m=document.createElement('div');m.id='__sa_menu';m.setAttribute('data-sa-ui','1');
    m.style.cssText='position:fixed;z-index:2147483647;min-width:170px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 10px 28px rgba(0,0,0,.16);padding:4px 0;font:13px system-ui,sans-serif;';
    rows.forEach(function(r){var b=document.createElement('button');b.type='button';b.textContent=r.label;b.style.cssText='display:block;width:100%;text-align:left;padding:8px 14px;border:none;background:none;cursor:pointer;color:#222;font:inherit;';b.addEventListener('mouseenter',function(){b.style.background='#f3f4f6';});b.addEventListener('mouseleave',function(){b.style.background='none';});b.addEventListener('click',function(ev){ev.preventDefault();ev.stopPropagation();closeMenu();r.onClick();});m.appendChild(b);});
    document.body.appendChild(m);m.style.left=Math.max(8,Math.min(x,window.innerWidth-m.offsetWidth-8))+'px';m.style.top=Math.max(8,Math.min(y,window.innerHeight-m.offsetHeight-8))+'px';
  }

  fab.addEventListener('click',function(ev){
    ev.preventDefault();ev.stopPropagation();if(!hovered)return;
    var r=fab.getBoundingClientRect();
    openMenu(r.left,r.bottom+4,blockRows(hovered)); // the one comprehensive menu
  });

  function startTextEdit(el,id){
    if(el.isContentEditable)return;var before=directText(el);
    el.setAttribute('contenteditable','true');el.focus();
    function done(){el.removeAttribute('contenteditable');var after=directText(el);if(after.trim()!==before.trim())post({saEdit:{id:id,kind:'text',value:after.trim()}});el.removeEventListener('blur',done);}
    el.addEventListener('blur',done);
    el.addEventListener('keydown',function(k){if((k.key==='Enter'&&!k.shiftKey)||k.key==='Escape'){k.preventDefault();el.blur();}});
  }

  // Index of a link/button among the page's real a/button (excluding our own editor UI) —
  // matches the server's linkEls ordering, so deterministic ops target the right element.
  function linkIndex(el){
    var a=el&&el.getAttribute&&el.getAttribute('data-sa-link');
    if(a!==null&&a!==undefined&&a!=='')return parseInt(a,10);
    var all=[].slice.call(document.body.querySelectorAll('a,button')).filter(function(x){return !(x.closest&&x.closest('[data-sa-ui]'));});
    return all.indexOf(el);
  }
  // Reorder/duplicate/remove rows for the nearest repeated ITEM (card / nav link / button in
  // a group) that contains refEl — folded into the same ⋮ menu so there's ONE badge + dropdown.
  // Arrow labels follow the live layout (a row → left/right, a column/grid → up/down).
  function itemRows(refEl,includeRemove){
    var it=refEl&&refEl.closest&&refEl.closest('[data-sa-item]');
    if(!it)return [];
    var idx=parseInt(it.getAttribute('data-sa-item'),10);if(isNaN(idx))return [];
    var grp=[].slice.call(document.querySelectorAll('[data-sa-item]')).filter(function(x){return x.parentNode===it.parentNode;});
    var pos=grp.indexOf(it),h=false;
    if(grp.length>1){var a=grp[0].getBoundingClientRect(),b=grp[1].getBoundingClientRect();h=Math.abs(b.left-a.left)>=Math.abs(b.top-a.top);}
    // A human label for this item (its heading, else its text) so the chat message can name it.
    var head=it.querySelector&&it.querySelector('h1,h2,h3,h4,h5,h6');
    var nm=((head?head.textContent:it.textContent)||'').replace(/\\s+/g,' ').trim().slice(0,40);
    var rows=[];
    if(pos>0)rows.push({label:'Move '+(h?'left':'up'),onClick:function(){post({saItem:{op:'move',index:idx,dir:'prev',name:nm,dirLabel:(h?'left':'up')}});}});
    if(pos<grp.length-1)rows.push({label:'Move '+(h?'right':'down'),onClick:function(){post({saItem:{op:'move',index:idx,dir:'next',name:nm,dirLabel:(h?'right':'down')}});}});
    rows.push({label:'Duplicate',onClick:function(){post({saItem:{op:'duplicate',index:idx,name:nm}});}});
    if(includeRemove)rows.push({label:'Remove this',onClick:function(){post({saItem:{op:'remove',index:idx,name:nm}});}});
    return rows;
  }

  function itemName(it){var hd=it.querySelector&&it.querySelector('h1,h2,h3,h4,h5,h6');return((hd?hd.textContent:(it.textContent||''))||'').replace(/\\s+/g,' ').trim().slice(0,40);}
  // The link this element "owns": el if it IS a link, or a small link wrapping essentially just
  // this editable (a button / nav link / icon) — NOT a big card-link wrapping many things.
  function ownLink(el){var l=el.closest&&el.closest('a,button');if(!l||(l.getAttribute&&l.getAttribute('data-sa-ui')))return null;if(l===el)return l;return l.querySelectorAll('[data-sa-id]').length<=1?l:null;}
  // The repeated item this element "owns": el if it IS the item, or its item if that item is a
  // LEAF (el is basically the whole item — an icon / nav link). A composite card's inner text
  // does NOT own the card (the card gets its own badge), so it shows content options only.
  function ownItem(el){if(el.getAttribute&&el.getAttribute('data-sa-item')!==null)return el;var it=el.closest&&el.closest('[data-sa-item]');return it&&it.querySelectorAll('[data-sa-id]').length<=1?it:null;}

  // The menu for the hovered element, SCOPED to what it actually is: text/image content gets
  // edit options; a link gets link options; a card/icon/nav-item gets item options. So a
  // card's text never shows "move/duplicate the card" — the card's own badge does.
  function blockRows(el){
    var rows=[];
    var id=el.getAttribute('data-sa-id'),kind=el.getAttribute('data-sa-kind');
    var L=ownLink(el),I=ownItem(el);
    // 1) content edit (only for the editable itself)
    if(id&&kind==='image')rows.push({label:'Change image',onClick:function(){post({saEdit:{id:id,kind:'image'}});}});
    else if(id)rows.push({label:'Edit text',onClick:function(){startTextEdit(el,id);}});
    // 2) Edit with AI — the whole item if this is one, else the text
    if(I){var iidx=parseInt(I.getAttribute('data-sa-item'),10),inm=itemName(I);rows.push({label:'Edit with AI',onClick:function(){post({saItemAi:{index:iidx,name:inm}});}});}
    else if(id&&kind!=='image')rows.push({label:'Edit with AI',onClick:function(){post({saAi:{id:id,kind:'text',value:directText(el).trim()}});}});
    // 3) link options (set/redirect, add after) — only for an owned link
    if(L){var idx=linkIndex(L),lname=((L.textContent||'').replace(/\\s+/g,' ').trim()).slice(0,40);
      rows.push({label:'Set link / redirect\\u2026',onClick:function(){post({saSetLink:{index:idx,href:L.getAttribute('href')||'',name:lname}});}});
      rows.push({label:'Add a link/button after this',onClick:function(){post({saAddAfter:{index:idx,name:lname}});}});}
    else if(kind==='image'&&el.getAttribute('data-sa-img')!==null){var ii=parseInt(el.getAttribute('data-sa-img'),10);rows.push({label:'Add link\\u2026',onClick:function(){post({saLinkImage:{imgIndex:ii}});}});}
    // 4) item reorder/duplicate/remove — only for an owned item; else a plain link gets Remove
    if(I)rows=rows.concat(itemRows(I,true));
    else if(L){var idx2=linkIndex(L),lname2=((L.textContent||'').replace(/\\s+/g,' ').trim()).slice(0,40);rows.push({label:'Remove this',onClick:function(){post({saRemoveEl:{index:idx2,name:lname2}});}});}
    return rows;
  }

  // The MOST SPECIFIC editable / item / link under the pointer: an editable text/image if we're
  // on one, else the repeated item (card / icon / nav link), else a standalone link or button
  // (a lone icon-link or a clickable card that isn't a repeated item — still gets Set link /
  // Remove etc.). This scopes the menu — a card's text gets text options, the card its own.
  function hoverTarget(t){
    if(!t||!t.closest)return null;
    var ed=t.closest('[data-sa-id]');if(ed)return ed;
    var item=t.closest('[data-sa-item]');if(item)return item;
    var lk=t.closest('a,button');if(lk&&!(lk.getAttribute&&lk.getAttribute('data-sa-ui')))return lk; // lone icon-link / clickable card
    return null;
  }
  // An editable's resting outline is the subtle DASH (a "you can edit this" cue); everything
  // else has none. The HOVERED element gets the SOLID focus ring — one at a time.
  function baseOutline(el){return el&&el.getAttribute&&el.getAttribute('data-sa-id')!==null?DASH:'';}
  function applyHover(el){
    if(el===hovered)return;
    if(hovered&&hovered.style)hovered.style.outline=baseOutline(hovered); // restore the last one's resting state
    hovered=el;if(el&&el.style){el.style.outline=SOLID;el.style.outlineOffset='2px';}
    place();
  }
  // End the current hover WITHOUT orphaning its ring (used on scroll / click-away). Forgetting
  // to clear here was what left multiple solid rings stuck on the page.
  function clearHover(){if(hovered&&hovered.style)hovered.style.outline=baseOutline(hovered);hovered=null;place();}
  // HOVER-INTENT: switch the badge to a new element only once the pointer SETTLES on it (~150ms).
  // So a pointer travelling from a text to its slightly-offset ⋮ badge — crossing the card or a
  // sibling on the way — never steals the badge before you can click it (badge position unchanged).
  var hoverTimer=null;
  document.addEventListener('mouseover',function(e){
    if(!active)return;
    if(e.target&&e.target.closest&&e.target.closest('[data-sa-ui]')){clearTimeout(hoverTimer);return;} // on our badge/menu → keep current, cancel pending switch
    clearTimeout(hoverTimer);
    var el=hoverTarget(e.target);
    if(!el||el===hovered)return; // empty space / same element → keep the current badge
    if(!hovered){applyHover(el);return;} // nothing shown yet → show immediately
    hoverTimer=setTimeout(function(){applyHover(el);},150); // moving → only switch once the pointer settles
  });

  function setActive(on){
    active=on;
    if(on){
      // Editables get the subtle dashed cue; the hovered one gets the solid ring (applyHover).
      items.forEach(function(el){el.style.outline=DASH;el.style.outlineOffset='2px';if(getComputedStyle(el).cursor==='auto')el.style.cursor='pointer';});
    } else {
      // Edit mode OFF → remove EVERY focus ring we set (editables, the hovered card/link, any
      // straggler), so nothing lingers on the page. Outlines are only ever set by us inline.
      [].slice.call(document.querySelectorAll('[style*="outline"]')).forEach(function(el){el.style.outline='';el.style.outlineOffset='';});
      hovered=null;closeMenu();
    }
    place();
  }
  window.addEventListener('message',function(e){if(e.data&&typeof e.data.saEditMode==='boolean')setActive(e.data.saEditMode);});
  // On scroll: dismiss the open menu AND hide the ⋮ badge (it reappears on the next hover).
  window.addEventListener('scroll',function(){closeMenu();clearHover();},true);
  window.addEventListener('resize',place);

  // One capture-phase click handler for the whole page.
  //  - EDIT MODE ON: the page is INERT — clicking a link/button/card never navigates or
  //    fires the site's own handlers (the user is clicking to EDIT, not to browse).
  //    Clicking an editable item starts its text/image edit; clicks on our own editor UI
  //    pass through. (Page switching is still available via the workspace's page tabs.)
  //  - EDIT MODE OFF: same-origin link clicks are handed to the parent for a smooth
  //    crossfade page switch; everything else behaves normally.
  document.addEventListener('click',function(e){
    var t=e.target;
    // Our own editor UI (the ⋮ button + its menu + section toolbars) always works.
    if(t&&t.closest&&t.closest('[data-sa-ui]'))return;

    if(active){
      var item=t&&t.closest&&t.closest('[data-sa-id]');
      if(item&&item.isContentEditable)return; // typing — let clicks place the caret
      // Block navigation AND the site's own click handlers while editing.
      e.preventDefault();e.stopPropagation();if(e.stopImmediatePropagation)e.stopImmediatePropagation();
      // Clicking does the DIRECT edit (text inline / image picker). All menus — link, item,
      // reorder, AI — come ONLY from the ⋮ badge (one dropdown), so clicking a card/link no
      // longer opens a second menu.
      if(item){
        var id=item.getAttribute('data-sa-id'),kind=item.getAttribute('data-sa-kind');
        if(kind==='image')post({saEdit:{id:id,kind:'image'}});else startTextEdit(item,id);
        return;
      }
      // Clicked empty / non-editable space → dismiss the menu and the ⋮ badge.
      closeMenu();clearHover();
      return;
    }

    // Edit mode off → intercept same-origin links for the parent's crossfade page switch.
    var a=t&&t.closest&&t.closest('a[href]');
    if(!a)return;
    if(a.target&&a.target!=='_self')return;
    var href=a.getAttribute('href')||'';
    if(!href||href.charAt(0)==='#'||/^(mailto:|tel:|javascript:)/i.test(href))return;
    var url;try{url=new URL(a.href,location.href);}catch(_){return;}
    if(url.origin!==location.origin)return;
    if(url.pathname===location.pathname){if(url.hash)return;} // same page (maybe #anchor) — leave it
    e.preventDefault();
    post({saNav:url.pathname});
  },true);
})();</script>`

/**
 * Section-structure controls (separate IIFE so the text-edit script above is untouched).
 * In edit mode each top-level band gets a single "⋮" badge (same pattern as the block
 * builder); clicking it opens a menu — Move up / Move down / Add section here / Delete —
 * which posts {saSection:{op,index,dir}} / {saAddSection:{index}} to the parent. Index =
 * the band's position among VISIBLE top-level children (same rule as detectSections), so
 * the parent's structure call lines up exactly.
 */
const SECTION_SCRIPT = `<script>(function(){
  function post(m){parent.postMessage(m,'*');}
  var SKIP={SCRIPT:1,STYLE:1,LINK:1,NOSCRIPT:1,TEMPLATE:1,BASE:1,META:1,TITLE:1,HEAD:1};
  var DOTS='<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="3" r="1.5"></circle><circle cx="8" cy="8" r="1.5"></circle><circle cx="8" cy="13" r="1.5"></circle></svg>';
  function keep(el){return !SKIP[el.tagName]&&!(el.getAttribute&&el.getAttribute('data-sa-ui'));}
  // Flatten <main>'s children together with body-level header/nav/footer siblings, so the
  // nav and footer are editable bands too — matching the server's detectSections exactly.
  function sections(){
    var body=document.body, kids=[].slice.call(body.children), main=null;
    for(var k=0;k<kids.length;k++){if(kids[k].tagName==='MAIN'){main=kids[k];break;}}
    var out=[];
    kids.forEach(function(child){
      if(!keep(child))return;
      if(child===main){[].slice.call(child.children).forEach(function(gc){if(keep(gc))out.push(gc);});}
      else out.push(child);
    });
    return out;
  }
  var active=false, badges=[];
  function closeMenu(){var m=document.getElementById('__sa_secmenu');if(m)m.remove();}
  document.addEventListener('click',function(e){var t=e.target;if(t&&t.closest&&t.closest('#__sa_secmenu'))return;if(t&&t.closest&&t.closest('[data-sa-secbadge]'))return;closeMenu();},true);
  // Matches the block builder's KebabMenu styling exactly (badge + menu + rows).
  function openMenu(rect,i,total){
    closeMenu();
    // A label for this section (its heading) so the chat message can name it.
    var sec=(badges[i]&&badges[i].el)||null, hd=sec&&sec.querySelector&&sec.querySelector('h1,h2,h3,h4,h5,h6');
    var nm=((hd?hd.textContent:'')||'').replace(/\\s+/g,' ').trim().slice(0,40);
    var m=document.createElement('div');m.id='__sa_secmenu';m.setAttribute('data-sa-ui','1');
    m.style.cssText='position:fixed;z-index:2147483647;min-width:180px;background:#fff;border-radius:8px;border:1px solid #e5e7eb;box-shadow:0 10px 28px rgba(0,0,0,0.16);padding:4px 0;font:13px system-ui,-apple-system,sans-serif;';
    function row(label,fn,danger){var b=document.createElement('button');b.type='button';b.textContent=label;b.style.cssText='display:block;width:100%;text-align:left;padding:7px 14px;font-size:13px;border:none;background:transparent;color:'+(danger?'#b42318':'#1f2937')+';cursor:pointer;white-space:nowrap;font-family:inherit;';b.addEventListener('mouseenter',function(){b.style.background='#f3f4f6';});b.addEventListener('mouseleave',function(){b.style.background='transparent';});b.addEventListener('click',function(ev){ev.preventDefault();ev.stopPropagation();closeMenu();fn();});m.appendChild(b);}
    row('Edit with AI',function(){post({saSectionAi:{index:i}});});
    row('Add a button',function(){post({saAddButton:{sectionIndex:i}});});
    if(i>0)row('Move up',function(){post({saSection:{op:'move',index:i,dir:'up',name:nm}});});
    if(i<total-1)row('Move down',function(){post({saSection:{op:'move',index:i,dir:'down',name:nm}});});
    row('Add section here',function(){post({saAddSection:{index:i}});});
    row('Delete section',function(){post({saSection:{op:'delete',index:i,name:nm}});},true);
    document.body.appendChild(m);
    var left=Math.min(rect.right-m.offsetWidth, window.innerWidth-m.offsetWidth-8);
    var top=Math.min(rect.bottom+4, window.innerHeight-m.offsetHeight-8);
    m.style.left=Math.max(8,left)+'px';m.style.top=Math.max(8,top)+'px';
  }
  function mkBadge(i){
    var b=document.createElement('button');b.type='button';b.title='Options';b.innerHTML=DOTS;
    b.setAttribute('data-sa-ui','1');b.setAttribute('data-sa-secbadge','1');
    b.style.cssText='position:fixed;display:none;align-items:center;justify-content:center;z-index:2147483646;width:28px;height:28px;border-radius:6px;border:1px solid rgba(0,0,0,0.08);background:rgba(255,255,255,0.96);color:#475467;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.12);padding:0;';
    b.addEventListener('click',function(ev){ev.preventDefault();ev.stopPropagation();openMenu(b.getBoundingClientRect(),i,badges.length);});
    return b;
  }
  function clear(){closeMenu();badges.forEach(function(x){if(x.badge.parentNode)x.badge.parentNode.removeChild(x.badge);});badges=[];}
  function build(){clear();sections().forEach(function(el,i){var badge=mkBadge(i);document.body.appendChild(badge);badges.push({el:el,badge:badge});});}
  function place(){
    if(!active){badges.forEach(function(x){x.badge.style.display='none';});return;}
    badges.forEach(function(x){
      var r=x.el.getBoundingClientRect();
      if(r.bottom<10||r.top>window.innerHeight-10){x.badge.style.display='none';return;}
      x.badge.style.display='inline-flex';
      x.badge.style.left=Math.max(2,Math.min(r.right-36,window.innerWidth-32))+'px';
      x.badge.style.top=Math.max(2,Math.min(r.top+8,window.innerHeight-32))+'px';
    });
  }
  function setActive(on){active=on;if(on)build();else clear();
    sections().forEach(function(el){el.style.outline=on?'1px dashed rgba(16,185,129,.45)':'';el.style.outlineOffset=on?'-1px':'';});
    place();
  }
  window.addEventListener('message',function(e){if(e.data&&typeof e.data.saEditMode==='boolean')setActive(e.data.saEditMode);});
  window.addEventListener('scroll',function(){closeMenu();place();},true);window.addEventListener('resize',place);
})();</script>`

// (Item reorder/duplicate/remove now lives INSIDE the editor's single ⋮ menu — see
// `itemRows` in EDITOR_SCRIPT — so each card/block has one badge and one dropdown.)
