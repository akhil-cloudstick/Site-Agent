# SiteAgent — Pending Work, Phased

_All remaining work in two sections: **LOCAL** (build + test on your machine first) and **DEPLOY** (after local is done). Tick a box as you finish each task. Task IDs in `()` map to `../.serve/ProjectPlan.html`._

> Rule of thumb: if the Brain does it by calling an API (Cloudflare, R2, GitHub), it's **local**. Only the Brain physically running on a server is **deploy**.

---

## 🖥️ SECTION 1 — Complete on LOCAL (your machine first)

### Phase 1 — Finish what's half-done
- [ ] Finish **Publish UX** in the block builder (`m13-publish-ux`)
- [ ] Finish **Discard UX** in the block builder (`m13-discard-ux`)
- [x] **Verify Cancel** actually kills a live clone / build / deploy _(verified 2026-06-25)_
- [x] **Verify AI chat key** works from `/admin → Settings` on builder + connected sites _(verified 2026-06-25)_

### Phase 2 — Structural editing (biggest feature)  _(✅ complete 2026-06-25)_
- [x] **Add / remove / reorder pages** (`m14-structural`) _(2026-06-25)_
- [x] **Add / remove / reorder sections** (`m14-structural`) — sections + repeated items (cards, nav links, buttons): reorder · duplicate · remove · AI-edit _(2026-06-25)_
- [x] **Gallery + more section types** — builder typed blocks **Gallery · FAQ · Pricing · Logos** added (fields, AI intent, render, publish, migration). Connected sites also offer them via the AI "+ Add section". _(2026-06-25)_
- [x] **`data-sa` marker robustness** so connected-site edits survive a redesign — fingerprint re-matching (`remapDraft`) + server-stamped `data-sa-link`/`data-sa-item` _(2026-06-25)_

### Phase 3 — Custom domains
- [ ] **Attach a custom domain** to the site's Cloudflare project
- [ ] **Show the DNS record** for the client to add + **verify Active/Pending**

### Phase 4 — Admin / operator completeness  _(✅ complete 2026-06-26)_
- [x] **Suspend / resume** a tenant _(2026-06-26)_ — sets `Tenants.status`; a suspended tenant's own members are locked out (suspended screen + 403) and operator impersonation is blocked.
- [x] **Remove** a tenant (with cleanup of its sites/jobs) _(2026-06-26)_ — cascade delete (sites/pages/changesets/media/jobs/error-logs + local folders), an opt-in checkbox to also delete the Cloudflare project, a "Suspend instead" softer option, and typed-slug confirmation.
- [x] **Set a plan label** _(2026-06-26)_ — `Tenants.planLabel`, shown on the dashboard + detail.
- [x] **Usage history (light)** _(2026-06-26)_ — live per-tenant totals + last-30-day counts (publishes, media + storage MB, jobs, errors).
- [x] **Per-model usage** _(2026-06-26)_ — `/admin/settings` shows each model's progress bar (share of calls) + call/fail/token counts (`modelUsage` collection; `chat()` now records OpenRouter's token usage).
- [x] **Error log** _(2026-06-26)_ — `/admin/errors` lists every failure a tenant hit (connect/publish/page-create/AI overload) with what they tried + why; captured via `logTenantError` at every seam + the job runner.

### Phase 5 — Polish  _(✅ complete 2026-06-26)_
- [x] **Token streaming** — Thinking → Applying → Updating (`m6-sse`) _(2026-06-26)_ — both chat routes stream REAL backend stages as NDJSON; the chat skeleton shows the live stage (no more fake timer).
- [x] **Mobile / responsive** layout (`m13-responsive`) _(2026-06-26)_ — both editors collapse to **Chat⇄Preview tabs** on narrow screens (≤768px, splitter hidden, chat full-width); admin gets a collapsing sidebar + horizontally scrollable tables.

### Phase 6 — Pre-deploy prep (built locally, required before deploy)
- [ ] **Move media to R2 / cloud storage** (`m10`) — builder's local-disk images break on a server
- [ ] **Secrets via config seam everywhere** (`m11-secrets` — code side)
- [ ] **Switch IDs to UUID** (optional, do before real data exists)

### Phase 7 — Optional / advanced (only if you want the hardened version — still all local)
- [ ] Publish saga with rollback/compensation (`m9-*`)
- [ ] Automated provisioning — repo + Cloudflare + login (`m3-*`)
- [ ] Audit log + edit-leases + DB hardening (`m2-*`)
- [ ] Section primitive registry + CI checks (`m7-*`)
- [ ] SSR-on-Workers real preview (`m8-*`)
- [ ] Observability / correlation IDs (`m12-*`)

---

## ☁️ SECTION 2 — Needs DEPLOY (after local is done)

### Phase 8 — Go live
- [ ] **Deploy the Brain** to a warm paid host — Railway / Fly / Render (`m1-host-warm`)
- [ ] **Managed Postgres** (Neon paid, no idle pause)
- [ ] **Run migrations** on the host
- [ ] **Load secrets** into the host's secret store (`m11-secrets` — final step)
- [ ] **Wire R2 + Cloudflare creds** in production
- [ ] **Domain for the platform itself**

### Phase 9 — Post-deploy verify & ops
- [ ] **Confirm R2 serves media** correctly (no local disk)
- [ ] **Confirm no cold-start / DB-pause** problems
- [ ] **CI pipeline** — lint / typecheck / test (`m1-ci`)
- [ ] **Write the host doc** — "$0 tier is dev-only" (`m1-host-doc`)
- [ ] **Monitoring / alerts** on publish/deploy failures (`m12`)

### Later (after launch)
- [ ] GitHub App per-repo tokens (`m11-github-app`)
- [ ] Billing + team roles (`m11-roles-open`)
