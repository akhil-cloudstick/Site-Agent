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

## Remaining LOCAL polish (no accounts needed)
- [x] **`pages` NOT NULL hardening** (`m2-fk-constraints`): **Done 2026-06-20** — migration `20260620_120000_pages_not_null` sets `NOT NULL` on `pages.tenant_id` + `pages.change_set_id_id`; verified seed + structure write paths still pass.
- [x] **Product cards section**: **Done 2026-06-20** — `products` block (image, name, price, oldPrice, badge, button); AI-composable, verified.
- [ ] **Real token streaming** (`m6-sse`): a clean animated "working" indicator now shows while the AI runs, but true token/micro-state streaming (Thinking → Applying → Updating preview) over SSE is still pending.
- [ ] **More section types**: a gallery (multi-image) would still round out common sites.

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
