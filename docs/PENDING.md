# PENDING — deferred work & slice shortcuts

_Things we deliberately simplified or postponed so the build stays vertical-slice-first. Nothing here is cut — it's owed. Checked off only when the real version lands._

> The big subsystems (publish saga, media pipeline, auto-provisioning, observability, concurrency leases, structural edits) are already tracked as `todo` in `../.serve/ProjectPlan.html`, so they can't be "lost." This file captures the **shortcuts taken inside slice-1 tasks** — the lighter-now / real-later swaps that have no tracker task of their own and are the easy things to forget.

## Deferred out of Slice 1 (the walking skeleton: login → chat-edit → preview)

### Preview is rendered in-Brain, not the real Cloudflare preview  _(decided 2026-06-19, Grill Q3 → Option B)_
- **What slice 1 does:** the Brain (Next.js) renders the tenant's draft content directly in the right-hand preview pane. No separate Astro app, no Cloudflare, no proxy.
- **What's still owed (the real architecture, `Architecture.md` §C / Module 8):**
  - [ ] `m8-ssr-worker` — real Astro SSR-on-Workers preview, one deployment per ChangeSet branch.
  - [ ] `m8-preview-lockdown` — every preview deploy passes the build-surface gate (path denylist + AST/env/network guard) before deploying.
  - [ ] `m8-preview-cred` — ChangeSet-scoped, read-only, public-DTO-only preview credential (useless outside the proxy).
  - [ ] `m8-media-proxy` + `m8-media-authz` — Brain draft-media proxy streaming from private R2 with per-asset authorization.
  - [ ] `m8-access-gating` + `m3-access-gate` + `m8-session-expired` — Cloudflare Access gating, provisioning gate proving Access protects the preview URL shape, and the session-expired UX.
- **Why it's safe to defer:** the slice-1 loop proves agent → broker → single Local-API adapter (`overrideAccess:false`) → `beforeChange` hook → draft in Postgres → render. That core + its isolation controls need no Cloudflare. The real preview is about *where* sites run (Module 8), sequenced later without changing the architecture.
- **Replacement cost:** the slice-1 in-Brain preview UI is throwaway and gets replaced when the real preview lands.

### Agent is Gemini-only; Claude / structural agent deferred  _(decided 2026-06-19, Grill Q4)_
- **What slice 1 does:** content agent runs on **Gemini Pro** (personal key) through the `{provider, modelSlug}` config seam (`m6-model-seam`). Content edits only.
- **What's still owed:**
  - [ ] Add **Claude** as the structural/code agent the day the client provides an Anthropic key (one-line config change — the seam is already built).
  - [ ] `m6-structural-agent`, `m6-nofit-overlay`, `m6-mode-mismatch` — the whole "Change layout" path (Module 6 structural + Module 7 primitives/registry).
  - [ ] **Advanced** intent hardening only (rate-limiting, prompt-injection defense, multi-step intent transactions). NOTE: the **core strict closed intent schema** — parse-fail / unknown-field / out-of-scope rejection, fail-closed — is **NOT deferred; it is slice-1 scope** (`PLAN.md` §16), because it's the load-bearing safety control for Gemini. _(Corrected per Codex R1 #7.)_
- **Why it's safe to defer:** slice 1 is content-only; the structural path is a separate vertical and a separate model.

### Tenant created by a seed script, not real provisioning  _(decided 2026-06-19, Grill Q5 → Option B)_
- **What slice 1 does:** one local seed script inserts a single Tenant + a **minimal-role service principal** (CRUD on its own content only — NOT admin; the isolation control is honored even in the skeleton) + one human Tenant login, **via a narrow, lint-allowlisted bootstrap adapter** (NOT the audited tenant adapter and NOT a general bypass — see `PLAN.md` §11/§22). Starter content is a **real published baseline** created through a ChangeSet via Payload's publish/version path, not a faked status flip. No GitHub, no Cloudflare. _(Do not "simplify" the bootstrap path back into the audited adapter or a blanket Local-API insert — that reintroduces the bypass Codex R1 #4 closed.)_
- **What's still owed (Module 3 / `Architecture.md` §1):**
  - [ ] `m3-provision-job` — idempotent `provisionTenant()` with per-step keys + partial-failure rollback; Tenant not invited until fully succeeded.
  - [ ] `m3-repo` + `m11-github-app` — private GitHub repo per Tenant from the Template repo, via the GitHub App (per-repo tokens, never on the branch-protection bypass list).
  - [ ] `m3-deploy-targets` — Cloudflare production (Pages) + preview (Workers) surfaces + env wiring.
  - [ ] `m3-mapping` (full) + `m3-access-gate` — persisted mapping + the Access-protection gate.
- **Why it's safe to defer:** slice 1 needs exactly one Tenant's *data* to prove the loop, written to the same collections real provisioning will use later. Repo + Cloudflare steps have nothing to wire to until those subsystems come online.

### No Publish, no media, and other slice-1 shortcuts  _(decided 2026-06-19, Grill Q6 → Option B)_
- **Slice 1 stops at preview.** Loop = log in → chat-edit content → see it in the in-Brain preview → (lite) discard. **No go-live.**
- **What's still owed:**
  - [ ] **Module 9 — Publish saga** (`m9-*`): materialize+sanitize snapshot → stage media → protected merge → single build → deploy → publish-via-Payload, plus all compensation/rollback states. (Tracked as todo.)
  - [ ] **Module 10 — Media pipeline** (`m10-*`): R2 private/public buckets, random-nonce staging, reference-safe GC. Slice 1 is **text-only content** (no image upload), so R2 is entirely out for now.
  - [ ] **Brain deployed to a warm paid host** (`m1-host-warm`): slice 1 runs on `localhost` + installed Postgres only. Production host is a config/ops change, no code change.
  - [ ] **Direct CMS editor panel** (`m13-direct-editor`, `m4-admin-scoped`): slice 1 is chat-only; the embedded element-scoped editor is the secondary path, deferred.
  - [ ] **Concurrency leases** (`m13-lease`, `m13-stale-tab`, `m2-edit-leases`): slice 1 assumes a single editor with no lease enforcement.
  - [ ] **Hardened audit & observability** (`m2-audit` DB-enforced append-only, `m12-*`): slice 1 uses minimal logging; the append-only `audit_log` + correlation-ID threading come later.
  - [ ] **Hosted CI** (`m1-ci`): slice 1 runs the lint-deny + isolation tests locally; the CI pipeline that also hosts the build-surface lockdown checks is deferred.
  - [ ] **DB hardening not needed yet**: `m2-media-refs`, `m2-saga-checkpoints`, `m2-indexes` (hot-path tuning), `m2-rls`.
- **Kept honest even in the skeleton (NOT deferred — these are load-bearing):** single audited Local-API adapter with `overrideAccess:false`, the `beforeChange` ChangeSet hook + system-write deny, the minimal-role service principal, `NOT NULL tenant` FK, the one-active-ChangeSet partial unique index, and cross-Tenant isolation tests.

## Deprecated fixed page fields cleanup — DONE
- ~~The old fixed group fields on `pages` (`hero`/`features`/`cta`/`testimonials`/`contact`)...~~ **Done 2026-06-20:** migration `20260620_095155_drop_deprecated_fields` dropped all the old fixed-section columns/tables; the app runs entirely on the dynamic `layout`.

## Publishing — what the SIMPLE slice does vs what's owed _(2026-06-20)_
- **Done (simple publish):** Publish freezes the draft → renders a self-contained static site (HTML + copied images) → deploys to the customer's own Cloudflare Pages project via Wrangler **direct upload** → saves + shows the live `*.pages.dev` URL. Real, working, $0. _(`publish.ts`, `export-site.ts`, `render-html.ts`, `deploy-cloudflare.ts`.)_
- **Owed for production (the real Module 9 + others):**
  - [ ] Full **publish saga** with rollback/compensation (`m9-*`) — protected merge, deploy-verify, publish-via-API last, abort/revert states. The slice has **no rollback**.
  - [ ] **Snapshot sanitization** (`m9-materialize` C1) — the current static render exposes the public DTO but not the strict per-block allowlist + JSON-Schema + fail-closed posture.
  - [ ] **Media on R2** (`m10-*`) — images are currently **copied into each static bundle**, not staged to R2 with reference-safe GC. Fine for small sites; R2 needed at scale.
  - [ ] **Custom domains** — customers are on `*.pages.dev`; map their own domain via Cloudflare for sale-readiness.
  - [ ] **The Brain itself is still localhost-only** (`m1-host-warm`) — customer *sites* are live on Cloudflare, but the *editing platform* must be deployed (Node host + Neon Postgres + R2) for real customers to use it.

## Connected Sites (edit an external static site) — loop verified end-to-end _(updated 2026-06-23)_
- **Done (v2):** connect a **whole built site from a `dist` folder OR a GitHub repo** (we build the repo) → copy the full site (all pages + CSS/JS/images) into managed storage + load every page's text/images into Payload → **multi-page** preview served fully-styled under `/connected/<id>/…` (asset URLs rewritten; assets served from the managed folder) → edit drafts (click-to-edit with edit-mode toggle + image upload + AI chat, per active page) → **publish redeploys the whole folder** (with edits applied to every page) to the site's Cloudflare project (same URL) + one-click rollback. Unified into one `/workspace` (New ▾: Connect / Create + History). Build standard in `docs/templateRule.md`. Code: `brain/src/connected/*` (`ingest-folder.ts`, `store.ts#connectFromFolder`, `html.ts`, `publish.ts#buildWholeSite`), `app/(frontend)/connected/[siteId]/`, `app/(frontend)/workspace/{UnifiedWorkspace,ConnectedEditor}.tsx`. Engine verified on a multi-page fixture (pages, assets, prefixed preview, clean publish).
- [x] ~~**Real-project end-to-end test owed.**~~ **Done (2026-06-23):** connected a real multi-page Astro **GitHub repo** (cloned + `npm run build`), edited by click + AI chat, swapped an image, **published to Cloudflare**, confirmed changes on the **live published URL**, and verified **rollback + undo**. Publish output proven **byte-identical** to the built HTML (a reported card-layout change was an Astro dev-vs-prod-build quirk in the client's own repo, not SiteAgent).
- [x] ~~**Replacement images break on the LIVE deploy (asset-bundle gap).**~~ **Done (2026-06-22):** on publish, uploaded images are copied into `<deploy>/sa-media/<file>` and the `src` repointed there. Verified (`publish.ts#bundleMedia`).
- [x] ~~**Per-page content only** (shared nav/footer didn't sync).~~ **Done (2026-06-23):** `store.ts#sharedTargets` — editing text/image that appears on 2+ pages updates **every copy** (shared footer/nav/logo), with grouped undo. Verified on a fixture.
- [x] ~~**Loading/progress bar during connect/publish.**~~ **Done (2026-06-23):** connect / publish / remove each run as a tracked background **job** with a blurred-page progress modal (honest stage-based %, live one-line logs with animated dots + ✓, Cancel-with-cleanup). Progress survives page refresh AND server restart (durable `jobs` collection + in-memory live registry + stale-job reaping). Connected-site chat shows a shimmering skeleton reply with staged status. Code: `src/jobs/*` (`registry.ts`, `store.ts`, `runner.ts`), `src/collections/Jobs.ts`, `app/(frontend)/workspace/{ProgressModal,ConnectedEditor}.tsx`, routes `connected/{job,cancel}` + start-route conversion of `connected/{connect,publish,delete}`.
- [x] ~~**UI polish — top-bar styling + chat-section control layout.**~~ **Done (2026-06-24):** the workspace was reworked into a left **off-canvas command drawer** (launcher: Connect/Create/History + per-site actions: Publish/Roll back/Git pull/Cloudflare/Remove + account menu), a **Connect modal**, **uniform drawer rows**, and a cleaned-up **top bar** (live URL + Edit-mode toggle; signed-in email moved into the drawer). See CHANGELOG 2026-06-24.
- [x] ~~**Cancel not yet verified on a live cancel** of a real clone/build/deploy.~~ **Done (2026-06-25):** the kill-tree path (win32 `taskkill /T /F` + posix process-group) was verified to actually kill a live clone / build / deploy — Cancel mid-job stops the child process tree with no orphaned `git`/`npm`/`wrangler` left running, and the workspace cleans up.
- [ ] **Progress hardening still owed:** the resumable job model assumes a **single node** (multi-node would need a shared queue, not the in-memory live registry).
- [x] ~~**Structural edits** (`m14-structural`) — add/remove sections & pages, design/code changes.~~ **Done (2026-06-25):** full structural editing on a connected site — add/remove/reorder **pages**; add/remove/move/replace **sections**; reorder/duplicate/remove repeated **items** (cards, nav links, buttons) in any direction; **AI** generate/edit a section, page, or single card (preview-before-commit, undoable); deterministic button/nav-link add/remove/redirect; prior edits survive every change via fingerprint re-matching. ~128 unit tests. Code: `connected/structure.ts`, `connected/items.ts`, `connected/store.ts` (`applyStructureToPage`/`applyElementToPage`/`applyItemToPage`/`replaceItemToPage`/`addConnectedPage`/`removeConnectedPage`/`reorderConnectedPages`), routes `connected/{structure,element,item,generate,insert,pages,nav}`, `ConnectedEditor.tsx`. See CHANGELOG 2026-06-25. **Still owed below:** builder typed-blocks (gallery/FAQ/pricing/logos), a scripted e2e verify runner, and the small polish items.
- [x] ~~**Chat-edit needs `OPENROUTER_API_KEY`** in `.env`.~~ **Done (2026-06-25):** the AI key + model list now come from **`/admin → Settings`** (DB-backed, AES-256-GCM encrypted, no `.env` edit), and were verified to power the AI chat agent end-to-end on **both** the block builder and connected sites. Without a key configured, click-to-edit still works.
- [x] ~~**Auto-detected items** rely on stable element positions~~ **Improved (2026-06-25):** edits now survive add/remove/move/replace of sections & items via **fingerprint re-matching** (`structure.ts#remapDraft` — match by normalized text + kind + nearest heading, unique-match-or-keep), and generated/touched elements are server-stamped with `data-sa-link`/`data-sa-item` indices. _Still owed:_ author-placed **permanent `data-sa` markers in the source** (per `docs/templateRule.md`) so edits survive a full client **redesign / re-ingest** (fingerprints help, but break if the wording changes too).

### Phase 2 structural — small follow-ups _(2026-06-25)_
- [x] ~~**One-click "Gallery" (and FAQ/pricing/logos) on the connected "+ Add section" palette**~~ **Already there:** the connected palette already lists Hero · Features · Gallery · Pricing · FAQ · CTA · Testimonials · Logos · Contact (each drives AI generation).
- [x] ~~**Scripted e2e verify runner** `verify-structure-connected.ts`~~ **Done (2026-06-25):** `src/connected/verify-structure-connected.ts` — 17 checks (detect → move/delete/insert/replace sections → reorder/duplicate/remove items → draft-remap survives → add page (clone) / nav link / remove nav link). Run: `pnpm payload run src/connected/verify-structure-connected.ts` or `npx tsx …`.
- [x] ~~**Add a link to a *bare* unlinked image**~~ **Done (2026-06-25):** an unlinked `<img>`/logo now shows "Add link…" in its menu and gets wrapped in an `<a>` (server-stamped `data-sa-img` index + `link-image` element op). Also fixed the field route so products/all item fields are directly editable.
- [ ] **Swap an inline-`<svg>` icon ("change icon")** — image logos use "Change image"; inline SVG icons can't be swapped via upload yet (would need SVG replacement). Social/icon links already get Set link · Move · Duplicate · Remove · Edit-with-AI (which can change an icon).
- [ ] **Duplicate-after-edit draft loss (edge case)** — duplicating a card you've *already* AI/text-edited starts the copy from the card's *original* text (the conservative remap won't guess between two now-identical cards); re-edit it. Common flow (duplicate an unedited card → edit the copy) is clean.
- [ ] **Watch: home page blank after a specific edit** — defensive fixes shipped (preview spinner + reliable reveal + render-never-blanks + non-fatal item stamping). If a *specific* edit still corrupts the stored home HTML (needs reconnect to fix), capture the exact repro so the corrupting op can be found.
- [x] ~~**Nav "active" highlighting**~~ **Done (2026-06-26):** `normalizeNavActive()` + `detectNavStyles()` run at **preview + publish render** (stored HTML untouched) and highlight only the current page on ANY site, with **no hardcoded class names**: the site's own active/inactive menu-link class **strings** are learned ONCE from whichever page still has the standard `aria-current="page"`, then re-applied per page (current link → active + `aria-current`; other menu links → inactive). Whole-string copy preserves the site's exact shape/styling; logo/CTA excluded by class-shape. This also covers **AI-built / editor-cloned pages that lost their own anchor** (they reuse the styles detected from another page). Heals everything at render — no re-save. _Residual limits, owed if they bite:_
  - [ ] **A site where NO page has `aria-current`** (highlight purely via a per-page baked class with no aria marker, or via runtime JS) → no styles to learn, so we leave the nav untouched. A safe extension: derive active/inactive strings by comparing two pages' navs (the link that differs is the active one).
  - [ ] **Runtime-JS active under the preview prefix** — if a site sets active via JS matching the URL, the `/connected/<id>/…` preview path can defeat it (the **published** site is correct on real URLs). A preview-only `history.replaceState` shim to the real path would fix that case.

## Operator admin panel (m11) — v1 done, follow-ups owed _(2026-06-24)_
- [x] ~~**Operator dashboard (read-only).**~~ **Done (2026-06-24):** `/workspace/operator` — operator-gated (`isOperator`) cross-tenant overview: tenants + their connected sites (name, source, pages, live URL, status), member count, running jobs, and totals (tenants/sites/published/active jobs). Reads via the broker with operator scope. Code: `src/operator/dashboard.ts`, `app/(frontend)/workspace/operator/*`.
- [ ] **Tenant actions** — suspend/resume, edit plan, remove a tenant from the panel (currently read-only; manage via Payload `/admin`).
- [ ] **Billing & roles** (`m11-roles-open`) — plans/usage-based billing + multi-user team roles (who-can-publish) are still unspecified; decide before real teams.
- [ ] **Usage history** — current panel shows live counts only; per-tenant usage over time (edits/publishes/storage) for billing comes later.
- [ ] **`m11-github-app`** (per-repo installation tokens) + **`m11-secrets`** (all GitHub/Cloudflare/Payload secrets server-side only) — unbuilt; secrets currently in `brain/.env`.

### Admin dashboard + route restructure + impersonation — shipped 2026-06-24 (built, plan grilled + Codex-reviewed)
**Done:** `/` shared login (role-redirects), Payload moved to `/admin/payload`, `/admin` operator dashboard (tenants list + add-tenant + per-tenant detail + AI settings), server-enforced operator impersonation (`allowOperatorEdit` tenant toggle), DB-backed encrypted AI key/model settings, themed profile dropdown. Deny-by-default operator writes in `stampActiveChangeSet` + a `connectedSites` guard; 403 guards on all 16 mutation routes. Migration `20260624_074100_admin_impersonation_settings`. **Build green.**

**Owed → now mostly DONE (2026-06-24):**
- [x] ~~Apply the migration before use~~ **Done (2026-06-24):** `pnpm payload migrate` applied `20260624_074100_admin_impersonation_settings` (+ the new `20260624_113229_impersonation_attribution`); the DB now has the `settings` global, `tenants.allow_operator_edit`, and `changesets.impersonated_by`. (Other environments still need `pnpm payload migrate` after deploy.)
- [x] ~~Automated tests~~ **Done (2026-06-24):** unit tests for the deny-by-default operator-write guard (incl. "operator clears the cookie → direct POST is still denied" and the edit-enabled-context-allows case), the per-route write-gate branches, and a regression net asserting all **15 mutation routes** carry `requireWritableTenant` (+ the connected-site direct-write guard). 53 tests green. `src/lib/changeset/operatorWriteGuard.test.ts`, `src/auth/requireTenant.test.ts`.
- [x] ~~View-only UI affordance hiding is partial~~ **Done (2026-06-24):** the block builder **and** the connected editor now hide the chat box, click-to-edit, Edit-mode toggle, and every write action for a view-only operator (server 403 unchanged — the UI now matches it).
- [x] ~~Impersonation attribution is a log line, not durable~~ **Done (2026-06-24):** `impersonatedBy` (operator user id) is persisted on the active ChangeSet across every content-write path (the write itself still runs as the tenant's service principal). Full append-only audit stays owed under `m2-audit`.
- [x] ~~`OperatorClient.tsx` dead code~~ **Done (2026-06-24):** deleted (`/workspace/operator` still redirects to `/admin`).
- [ ] **Tenant actions** (suspend/resume, edit plan, remove from the panel) and **billing** remain deferred as before.

## Remaining LOCAL polish (no accounts needed)
- [x] **`pages` NOT NULL hardening** (`m2-fk-constraints`): **Done 2026-06-20** — migration `20260620_120000_pages_not_null` sets `NOT NULL` on `pages.tenant_id` + `pages.change_set_id_id`; verified seed + structure write paths still pass.
- [x] **Product cards section**: **Done 2026-06-20** — `products` block (image, name, price, oldPrice, badge, button); AI-composable, verified.
- [ ] **Real token streaming** (`m6-sse`): a clean animated "working" indicator now shows while the AI runs, but true token/micro-state streaming (Thinking → Applying → Updating preview) over SSE is still pending.
- [x] ~~**More section types (builder typed-blocks)**: gallery, FAQ, pricing, logos.~~ **Done (2026-06-25):** all four added as first-class builder blocks — `gallery` (image grid + captions), `faq` (Q/A), `pricing` (plan cards with price/period/per-line features/highlight/CTA), `logos` (logo strip). Wired through `blocks.ts`, intent allowlist, content-agent prompt, builder structure/defaults, layout→preview, `PreviewBlock` types, the React render + `SECTION_CHOICES`, the static `render-html.ts`, and the field-edit route; migration `20260625_171745_new_section_blocks` applied. Closes the last Phase 2 checklist item.

## Design/Layout: dynamic blocks now; formal registry later
- **What now (Phase 2 Stage 1):** a fixed, reliable set of sections (hero + 3-column features + call-to-action), each toggleable + editable, rendered in the in-Brain preview.
- **Owed (the full `AgentPlan.md` Module 7 architecture):** the dynamic **Section-primitive registry** — arbitrary blocks in any order, the machine-readable per-primitive contract, CI/AST validation, and Astro section components for the real deployed sites. The fixed set is a pragmatic first version of "compose pre-approved sections."

## Data-model simplifications (Module 2, decided 2026-06-19)

### Using `tenant` as the Site id; no separate `siteId` column yet
- **What slice 1 does:** the one-active-ChangeSet partial unique index is on `changesets.tenant_id` (siteId == tenant in v1, per `DB-Architecture.md`).
- **Owed:** a distinct `siteId`/`sites` concept when a Tenant can own more than one Site (already noted in `DB-Architecture.md` "Out of scope (v1)").

### Integer primary keys, not UUIDs
- **What slice 1 does:** Payload's default `serial` integer primary keys.
- **Owed:** `DB-Architecture.md` specifies **UUID** PKs. Switching `idType` to `uuid` is a global schema change (rebuild while the DB is empty of real data). _(Functionally equivalent for slice 1 — media paths use a separate random nonce, not the row id — but adopt UUIDs before there is production data.)_ Surfaced per the user's "clear it or log it" rule.

### Adapter concurrency hardening (per-Site advisory lock + atomic transaction)
- **What slice 1 does:** the audited adapter (`src/broker/adapter.ts`) ensures an active ChangeSet then writes, with a zero-write backstop to clean up a ghost ChangeSet if a first edit fails.
- **Owed (with the Discard feature, Codex R2 #2/#3):** wrap ensure+write in ONE DB transaction under a per-Site Postgres advisory lock shared with Discard, so a write can't race a discard. Not needed for the single-user slice-1 loop; the race first exists when Discard lands.

### Migrations: root cause found & fixed
- The `payload migrate` jams were caused by a stale `dev` row (batch `-1`) in `payload_migrations`, left by Payload's old auto-"push" mode. **Fixed:** set `db.push: false` (no more auto-push) and deleted the stale `dev` row. Migrations now run normally. Still good practice to stop the running app before migrating. _(Resolved 2026-06-19.)_

### Image storage is local; cloud media deferred to deploy
- **What now:** uploaded images are stored on the local machine (Payload's built-in upload storage) and are tenant-scoped; the hero image shows in the preview.
- **Owed at deploy (Module 10):** move media to **Cloudflare R2** (private bucket for drafts + public for published), the draft-media proxy / signed access, random-nonce staging, and reference-safe GC. For local dev, media is served with simple authenticated read (not the full private-proxy posture yet).

### `pages` NOT NULL `tenant`/`changeSetId` + FK on-delete policy
- **What slice 1 does:** `changesets.tenant` is `NOT NULL` (enforced). Payload makes draft-enabled `pages` relationship columns nullable; FKs default to `ON DELETE set null`.
- **Owed (next task — `m4-beforechange`/content-write, where it is runtime-testable):** add `NOT NULL` to `pages.tenant_id` + `pages.change_set_id_id`, and review FK on-delete (RESTRICT/CASCADE rather than SET NULL) so a Tenant/ChangeSet can't be deleted out from under its content. App layer (adapter + hook + access control) is the primary isolation control meanwhile.
