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
