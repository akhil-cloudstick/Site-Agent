# Changelog

## 2026-06-26

**`3:30 PM`** — Phase 4 (admin/operator) + Phase 5 (polish) shipped
- **Suspend / resume a tenant** — operators can pause an account from the dashboard or its detail page. A suspended member is **sent to the sign-in page**, and a login attempt is **rejected with "Your account has been suspended"** (just like a wrong password — the session cookie is never set); impersonation stays blocked. Resume restores access.
- **Remove a tenant** — a typed-slug-confirmed deletion that cascades sites, pages, changesets, media, jobs and error logs plus the local site folders, with an **opt-in checkbox** to also delete the Cloudflare project (default off — leaves the live site up) and a **"Suspend instead"** softer path.
- **Plan label** — set a free-text plan ("Free"/"Pro"…) per tenant; shown on the dashboard + detail.
- **Usage (light)** — each tenant's detail shows live totals + last-30-day counts (publishes, media + storage MB, tasks done/failed, errors), every card with a hover tooltip explaining it. (Fixed a wrong metric: "Publishes" counted *published changesets* — always 0 — and now counts real publish jobs.)
- **Per-model usage** — `/admin/settings` shows a **progress bar per model** (share of calls) with call / fail / token counts, recorded after each AI call (OpenRouter's token usage is no longer discarded); a "reset usage" link zeroes it. A live **Active / No-API-key / No-model** status badge shows whether the agent is configured (persists across refresh).
- **Error log** — a new **/admin/errors** page lists every failure a tenant hit — *what they tried (with a plain-English description) and why it failed* — **merging logged failures (connect, publish, page-create, AI overload, …) with failed background tasks** (connect/publish/delete jobs, including older ones), newest first. Each tenant's detail page shows its recent errors.
- **Real AI progress streaming** — the chat no longer shows a fake timed status; both chat routes stream the **actual** backend stages (Thinking → Asking the AI → Applying → Updating → Done) as the work happens.
- **Responsive layout** — on narrow screens both editors collapse the side-by-side split to **Chat ⇄ Preview tabs** (splitter hidden, chat full-width); the admin gets a **sticky full-height sidebar** that collapses to a top bar on mobile + horizontally scrollable tables.
- _Schema:_ one batched migration (`20260626_092541_phase4_admin`) added `planLabel` and the `modelUsage` + `errorLogs` tables. Telemetry (`logTenantError`, `recordModelUsage`) is best-effort and never breaks a request.

**`2:10 PM`** — connected sites: nav add AND remove now sync across desktop + mobile (the real path)
- The earlier nav-sync fix lived in `applyElementOp`, but a nav link is a **shared component**, so the live route actually goes through `applyElementOpInComponent` (element path) / `applyItemOpInComponent` (item path) — which **never called the sync**. That's why, even after a dev-server restart, a new button (`testButton`) still only hit the desktop bar and a removed button stayed in the hamburger.
- Centralised the menu sync into one helper and wired it into **both** shared paths, for **add AND remove**: adding a nav link fills every menu list (desktop + mobile drawer); **removing one now clears it from every menu list too** (it previously only removed the clicked copy). The logo/CTA are still never touched (shape detection); removal matches by `href` and skips the logo so removing "Home" never deletes the brand logo.
- Verified end-to-end via the real `sharedComponentLocator → applyElementOpInComponent` and `sharedItemLocator → applyItemOpInComponent` paths, plus add-then-remove round-trips.

**`1:05 PM`** — connected sites: a new nav link now appears in the MOBILE menu too
- A responsive site renders its nav twice — a desktop bar **and** a separate mobile/hamburger drawer, each its own `<ul>`. Adding a nav link only filled one, so a new page (e.g. "products") showed in the desktop bar but was **missing from the hamburger menu**.
- **Root cause:** the menu-link detector flagged a link as a "CTA button" by class keywords including `rounded` — but Tailwind sites put **`rounded-md` on every menu link**, so *all* links were misread as CTAs and **no menu list qualified** → the mobile list got nothing (and even the desktop add fell back to a single positional insert). Replaced the brittle keyword check with **class-SHAPE detection**: menu links are the ones sharing a list's common class signature; the **logo** (it wraps an image/svg) and the odd-shaped **CTA** drop out on their own — no hardcoded keywords, works on any site (same philosophy as the highlight fix).
- Now adding a link finds **every** menu list and adds it to each in that list's own styling; it's **self-healing & dedup-aware** (a menu that already links there isn't duplicated), and works on the path you actually use — **"Add link after this"**.
- **To fix your current "products":** open the page, click the desktop **products** nav button's ⋮ → **Add link after this** → set the text to "products" and choose the products page again. It won't duplicate on desktop and will drop into the mobile menu. (Or remove it and re-add — same result.)

**`10:15 AM`** — connected chat: every action shows the request bubble, not just the reply
- Deterministic edits (add/remove a button, set link / redirect, add a link after, link an image, move/duplicate/remove a card, move/delete a section) now echo a **"you" request bubble** before the buffering skeleton + result — matching the AI "Add a section" flow. Previously these jumped straight to the reply, so the chat looked one-sided. `elementOp` takes a request message (all call sites updated); the item + section handlers emit one too.

**`09:55 AM`** — connected sites: nav highlights the current page on ANY site, incl. AI-built pages
- A **global, render-time** normaliser makes the nav highlight only the page you're on — for every connected site, never by editing stored HTML, and **without knowing the site's class names**. It anchors on the standard **`aria-current="page"`** to learn the site's *own* active vs inactive menu-link class **strings**, then re-applies those whole strings (current link → active + `aria-current`; other menu links → inactive). Whole-string copy preserves the site's **exact styling/shape** (the earlier attempt guessed individual classes and grabbed a shape class → broke the rounded boxes; gone). The **logo and CTA are excluded by class-shape**.
- **Fix for AI-built pages specifically:** an AI-generated page can end up with **no `aria-current` and no active link at all**, so it had nothing to anchor on and stayed un-highlighted (while a manually-added page, which inherited a real active link from the page it cloned, worked). Now the active/inactive styles are **learned ONCE from whichever page still has the anchor** (`detectNavStyles`) and applied to **every** page — so a page that lost its anchor (AI-built, or cloned by the editor) now highlights its own link correctly too. Applied in preview and on publish; stored markup untouched.

## 2026-06-25

**`11:55 PM`** — connected editor: one solid focus ring at a time; nav highlighting left to the site
- **Editables keep the subtle dashed cue; only ONE solid focus ring shows at a time.** The dashed "you can edit this" outline is back (it's useful), and the bright solid ring follows only the hovered element. The "multiple stuck rings" bug is fixed: **scroll / click-away now clears the ring** instead of orphaning it (forgetting that left a solid ring on every element you'd hovered). Turning **edit mode off clears everything**; published sites never show rings.
- **Nav highlighting is now left to the connected site itself (no guessing).** An earlier attempt auto-detected the "active" class and re-applied it per page — but on a site that highlights with a bespoke class, that guess grabbed a styling class and changed the nav's *shape/layout*. Reverted entirely: SiteAgent **never detects or re-applies** a site's highlight class, at preview or publish, so different sites keep their own behaviour. The only nav touch-up is **standard cleanup on a CLONE** — a newly added link or a newly cloned page has `aria-current` and the conventional `active`/`current`/`selected` classes stripped so it doesn't inherit "I'm the current page." A site's own CSS/JS highlighting is untouched. _(Heal an already-polluted link/page by removing & re-adding it; that re-clones it clean.)_
- **Nav-link rename now propagates to pages added later.** A page created *after* you renamed a nav button cloned the **old** label (clones came from the raw stored HTML, which a rename only updates in the draft layer). New pages now clone from the source page **with current edits applied**, so renamed labels (and swapped images/text) carry over. _(An already-stale label on an existing page: click it and rename once to re-sync.)_

**`11:30 PM`** — connected editor: badge reachability + more cards/icons editable + chat auto-scroll
- **The ⋮ badge no longer slips away when you reach for it.** It sits just outside an element, so moving the pointer to click it used to cross the card/a sibling and steal the hover. Now it uses **hover-intent** — it only switches to a new element once the pointer *settles* (~150ms), so a pointer travelling to the badge keeps it put (badge positions unchanged).
- **Varied card grids are now fully detected.** A bento/feature grid that mixes classes (`card`, `card large`, `card wide`) only showed badges on the identical cards; now siblings that **share any class** group together, so **every** card gets a badge — and hovering its icon falls back to the card's **Edit with AI** (which can change the icon).
- **Lone icon-links / clickable cards get a menu.** The badge now also targets a standalone `<a>`/`<button>` (a single social icon, an icon button, a clickable card that isn't part of a grid) — Set link · Add after · Remove (+ reorder/duplicate when it's in a group).
- **Chat sticks to the bottom.** The chat (connected editor **and** builder) now auto-scrolls to the latest message on load and whenever a reply or the buffering skeleton appears — no more scrolling down to find the response.

**`11:00 PM`** — ✅ Phase 2 fully complete — builder gallery/FAQ/pricing/logos + connected follow-ups
- **Four new builder section types** ("Create from scratch"): **Gallery** (image grid + captions), **FAQ** (question/answer list), **Pricing** (plan cards — price, period, per-line features, "highlight recommended", CTA), and **Logos** (logo strip). Each is a proper typed block: structured fields, AI can compose them (strict intent allowlist), inline-editable in the builder, and they render in both the live preview and the published static site. New Postgres migration `20260625_171745_new_section_blocks` (purely additive) applied; types regenerated.
- This closes the last Phase 2 checklist item, **"Gallery + more section types."** (Connected sites already offered these via the AI "+ Add section".)
- **Connected follow-ups done too:** a scripted end-to-end **verify runner** (`verify-structure-connected.ts` — 17 checks: detect → move/delete/insert/replace sections → reorder/duplicate/remove items → draft-remap survives → add/remove page + nav link), and **"Add link" on a bare image** (wraps a standalone `<img>`/logo in a link, via a server-stamped `data-sa-img` index — also repaired the field route so products/all item fields are directly editable).
- 132 unit tests green; typecheck clean.

**`10:10 PM`** — ✅ Phase 2 (Structural editing) is complete for connected sites — `m14-structural` marked done
- **What this milestone covers, end-to-end on an external connected site:**
  - **Pages** — add / remove / reorder.
  - **Sections** (the big bands) — add / remove / move up-down / replace.
  - **Items** (repeated cards, nav links, buttons) — reorder (any direction) / duplicate / remove, all from the one ⋮ menu, scoped to what you hover.
  - **AI** — generate a new section or page, or edit an existing **section / page / single card** with AI, styled to the site, preview-before-commit, undoable; reproduce a supplied reference.
  - **Deterministic** — add/remove/redirect buttons & nav links.
  - **Resilience** — every change keeps prior text/image edits intact (fingerprint re-matching) and is undoable; chat messages name what changed and where; the preview loads with a spinner and reliably reveals (no blank home page).
- **Tracker:** `.serve` state → `m14-structural` = **done** (rev 41); `phases.md` Phase 2 boxes ticked.
- **Still open (separate / lower-priority, moved to PENDING):** the builder's typed gallery/FAQ/pricing/logos blocks; an end-to-end scripted verify runner for the connected structural path; minor polish (swap an inline-`<svg>` icon, add a link to a bare unlinked image).

**`09:55 PM`** — preview no longer flashes blank-white on reload (and the home page can't get "stuck")
- **Loading spinner while the first preview paints.** On reload/hard-reload the preview iframe used to be blank-white for a few seconds; now a "Loading preview…" spinner shows until it's ready (only on the initial paint — during a page switch the previous page stays visible, so no spinner flicker).
- **Auto-reveal fallback so it never hangs.** The iframe's `onLoad` sometimes doesn't fire on the very first load after the app mounts (a cached/raced iframe) — which is why the **home page** (the default page on reload) could stay blank until you switched tabs. The editor now polls the iframe's ready state and reveals it as soon as it's done, with a hard reveal after ~3.5s no matter what. No more switching pages to "unstick" it.
- **The preview render can't blank a page anymore.** The connected preview route now serves the page itself if injecting the editor ever throws (instead of a 500), and shows a clear "no saved content" note rather than a bare 404; the new item-detection stamping is wrapped so it can't break a render. (If a specific edit still leaves the home page broken after this, it points to data corruption we'll chase with a repro.)

**`09:30 PM`** — connected editor: menus are now scoped to what you hover (+ Edit-with-AI on a card)
- **Each ⋮ menu now matches what it's on.** Hovering a card's **text** shows only text options (Edit text · Edit with AI); the **card itself** shows card options (Edit with AI · Move · Duplicate · Remove this); an **image** shows Change image. No more "move/duplicate the card" appearing on the text inside it — those belong to the card. The menu targets the most specific thing under the pointer (text/image → that editable; its surrounding card → the card).
- **"Edit with AI" on a single card/item.** A card, icon, or nav item now has **Edit with AI** in its menu — type a change and just that one item is regenerated (styled to the site, preview-before-commit, undoable). New `mode:'item'` in the generate route + `replace-item` in insert, backed by `getItemHtml`/`replaceItemHtml` (+ shared-nav variants) in `structure.ts` and `replaceItemToPage` in the store. 3 new tests (128 total green).
- **Icons & logos got their options.** Repeated icons (e.g. social icons) now expose **Set link · Add after · Move · Duplicate · Remove · Edit with AI** from their badge (an icon link is treated as the item). Image logos get **Change image** (+ Set link / reorder when they apply). (Inline-`<svg>` "change icon" and adding a link to a bare, unlinked image are still TODO.)

**`09:07 PM`** — Phase 1 verifications closed (Cancel kill + AI key from Settings)
- **Cancel actually kills a live job.** Verified that hitting **Cancel** mid clone / build / deploy tears down the whole child process tree (win32 `taskkill /T /F` + posix process-group) — no orphaned `git`/`npm`/`wrangler` left running, and the workspace cleans up. Was previously implemented-but-unverified.
- **AI chat key works from `/admin → Settings`.** Verified the operator-set API key + model list (DB-backed, AES-256-GCM encrypted, no `.env` edit) powers the AI chat agent end-to-end on **both** the block builder and connected sites. Without a key, click-to-edit still works.
- Tracker: `m11-ai-settings` marked **done**; both items checked off in `phases.md` Phase 1 and the matching owed lines in `PENDING.md` closed. (Still owed: multi-node resumable jobs — single-node only today.)

**`08:15 PM`** — connected sites: reorder/duplicate/remove repeated items (cards, nav links, buttons)
- **New "item" controls, in the existing ⋮ menu.** Repeated things on a connected page — the cards in a blog/feature grid, the links/buttons in a nav, the tiers in a pricing row — are now detected as **items**, and their **Move / Duplicate / Remove** actions appear inside the **same single ⋮ dropdown** you already use to edit a card's image/text (no second badge, no second menu). Reorder labels follow the live layout — **Move left/right** when items sit in a row, **up/down** when stacked. This is the connected-site answer to "how do I add more blog cards / reorder nav buttons horizontally or vertically".
- **One badge, one dropdown — period.** A card/block now opens its menu **only from the ⋮ badge**; clicking the card body or a link no longer pops a second, different menu. That single menu carries everything that applies to what you're on — **Edit text · Edit with AI · Change image · Set link · Add a link/button after this · Move · Duplicate · Remove this**. The ⋮ badge and its menu **dismiss on scroll and on an outside click**.
- **Change messages now say what + where.** Instead of "Reordered." / "Removed." / "Duplicated…", the chat now reads e.g. *"Moved "Procurement" right in "blog".", "Removed "Finance" from "blog".", "Duplicated "Procurement" in "blog" — edit the copy…"*, and *"Moved the "Blog" section up in "Home"."* — with *"every page"* for shared nav/header/footer changes.
- **Add a card** = Duplicate a card then edit its text/image; **add by AI** still works via a section's **Edit with AI** ("add 2 more blog cards about …").
- **Nav links sync site-wide.** Reordering/duplicating/removing a link in a shared nav/header/footer applies to **every page**, like other shared edits.
- **Safe + reversible.** Each op runs through the same draft-remap (existing edits survive) and **undo**; the in-chat skeleton shows while it applies, then a result line ("Reordered.", "Duplicated — edit the new copy…", "Removed.", "(on every page)").
- **Under the hood:** new `connected/items.ts` (shared repeated-sibling detection), `applyItemOp`/shared-nav variants in `structure.ts`, server-stamped `data-sa-item` indices (so the click targets the exact element), a guarded `POST /workspace/connected/item` route, and a per-item overlay. 12 new unit tests (125 total green).

**`07:30 PM`** — chat history now survives reload + logout/login
- **Connected-site chat is persisted** per site (browser storage, keyed by site id) — a reload or logout/login no longer wipes the conversation. Switching sites loads that site's chat; removing a site clears it.
- **Builder chat upgraded** from per-tab `sessionStorage` (lost on tab close) to per-tenant `localStorage`, so it persists too — keyed by tenant so it can't leak between accounts on a shared browser.

**`06:50 PM`** — connected AI edits: sanitiser no longer rejects real-world markup
- **Edit-with-AI on a nav/header stopped failing** with "disallowed tag `<input>`" / "disallowed attribute `media`". The HTML sanitiser was a strict allowlist that rejected the harmless attributes real sites use; it's now a **denylist** — it blocks the genuinely dangerous things (scripts, event handlers, framework JS bindings, `javascript:` URLs, unsafe inline CSS, `formaction`/`srcset`) and allows everything else (form fields, `data-*`, `media`, custom attributes). Still fail-closed on a real threat, re-validated after serialisation.

**`06:15 PM`** — manual structure edits show progress + a specific result in chat
- Add button / remove button / set link / add link-after / move-or-delete section now drop the **buffering skeleton** in chat while they apply, then turn into a specific line (e.g. *"Removed 'Support' from Home."*, *"Added a 'Support' button to Products."*, *"Section moved up."*), with *"(on every page)"* for shared components.

## 2026-06-24

**`07:05 PM`** — workspace command drawer + cleaner top bar
- **One left off-canvas drawer** (opened by the profile avatar, top-left) is now the workspace command center: **New** (Connect a website · Create from scratch) and **History** (the builder + every connected site), and — for the active connected site — **Publish · Roll back · Git pull · Cloudflare project · Remove site**. The account menu (email · "Admin can edit" toggle / "Back to admin" · Log out) sits at the foot of the drawer. The old `New ▾` dropdown and the inline button bars are gone.
- **All drawer items share one row style** (icon + label, hover + active highlight) in the project's light theme — Publish reads green, Remove red, everything else neutral; same size/shape throughout.
- **Connect a website is now its own modal** (the same themed dialog as Publish/Remove) with Cancel · Connect, instead of a form crammed in the drawer; errors show inline. It auto-opens for a brand-new tenant with nothing connected.
- **Cloudflare project** is a click-to-expand row (prefilled with the saved name; "Update" when one exists, "Save" when not).
- **Top bar** now shows the **live URL + Edit-mode toggle** on the right (Undo stays by the preview); the signed-in email is no longer duplicated there (it lives in the drawer's account menu). The drawer opens/closes smoothly (GPU transform, no backdrop-blur jank).
- **Git pull** appears only for repo-based connected sites and shows a "coming soon" note (the real re-clone/rebuild is still deferred).

**`06:10 PM`** — tenant-impersonation hardening: the owed follow-ups are done
- **View-only is now enforced in the UI too, not just the server.** A view-only operator (a tenant that hasn't enabled "Admin can edit") no longer sees dead edit controls inside the **block builder or the connected editor** — the chat box, click-to-edit, Edit-mode toggle, and every write action are hidden (the server already 403'd them; now the UI matches).
- **Operator edits are attributed.** When a tenant lets an operator edit, the operator's id is now recorded as `impersonatedBy` on the active ChangeSet (the edit still runs as the tenant's service principal). New migration `20260624_113229_impersonation_attribution`.
- **Guard tests written.** Unit tests cover the deny-by-default operator-write rule (incl. "operator clears the cookie → direct POST still denied" and the edit-enabled-context-allows case), the per-route write-gate branches, and a regression net asserting **all 15 mutation routes** carry the guard (+ the connected-site direct-write guard). 53 tests green.
- **Cleanup:** deleted the now-dead `OperatorClient.tsx` (the panel moved to `/admin`); applied the pending admin/impersonation migration.

**`02:30 PM`** — admin UI polish
- **Sidebar** nav (Tenants · Settings) are now proper buttons with an active highlight; the **Log out** button is visible at the bottom of the sidebar (it was previously hidden in a dropdown that opened off-screen).
- **Tenants list + per-tenant detail** are centered on the page. The detail page now lists **builder and connected sites in one table** (with a Type badge); the tenant's published address stays as the "Live" link at the top.
- **Settings** centered and reordered (Provider → API key → Models). Models are now chosen from a **"+ Add model" dropdown** populated with the provider's **real available models** (fetched live from OpenRouter) — search and click to add; no free-text slug typing.
- **Round-trip to Payload** — added a **"← Back to SiteAgent admin"** link inside Payload's nav, so you can return to `/admin` from the CMS (the link out already existed).
- **Fixed:** an operator impersonating a tenant saw **"No site linked."** in a connected-site preview while the page tabs showed. The preview server (`/connected/<id>/…`) resolved the tenant from the operator's own session instead of the impersonated one — now uses the effective tenant, so the preview renders correctly under impersonation.

**`01:30 PM`**
- **Real operator workflow: admin dashboard, tenant onboarding, and "enter a tenant's site".** Big one, plan-hardened first (grilled for intent, then stress-tested by a second model, OpenAI Codex, over two adversarial rounds — 25 + 11 findings, all addressed; see `PLAN.md` / `PLAN-REVIEW-LOG.md`).
  - **Routes restructured.** `localhost:3000/` is now the **single login** (tenants *and* the operator) — after sign-in it sends operators to **`/admin`** and tenants to **`/workspace`**. Payload's own CMS moved out of the way to **`/admin/payload`**. Login/logout are now shared at `/login` and `/logout`.
  - **`/admin` — a professional, light operator dashboard.** Sidebar (Tenants · Settings). **Tenants list** with live usage (members, connected sites, published, running jobs, edit-access state) + top-line totals; **Add tenant** from the UI (creates the tenant, its first login, machine identity, an active change-set and a starter page — all-or-nothing, no half-made tenants); a **per-tenant detail page** with full usage; and an **AI Settings** page to set the agent's **API key (stored encrypted) and model list** without touching `.env`.
  - **Admin can drop into any tenant's workspace.** "Enter" opens that tenant's `/workspace` as the operator — **view-only by default**. The tenant controls a **"Admin can edit"** toggle (in their profile menu); only then can the operator edit. A banner shows the impersonation state, and **the server enforces it** (view-only operators are blocked from every edit/publish path, not just in the UI).
  - **Profile menu + themed dropdowns.** Every workspace/admin dropdown now uses the project theme (a shared `Menu`); the new profile icon holds Log out, the tenant's "Admin can edit" toggle, or an operator's "Back to admin".
  - **Security model hardened (the load-bearing bit).** Operator content writes are now **deny-by-default** — an operator can only write a tenant's content through a valid, edit-enabled impersonation; the impersonation cookie is re-validated every request (operator session + tenant exists + active) and cleared on logout; the AI key is AES-256-GCM encrypted, never returned to any client, and fails closed if it can't be decrypted.
  - Needs a one-time DB migration (`20260624_074100_admin_impersonation_settings`) for the new tenant flag + settings store.

**`10:15 AM`**
- **Operator admin panel (Phase 1).** Added an operator-only dashboard at **`/workspace/operator`** — a cross-tenant overview for the platform operator: every **tenant** with its **connected sites** (name, source, page count, live URL, status), plus **member count**, **running jobs**, and tenant status; and top-line **totals** (tenants · connected sites · published · active jobs). Gated on `isOperator`; reads across all tenants via the broker (operator scope, `overrideAccess`). Discoverable via an **"Operator ↗"** link in the workspace top bar (shown only to operators). Read-only v1 — tenant actions (suspend / billing / provisioning) and usage history come in the later admin phases. Code: `src/operator/dashboard.ts`, `app/(frontend)/workspace/operator/{page,OperatorClient}.tsx`.
- Saved the phased roadmap to **`docs/phases.md`** (Phase 1 operator + hosting → Phase 2 connected-sites finish → Phase 3 production safety → Phase 4 polish).

## 2026-06-23

**`06:30 PM`**
- **Connect & Publish now show a real progress bar (and can be cancelled).** The slow steps — cloning/building a repo, copying the whole site, uploading to Cloudflare — run as a **background job** with a live, **server-tracked progress bar** in a blocking modal. It **survives a page refresh** (progress is polled from the server, not held in the tab), shows clear stage messages ("Cloning…", "Building…", "Uploading to Cloudflare…", "Done"), and a **Cancel** button that actually stops the work (kills the running clone/build/deploy and cleans up). Backed by a small jobs layer (`src/jobs/*`).
- **Editor ⋮ badge edge-case fixed** — the options badge now stays **outside** each text block (above, or below when the block is flush to the top), never covering the text.

**`05:10 PM`**
- **Edit mode no longer navigates away.** In a connected site's preview, with Edit mode ON, clicking a link, button, or card no longer follows it / triggers the site's own scripts — you're clicking to *edit the text*, so the page stays put and the click opens the editor instead. With Edit mode OFF the preview browses normally (and the workspace page tabs switch pages either way).
- **Shared footer/nav/logo edits now show on every page instantly.** Editing a shared component (e.g. the footer) on one page already updated all pages in the CMS, but the other pages' previews only showed it after a manual refresh or publish. Now every page the component appears on refreshes automatically — open another page and the change is already there.
- **Progress modal reliability:** fixed a write race that could leave the publish modal stuck at 100% (now it shows **Done** and auto-closes), and made stale-job cleanup **non-destructive** — it can no longer delete a connected site's local files (an earlier version could wipe a site's CSS/JS/images if a publish job was interrupted).

**`04:05 PM`**
- **Live progress for connect, publish & remove — no more waiting in the dark.** Connecting a site (GitHub repo or folder), publishing, and removing a site now each show a **progress modal**: the page behind it blurs, a real **% bar** moves through honest milestones, and a **live one-line log feed** below it tells you exactly what's happening right now ("Cloning AtlasInfra…", "Installing dependencies…", "Building the site…", "Uploading to Cloudflare…") — the current line animates with typing dots and each finished step freezes with a ✓ (or a plain-English error line if something fails — never a raw terminal dump).
- **Cancel any of them.** A **Cancel** button stops the operation, kills the underlying process (git/npm/wrangler) and **cleans up the half-cloned files**, showing its own "removing files…" progress.
- **Survives a refresh _and_ a server restart.** Progress is tracked server-side (a new `jobs` record + an in-memory live registry), so refreshing the page **re-attaches** to the running job and keeps showing progress. If the server restarts mid-operation, the stranded job is detected, marked failed, and its orphaned folder is cleaned up automatically.
- **Interactive chat.** When you send a message in a connected site's chat, you now immediately get a **shimmering skeleton reply** with a cycling status ("Reading the page → Asking the model → Applying the change") instead of a static wait — it's replaced by the real answer when it's ready.
- **Also fixed a latent leak:** a failed connect used to leave its cloned folder behind on disk; it's now removed on failure/cancel. The remove-site confirmation is now a themed in-app dialog (no more native browser popup).

**`11:00 AM`**
- **Connected-sites loop verified end-to-end on a real site.** Connected a real multi-page Astro repo (cloned + built), edited content **by clicking and by AI chat**, swapped an image, **published to Cloudflare**, and confirmed the changes show on the **live published URL** — plus **rollback** and **undo** working. The core "edit any client site → publish to the same URL" idea is working.
- **Marked headings + doctype + page tabs fixed.** `data-sa`-marked headings now expose **every** text piece (not just the first); the page reads content **only from `<body>`** so `<!DOCTYPE html>` no longer leaks as visible text; all **page tabs appear immediately** after connecting (switch pages without leaving edit mode).
- **Publish proven faithful.** Verified the publish output is **byte-for-byte identical** to the site's built HTML (only the edited words change) — a reported "card layout changed after publish" turned out to be an **Astro dev-vs-production-build** quirk in the client's own site, not SiteAgent.
- **Editor polish:** the ⋮ options badge now floats **outside** each text block (above/below), never over the text; preview page-switches **crossfade** (double-buffered iframes) instead of flashing white.

**`12:30 AM`**
- **Connected-site text editing reworked to be piece-by-piece and non-destructive.** Each text run is now its own editable box, so a heading like "Powering the AI era with **high-density compute** built to last" edits as three separate pieces with the coloured word/styling kept. Edits happen **in place** (the page is never rebuilt), which **fixes the reordering bug** (the coloured phrase no longer jumps to the end), preserves spacing, comments, cards, and all structure, and means **Publish outputs your exact original HTML** with only the words changed. Content still lives in Payload; the code is never touched. Verified on fixtures (order, spaces, comments, cards, checkbox, icon+text, images) + multi-page shared sync.

## 2026-06-22

**`09:30 PM`**
- **Connected-site editing brought up to the builder's level.** The in-preview editor now: edits text **inline** (click and type, keeping icons/inline pieces intact), shows a **real dropdown menu** (Edit with AI / Change image) via a floating **⋮** that never gets clipped, and **"Edit with AI" targets the item in chat** (no popup). **Edit mode toggles instantly** (no reload). The chat panel matches the builder — **message bubbles**, **attach/paste a reference image** (e.g. a screenshot to copy wording from), and an **auto-growing** box with no scrollbar.
- **Undo** for connected edits (reverts your last change), and **styled/split text** (e.g. a two-colour logo) is now fully editable without duplicating text.
- **Publish fixes:** the real failure reason is shown (e.g. "No Cloudflare project set"), you can **set the Cloudflare project from the editor**, and removing a site now also **deletes its pulled repo/built files** from disk.
- **Connect a GitHub URL** (we clone + build it), works for sites **not yet deployed** (first Publish creates the Cloudflare project), and deploys to the site's **exact** project.
- **Dev speed:** `pnpm dev` now uses file polling (fixes the network-drive watcher), plus a faster `pnpm dev:fast` (Turbopack).

**`05:30 PM`**
- **One workspace, with a simple "New" menu.** The two separate screens (build-from-scratch and edit-a-connected-site) are now **one screen**. A **"New ▾"** button at the top lets you **Connect a website** or **Create from scratch**, and a **History** list reopens anything you've already connected or the builder. Both open in the **same editing layout** (chat panel, live preview, edit-mode toggle).
- **Connecting now handles a real, whole website — not just one page.** You point SiteAgent at the **built site folder (`dist`) or a GitHub repo** (it builds the repo for you). It loads **every page plus all the styles, scripts, and images**, so the preview looks exactly like the real site. You can switch between pages, and **edit text & images by clicking or by chat** — all saved as drafts in the CMS; **the website's code is never touched**.
- **Publish now redeploys the whole site** (every page + all assets, with your edits) to the **same web address**, with one-click rollback. Connected sites are **content-only** for now (no adding pages/sections — that's a later phase).
- **You can connect a site that isn't deployed yet.** Give just the code (folder or repo) and leave the live address blank — you can edit straight away, and **Publish does the first Cloudflare deploy for you** (creates the project) and fills in the live address. Also fixed publishing to use the site's **exact** Cloudflare project name, so it updates the real site instead of a new one.
- **Swapped images now show on the live site** — uploaded replacement images are bundled into the deployed site (no more broken images after publish).
- Cleaned up the build standard into a professional, rules-only `docs/templateRule.md` (replaces `docs/rules.md`).

**`03:30 PM`**
- **New capability — edit an existing website with SiteAgent.** A client can hand over a static website they already built (its address + a Cloudflare key), and SiteAgent now: **connects** to it (reads every text and image into the CMS), lets you **edit any of them — by clicking on a live preview or by chatting with the AI** (saved as drafts), and on **Publish** puts the changes back at the **same web address** — the design is never touched. Safety built in: edits stay drafts until Publish, the new version is checked before going live, and there's **one-click rollback**. Verified the connect → edit (text + image) → render loop on a sample site, with the design and untouched parts preserved; the live deploy reuses the existing Cloudflare publishing.
- Added **`docs/rules.md`** — the standard a client follows when building a site so SiteAgent can edit it (recommended stack, the one golden rule, optional `data-sa` markers, images, handover checklist, example).
- The project tracker now has a **"Connected Sites"** module reflecting this work.

## 2026-06-20

**`06:50 PM`**
- **"Add a new page" in chat now actually adds a page.** Before, typing something like *"add new page Product"* into the chat was treated as a content edit and dumped a products section onto the page you were already on. The chat now recognises a clear page-creation request ("add / create / make a new page X", "new page: About") and creates a brand-new page named X — then drops you onto it so you can fill it in. It's deliberately careful: ordinary edits like *"add a hero to the page"* or *"add a products section"* still edit the current page as before. New pages created this way use the exact same naming/slug logic as the "+ Add page" button.
- **Responsive workspace header ("top hat").** The chat panel's top bar (Signed-in email · live URL · Publish · Sign out) used to overflow and get cramped when the chat panel was made narrow. It now wraps cleanly onto a second row, with the email truncating gracefully, so everything stays reachable at any panel width.

**`08:35 PM`**
- **Live URL is now captured, saved, and always shown.** Fixed a bug where a *successful* Cloudflare publish was mis-read as a failure (the URL has two subdomain parts and the matcher only allowed one). Now Publish returns the clean public address, **saves it on the customer's record**, and shows it **persistently in the workspace header** (e.g. `siteagent-acme.pages.dev ↗`) — so the customer can always open their live site, even after a refresh. Also made the publish chat reply **short and standard** ("Your site is now live.") instead of dumping the raw deploy log; any real error is logged server-side and the customer just sees "Publishing failed. Please try again."

**`08:05 PM`**
- **Real publishing to Cloudflare (step 4 — going live for real).** Publish now does the whole pipeline: freeze the draft → render the site to a self-contained static website (HTML per page + copied images) → upload it to the customer's own Cloudflare Pages project via direct upload → return the real public URL (`siteagent-<customer>.pages.dev`). No GitHub needed for this path. When Cloudflare isn't configured it falls back to the local `/site/<customer>` preview, so nothing breaks. Cloudflare credentials are read through the same safe config seam (optional). Verified the static-site render + export end to end; the live upload runs once the Cloudflare token is in place.

**`07:20 PM`**
- **Publish (step 1 — going live, local).** Added a green **Publish** button in the workspace: it freezes the current draft as the live version, and the customer's site is then viewable at a public, no-login URL — `/site/<customer>` (e.g. `/site/acme`) — rendering the published pages, nav, sections, images, and theme exactly as a visitor sees them. A **"View live site"** link appears after publishing. This is the full **edit → preview → LIVE** loop working on `localhost` today; the next step wires the same output to Cloudflare for a real public web address. Verified publish + public render end to end.

**`06:35 PM`**
- **Flexible Product cards** (per the "give a reference, match it" goal — done the safe way with configurable sections, not free-form code). The product card now has a **description**, and price / old-price / badge / button are all **optional** — so the same card renders as a plain *image + name + description* card (matching a simple catalog) or a full shop card. Add the extra fields per card from its ⋯ menu ("Add price / badge / button") or by asking the AI; the AI now only fills the fields you ask for.
- **Friendlier AI replies.** The agent now explains what it actually did in plain language ("Done — I changed your main heading to 'Welcome'.") instead of a generic "3 sections".
- **Sent-message badges.** When you target a section (or attach an image) your sent chat message now shows it as a badge (e.g. "Section: Call to action"), so it's clear what the request applied to.
- **Chat box polish.** Removed the scrollbar, shortened the placeholder to one line, and the box now grows automatically as you type (Enter sends, Shift+Enter new line). You can also paste an image straight into the chat.

**`05:55 PM`**
- **New "Product cards" section.** A proper e-commerce section: a grid of product cards, each with an image, name, price, a struck-through old price, a discount badge (e.g. "-30%"), and a button. Add it from "Add a section", or ask the AI ("add a products section with 3 products") — verified the AI fills name/price/old price/badge correctly. This is the right fit for shop/reference-image requests (instead of cramming products into a generic Features card). You still upload each product photo.
- **Database safety hardening.** Made it impossible at the database level for a page to exist without an owner (added NOT-NULL on the page's tenant and change-batch links) — verified it doesn't affect normal editing.
- **Working indicator.** The chat now shows a clean animated "working" indicator while the AI composes, instead of a static "Thinking…".

**`05:20 PM`**
- **Themed dialogs.** Replaced the browser's grey native pop-ups ("localhost:3000 says…") with clean in-app dialogs that match the project style — used for the delete-section confirm and the new-page name prompt (a proper input field, Enter to confirm, Esc/Cancel to dismiss, click-outside to close).

**`05:00 PM`**
- **Chat refinements.** Removed the redundant background-image upload button from the chat (images are now placed directly in the preview). The remaining attach button is for reference images and now also accepts **paste (Ctrl+V)** of an image straight into the chat. The chat box is now multi-line: **Enter sends, Shift+Enter adds a new line.**

**`04:40 PM`**
- **Professional UI pass.** Replaced the editing on/off control with a proper minimal **toggle switch** ("Edit mode"). Collapsed the per-section emoji buttons (point-AI / move / delete / image) into a single discreet **"⋯" menu** in each section and item corner — click to open a small options list (Edit with AI, Change/Remove background image, Move up/down, Delete), click outside to close. Removed the playful emoji throughout (image/attach buttons and chips now use clean line icons), to match the minimal, professional standard for the project.

**`04:05 PM`**
- **Edit-mode toggle.** Top-right of the preview there's now an **"✏️ Editing: ON / 👁 Preview only"** switch. ON shows all the editing controls (click-to-edit text, image/section buttons, add-section bar); OFF hides every control and shows the site exactly as a visitor would see it — a clean preview.
- **Minimal icon controls.** The bulky "🖼 Change image / Add image / ✕" text buttons are now small icon-only buttons (🖼 to set, ✕ to remove; 🎯 ↑ ↓ 🗑 for sections) that only appear in edit mode.

**`03:30 PM`**
- **You can now fully build a page by hand, not only via the AI.** Every section has on-canvas controls: move up/down, delete, and **🎯 "Point AI here"** — and there's an **"Add a section"** bar (hero, features, testimonials, call-to-action, contact, text) plus **+ Add item / ✕** on feature and testimonial cards. So customers can shape the whole layout themselves.
- **"Point AI here" + Alt+E shortcut.** Don't know what a section is called? Click **🎯 Point AI here** on it (or hover it and press **Alt+E**) — a chip shows "your next message edits the Hero section," and the AI applies your instruction to exactly that section, even if you just say "make this shorter."
- **Undo.** An **↶ Undo** button reverts the last change to a page (one level; press again to redo). Works for AI edits, text edits, image changes, and add/remove/move section.
- **Housekeeping:** removed the old unused fixed-section fields from the database now that everything runs on the dynamic layout.

**`02:30 PM`**
- **Images anywhere, placed by clicking.** Every section can now have its own background image, and feature/product cards can each have their own photo — not just the hero. To set one, the customer **clicks the image (or "Add image") right on the section/product in the preview**, picks a file, and it lands exactly where they clicked — so there's no need to know section names. If they don't like it there's a one-click **Undo** (revert to the previous image), and an **✕** to remove an image. Crucially, uploaded photos are **kept when the AI later edits the text** (verified: changed a section's heading and both the background and product images stayed). Removed the decorative browser dots from the address bar.

**`12:58 PM`**
- **Multi-page sites.** A customer's site can now have many pages (Home, About, Services…), not just one. In the workspace there's a row of page tabs with an **"+ Add page"** button, a fake browser **address bar** at the top of the preview showing the current page's route (e.g. `yoursite.com/about`), and a **navigation menu** rendered on the site once there's more than one page. Chat edits, click-to-edit, and image uploads all apply to whichever page you're viewing. Verified end to end (added an About page at `/about` and switched to it). Next: per-section background images.

**`12:15 PM`**
- Rebuilt the page to be **fully dynamic** — the product's real logic. A page is now an open-ended stack of sections (hero, features, testimonials, call-to-action, contact, text): any sections, any number of items, in any order. You can genuinely add more now — "add two more features" actually adds them (verified 3 → 5), add new sections, reorder, and restyle, all from a single chat request, and everything in the preview stays click-to-edit. This replaces the old fixed-slot sections.

**`11:19 AM`**
- More design power: two new sections — customer **Testimonials** and a **Contact** section — plus **theming** (the AI, or the customer, can change the site's accent colour and switch the font). Verified the AI added a full testimonials section and recoloured the theme to green in a single request. A page can now stack hero, features, testimonials, call-to-action, and contact — each editable and styled by the theme.

**`10:46 AM`**
- The AI can now *design*, not just reword. In a single request a customer can say "add a features section about our coffee shop" and the AI turns the section on and writes the heading plus all three columns at once — verified (one sentence produced 8 coordinated edits). It also works with an attached reference image. This is the core of the "AI builds your site" promise.

**`10:22 AM`**
- Pages are now real multi-section websites. On top of the hero, there's a 3-column "Features" section and a "Call to action" section with a button — and every piece is click-to-edit, just like the hero. The example site now shows all three sections stacked like a proper landing page. (Next: letting the AI add and fill a whole section from a single request.)

**`10:02 AM`**
- Fixed the hero section preview: an uploaded image now shows as a full-width background with the heading and subheading laid over it (a proper hero banner), instead of the image sitting on top of the text.

## 2026-06-19

**`08:04 PM`**
- Image features complete. Fixed the upload error (photos now save correctly, scoped to each customer). And the AI can now "see" images: a customer can attach a reference image (📎 button) and ask the AI to act on it — verified end-to-end (sent a coloured image, the AI read it and updated the page from what it saw). So images now work two ways: add a photo to the page (🖼), or show the AI a reference (📎).

**`07:41 PM`**
- Added direct "click-to-edit": in the live preview, a customer can click the heading or subheading and type a new value in place — the second way to edit (alongside chat), without touching the technical admin. It saves through the same safe, tracked path. So the workspace now offers all three: chat with the AI, click-to-edit, and image upload.

**`07:15 PM`**
- Added image upload (first stage): from the chat workspace a customer can upload a photo and it instantly appears on their site as the hero image, kept private to their own account. Stored on this machine for now (moves to cloud storage when we deploy). Next stage: letting the AI "see" an uploaded reference image to decide changes.

**`06:18 PM`**
- Locked down the safety architecture with an automatic guardrail: code can no longer sneak around the single audited content-write path (a lint rule enforces it). Also replaced the starter demo home page with a proper SiteAgent landing page. Lint passes clean and the app builds.

**`05:32 PM`**
- Polished the workspace: added a Sign-out button, made the chat history survive a page refresh, and made the preview update instantly after each change (no manual refresh needed).

**`05:02 PM`**
- The full hands-on demo is built: a customer can sign in and land on a chat-and-preview screen, type a change in plain English ("change the hero heading to Summer Sale"), and watch their site's live preview update — powered by the AI, safely scoped to their own site. This is the complete walking skeleton (slice 1): sign in → chat-edit → see it in preview. Publishing to a public website and the layout/design tools come in later phases.

**`04:52 PM`**
- The AI agent now works end to end. Asked in plain English to "change the hero heading to Summer Sale," the AI (via OpenRouter — Kimi, falling back to Qwen) produced a valid, safety-checked instruction and the page updated through the safe doorway — the new heading is live in the draft. This is the heart of the product working: say what you want, the AI makes the change, safely scoped to your own site. Only the chat screen and live preview remain before it's a full hands-on demo.

**`04:15 PM`**
- Built the single safe doorway the AI will use to change content, and proved customer data stays separated. The agent can only write through one audited path that acts as the customer's dedicated machine account, opens a batch of changes automatically on the first edit, and runs every per-customer security check. Wrote automated isolation tests — which immediately caught a real hole (one customer's account could write into another customer's content through the raw database) and forced it closed. Also stopped a class of database-setup confusion by turning off automatic schema "push." All verified by tests.

**`02:59 PM`**
- Made the core safety rules real and proved them: every content edit is now automatically tied to the customer's open batch of changes; edits with no open batch are refused; and background/system processes can't quietly change content. Also added a setup script that creates a first test customer (Acme) with logins, so the editing experience can now be tried by hand in the admin. Verified with automated tests and a clean build.

**`02:40 PM`**
- Turned on per-customer data separation (multi-tenancy): each customer's content is now scoped to that customer, with an operator/super-admin role for the platform owner who oversees everyone. Verified the database updated and the app builds cleanly.

**`02:15 PM`**
- Built the core data structure the whole product stands on. Three things now exist in the database: the list of customers (Tenants); the "batch of edits" record that tracks a set of changes from draft to live — with a built-in rule, enforced by the database itself, that a site can only have one batch in progress at a time; and the content area where page content lives, kept separate per customer and per batch, with draft and published versions. Verified end-to-end: the database correctly rejects a second in-progress batch, 10 automated checks pass, and the app builds cleanly.

**`12:52 PM`**
- Set up a single, safe place for the app's secret settings (database connection, signing key, AI key). Now there's exactly one checked entry point for these, the app refuses to start with a clear message if a required one is missing, and none of them can leak into anything a website visitor's browser downloads. Backed by 7 automated tests, all passing.

**`12:12 PM`**
- Built the foundation of the product — the "Brain" — and got it running on this machine. It's a single application (Next.js + Payload CMS) talking to a local PostgreSQL database. Confirmed it compiles cleanly and the database is set up (its starting tables are created). This is the base everything else is built on. Along the way we worked around a few quirks of running on the shared `S:` network drive.

**`11:16 AM`**
- Agreed how we'll build SiteAgent: one small, working piece at a time instead of everything at once. The first piece ("slice 1") is the core editing loop — a customer logs in, types a change to their site in chat, and sees it appear in a live preview. Publishing to a real public website comes in a later piece.
- Settled the practical choices for that first piece: build and test it locally first (using the Postgres database already installed), use Gemini as the AI that understands the chat requests for now (with the option to add Claude later as a one-line change), and create the first test customer with a simple setup script rather than the full onboarding system.
- Wrote the plan down and had a second, independent AI (Codex) try hard to poke holes in it. It found 16 issues across three rounds — all fixed — before giving its approval. This means the plan was stress-tested by two different models before any code gets written.
- Started a running list of everything we're intentionally leaving for later (`PENDING.md`) so nothing planned gets quietly forgotten.
