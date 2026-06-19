# Plan Review Log: SiteAgent v1 — Slice 1 (the walking skeleton)
Act 1 (grill) complete — plan locked with the user. MAX_ROUNDS=5.

Grill decisions:
- Q1 → Option B: vertical-slice-first via the `../.serve/ProjectPlan.html` tracker (not module order, not horizontal waves).
- Q2 → native installed Postgres for local dev.
- Q3 → Option B: in-Brain preview now; real Cloudflare-Workers SSR preview + draft-media proxy later.
- Q4 → Gemini Pro for the content agent (no Claude key yet); `{provider, modelSlug}` seam built.
- Q5 → Option B: minimal seed script instead of full `provisionTenant()`.
- Q6 → Option B: local-only; slice stops at preview (no publish).

Deferred work tracked in `PENDING.md`. Working prefs: per-task progress updates + a plain-language dated `CHANGELOG.md`.

---

## Round 1 — Codex
Findings:

1. (PLAN approach §5) Blocking set written as `active, published, aborted` is wrong — `published`/`aborted` are terminal non-blocking; architecture's blocking set is `active, previewing, publishing, deployed_pending_publish`. Fix: implement the full status enum + full blocking partial index now, even if slice 1 only transitions active→aborted/published.
2. (§12) `beforeChange` separated from first-write ChangeSet creation with no single atomic primitive → hook can throw before ensure, or ensure creates a ghost ChangeSet if the write fails. Fix: one transaction wrapper `ensureActiveChangeSetThenWrite`; test write failure rolls back both.
3. (§22 seed vs NOT NULL changeSetId) Broad seed `systemPurpose` bypass either violates the changeSetId invariant or normalizes tenant content outside a ChangeSet. Fix: seed starter content through the same ChangeSet path, then mark published/terminal with a narrow bootstrap-only purpose.
4. (§13 only-door vs §22 seed) Seed using Local API is the first exception to the single-adapter rule. Fix: seed/reset call the audited adapter or a separately lint-allowlisted bootstrap adapter with a tiny reviewed surface.
5. (§24 in-Brain preview) No public read DTO or session binding defined → a preview route taking tenant/changeSet params and reading as the service principal is a tenant-leak. Fix: preview-read derives tenant from the logged-in human session, ignores client tenant IDs, pins active ChangeSet server-side, returns allowlisted public fields only.
6. (§24 vs tracker DEPS) `m13-workspace` depends on `m8-ssr-worker` in the tracker, but the plan substitutes in-Brain preview — claims tracker order while breaking the graph. Fix: add an explicit slice-1 tracker substitute task / dependency override.
7. (PENDING:25 vs PLAN §16/§61) Strict intent schema is the Gemini safety control for slice 1 but was deferred to PENDING. Cannot be deferred. Fix: move strict intent schema + parse-failure + unknown-field rejection + bad-model-output tests into slice 1.
8. (§25 lite discard) Even single-user, discard can race an in-flight agent write (SSE/model/write latency) and recreate draft state. Fix: per-site mutex/advisory lock around write + discard now, even with full leases deferred.
9. (§9 drafts/versions) Autosave/admin-version writes can invoke hooks differently → versions without the ChangeSet stamp. Fix: disable autosave for slice 1 or test create/update/autosave/version rows all carry tenant + changeSetId.
10. (§15 isolation tests) Tests miss higher-risk skeleton shortcuts. Fix: add tests for system-purpose denial, preview cross-tenant param tampering, invalid-intent no-op, and discard/write race.

VERDICT: REVISE

### Claude's response
All 10 findings accepted — every one targets a real hole the skeleton's shortcuts could open, and none weakens the locked architecture. Revisions applied to PLAN.md:
1. §5 now implements the FULL status enum + full blocking partial index (`active, previewing, publishing, deployed_pending_publish`) from day one; slice 1 only exercises active→aborted/published but the constraint is correct and drift-proof.
2. §12 adds a single `ensureActiveChangeSetThenWrite` transaction wrapper + rollback test.
3. §22 seed now writes starter content THROUGH a ChangeSet, marks it terminal, via a narrow bootstrap-only purpose (no general tenant-content bypass).
4. §22 seed routes through a separately lint-allowlisted bootstrap adapter with a tiny reviewed surface — the only sanctioned second `payload` holder.
5. §24 preview-read derives tenant from the human session, ignores client IDs, pins the ChangeSet server-side, returns an allowlisted public DTO.
6. §24 adds an explicit slice-1 substitute task `m8-inbrain-preview` with a dependency override so the tracker stays truthful.
7. Strict intent schema (+ parse-fail / unknown-field / bad-output tests) MOVED into slice 1 (§16); PENDING updated to defer only advanced hardening.
8. §25 discard takes a per-site Postgres advisory lock shared with the write path.
9. §9 disables Payload autosave for slice 1 + a test asserting every write path (create/update/version) stamps tenant + changeSetId.
10. §15 isolation tests extended with the four extra cases.
Nothing rejected.

---

## Round 2 — Codex
7 of 10 prior findings addressed cleanly; 3 partial + new edges. Remaining (6):
1. Tracker `../.serve/ProjectPlan.html` still has `m13-workspace → m8-ssr-worker`; PLAN claimed the override was recorded there but it wasn't. Fix: update the tracker or stop claiming it.
2. Sequencing: `ensureActiveChangeSetThenWrite` placed on the adapter (§13) but described in §12 before the adapter exists. Fix: primitive lives in the adapter step; `m4-ensure-changeset` is the lower-level transaction contract it calls.
3. Discard takes a per-site advisory lock but writes weren't required to take the same lock → race not actually closed. Fix: the write primitive must take the same per-site lock before ensure/write.
4. Seed marks ChangeSet `published` but doesn't publish a real Payload document/version → "Published"/discard-to-starter can be fake. Fix: seed creates a real published baseline via Payload's publish/version path preserving tenant + changeSetId.
5. `systemPurpose` still described as an example bypass while seed uses a narrow bootstrap adapter — ambiguity where bypasses spread. Fix: bootstrap purpose may create tenant/principal/login/initial ChangeSet + a named publish-baseline op only; all other tenant content goes through the ChangeSet write path.
6. New edge: no test for "published baseline + active draft + discard restores published". Fix: add the e2e visible-state-cycle test.

VERDICT: REVISE

### Claude's response
All 6 accepted; nothing rejected. Revisions:
1. Added **Step 0** to the approach — updating the tracker (`m8-inbrain-preview` + dep override + content-version bump) is now the explicit FIRST build action, and PLAN no longer claims it's already recorded.
2. §13 (adapter) now hosts the unified `ensureActiveChangeSetThenWrite` primitive; §12 (`m4-ensure-changeset`) is the lower-level transaction contract it calls.
3. §13 primitive takes the **per-Site advisory lock first**, then ensure+write inside it — the same lock §25 discard takes, so the race is genuinely closed.
4. §22 seed now publishes a **real** baseline via Payload's supported publish/version path (preserves tenant + changeSetId), not a bare status flip.
5. §11 narrows the bootstrap purpose to tenant/principal/login/initial-ChangeSet + the one named publish-baseline op; all other tenant content goes through the ChangeSet path, with tests.
6. DoD adds the **visible-state-cycle e2e test** (published starter → active draft → preview → discard restores published → no active ChangeSet remains).

---

## Round 3 — Codex
All six round-2 issues confirmed resolved (tracker Step 0, adapter sequencing, shared per-site lock, real publish baseline, narrowed bootstrap purpose, visible-state-cycle test). One non-blocking note: PENDING.md still described the seed as a Local-API insert; mirror the bootstrap-adapter detail so future readers don't re-simplify it. No new material sequencing or isolation holes.

VERDICT: APPROVED

### Claude's response
Applied the non-blocking cleanup to PENDING.md (bootstrap adapter + real published baseline + a "do not re-simplify" warning). Plan converged: REVISE(10) → REVISE(6) → APPROVED in 3 rounds, 16 findings raised, all 16 accepted, 0 rejected.

## Outcome
Slice-1 execution plan APPROVED by cross-model review. Awaiting user sign-off before any code.
