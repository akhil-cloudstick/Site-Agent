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

### Phase 2 — Structural editing (biggest feature)  _(connected sites — done 2026-06-25)_
- [x] **Add / remove / reorder pages** (`m14-structural`) _(2026-06-25)_
- [x] **Add / remove / reorder sections** (`m14-structural`) — sections + repeated items (cards, nav links, buttons): reorder · duplicate · remove · AI-edit _(2026-06-25)_
- [ ] **Gallery + more section types** — the **builder's** typed gallery/FAQ/pricing/logos blocks (separate, lower-priority). On a **connected** site these can already be added via the AI "+ Add section".
- [x] **`data-sa` marker robustness** so connected-site edits survive a redesign — fingerprint re-matching (`remapDraft`) + server-stamped `data-sa-link`/`data-sa-item` _(2026-06-25)_

### Phase 3 — Custom domains
- [ ] **Attach a custom domain** to the site's Cloudflare project
- [ ] **Show the DNS record** for the client to add + **verify Active/Pending**

### Phase 4 — Admin / operator completeness
- [ ] **Suspend / resume** a tenant
- [ ] **Remove** a tenant (with cleanup of its sites/jobs)
- [ ] **Set a plan label**
- [ ] **Usage history (light)** — edits / publishes / storage over time

### Phase 5 — Polish
- [ ] **Token streaming** — Thinking → Applying → Updating (`m6-sse`)
- [ ] **Mobile / responsive** layout (`m13-responsive`)

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
