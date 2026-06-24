# SiteAgent — Pending Work, Phased

_The ordered plan for what's left. Phase 1 first. Cross-referenced with `../.serve/ProjectPlan.html` module IDs (m1–m14) and `PENDING.md`._

## Phase 1 — Operator + run it for real
1. **Operator admin panel** (m11) — ✅ **v2 done (2026-06-24).** Real dashboard at `/admin` (Payload moved to `/admin/payload`): tenants list + usage, add-tenant, per-tenant detail, AI settings (encrypted key + model picker), and **operator impersonation** (enter a tenant's workspace, view-only unless the tenant allows edit — server-enforced). Single login at `/`. Still owed: tenant suspend/billing/roles, secrets server-side, github-app, automated guard tests.
2. **Host the platform for real** (`m1-host-warm` + **R2 media** m10) — deploy the editor itself to a warm paid host + managed Postgres (localhost-only today) so real clients can use it.
3. **Block-builder UX polish** (m13) — loading states, publish/discard UX, mobile/responsive.

## Phase 2 — Finish the live product (Connected Sites)
4. **Connected UI polish** — ✅ mostly done (progress bar + cancel + ⋮ badge). Remaining: cosmetic top-bar + chat-section layout; verify the Cancel kill-tree on a live clone/build/deploy.
5. **Custom domains** — publish to the client's real domain, not just `*.pages.dev`.
6. **Connected structural edits** (`m14-structural`) — add/remove pages & sections, design/layout changes.

## Phase 3 — Production safety & scale
7. **Bulletproof publishing** (m9 saga) + **DB hardening** (m2 — audit log, edit locks, indexes).
8. **Automated provisioning** (m3) — one-click new-client setup (repo + Cloudflare + login).
9. **Real preview infrastructure** (m8) — replaces the current in-app preview.
10. **Monitoring / observability** (m12) — logs + alerts on publish/deploy failures.

## Phase 4 — Smaller owed items
11. **AI token streaming** (`m6-sse`) — true Thinking → Applying → Updating states.
12. **More section types** (gallery, etc.) for the block builder.
13. **Structural agent + component registry** (m6/m7) — the engine behind structural edits.

---
**Status:** Phase 1 #1 (Operator admin panel) ✅ v2 done — dashboard + tenant onboarding + impersonation + AI settings. Next: **Phase 1 #2 — Host the platform for real** (deploy the Brain off localhost + R2 media). _(Reminder: run `pnpm payload migrate` before the new admin features work.)_
