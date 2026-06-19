# Architecture: SiteAgent v1 — Runtime Topology
_Locked via grill-with-docs — by Claude + Dineshraj. Terms per `CONTEXT.md`. Feature/security design lives in `AgentPlan.md`; this doc only answers "what programs run, where, and how they talk." Hardened against Codex review._

## Goal
Define the concrete v1 system architecture for the Product described in `AgentPlan.md`: the set of running programs, where each is hosted, the data stores, and the contracts between them — chosen for a **solo builder, shipping in weeks, at pilot scale (1–20 Tenants)**. The architecture favours **one boring, stable codebase over many clever distributed parts**, and keeps a marked, low-effort upgrade path to (optionally) the Cloudflare-Workers content stack later. It must **not** weaken any tenant-isolation, token-free-build, protected-merge, or reference-safe-GC control that `AgentPlan.md` hardened over 8 review rounds.

## Decisions locked in the grill (the foundation)
1. **One deployable program** for the "brain" in v1 (chat UI + agent + Tool broker + Payload CMS + publish saga in one codebase). _Grill Q1._
2. **Path B — Node + Postgres** for the CMS, **not** Cloudflare Workers + D1. Path B is Payload's blessed, stable setup; it makes the one-program design trivially correct because the CMS and the trusted backend share one process and one DB connection. _Grill Q2._
3. **AI access on hand:** Claude (Anthropic) + Gemini (Google), behind a config seam; OpenRouter later. _Grill._
4. **Hosting budget:** see "Hosting tiers & honest $0 scope" below — $0 is for **dev/demo only**; a real pilot needs a warm paid host. _Grill + Codex #11._

## Relationship to `AgentPlan.md` and the spike (Codex #13)
`AgentPlan.md` lists two content-hosting paths and says "run the Cloudflare+Payload spike first." This Architecture **chooses Path B (Node + Postgres)**, which `AgentPlan.md` itself blesses as the **known-safe fallback that needs no spike** ("Payload's blessed model"). Therefore: **the 10-gate spike (`Spike.md`) is NOT on the v1 critical path** — it exists only to qualify Path A (Cloudflare Workers/D1), which v1 does not build. The spike is revived only if/when the Operator later pursues Path A. _This doc supersedes the "spike is the next step" status in `AgentPlan.md` for v1 scope; update `AgentPlan.md`'s closing status line to point here when implementation starts._

## The picture
```
                          ┌───────────────────────────────────────────────┐
   Tenant (browser) ───▶  │  THE BRAIN — one Node/Next.js app, one codebase │
                          │                                                 │
   ┌──────────────────┐   │  ┌─────────────┐  ┌────────────────────────┐    │
   │ Chat + Preview UI │◀──┤  │ Chat/agent  │  │ Payload CMS            │    │
   │ (in the same app) │   │  │ orchestrator│  │ - admin UI (per Tenant)│    │
   └──────────────────┘   │  │ (Claude/    │  │ - content collections  │    │
                          │  │  Gemini)    │  │ - multi-tenant plugin   │    │
                          │  └──────┬──────┘  │ - drafts/versions       │    │
   ┌──────────────────┐   │  ┌──────▼───────┐ └───────────┬────────────┘    │
   │ Draft-media proxy │◀──┤  │ Tool broker  │─────────────┘ Local API       │
   │ (gated by Access) │   │  │ (single      │   (single audited adapter,     │
   └──────────────────┘   │  │  audited gate)│   per-Tenant service principal)│
                          │  └──────┬───────┘  ┌────────────────────────┐    │
                          │         │          │ Publish saga + Jobs     │    │
                          │         │          │ (durable: leases,       │    │
                          │         │          │  checkpoints, webhooks) │    │
                          │         │          └───────────┬────────────┘    │
                          └─────────┼──────────────────────┼─────────────────┘
                                    │                      │
                 ┌──────────────────┼───────────┐          │
                 ▼                  ▼            ▼          ▼
          ┌────────────┐    ┌────────────┐  ┌────────┐  ┌──────────────────┐
          │ Postgres   │    │ GitHub App │  │ Cloudfl│  │ PROD = Cloudflare │
          │ content +  │    │ (private   │  │ -are R2│  │ Pages STATIC      │
          │ control    │    │  per-Tenant│  │ media  │  │ snapshot build    │
          │ plane data │    │  repos)    │  │(priv + │  └──────────────────┘
          │ (constraints│   └────────────┘  │ public)│  ┌──────────────────┐
          │  enforced) │                    └────────┘  │ PREVIEW = Cloudfl │
          └────────────┘                                │ -are WORKERS SSR  │
                                                        │ per ChangeSet br. │
                                                        │ (drafts, gated)   │
                                                        └──────────────────┘
```
> **Preview runs on Cloudflare WORKERS, not Pages** — Astro's `@astrojs/cloudflare` SSR adapter is Workers-only (`Spike.md`); Cloudflare Pages is used **only** for the static production build. (Codex N1.)

## Hosting tiers & honest $0 scope (Codex #11)
| Tier | Brain host | Postgres | Use |
|---|---|---|---|
| **$0 — dev/demo ONLY** | Local machine, or Render Free (512 MB/0.1 CPU, cold-starts) | Neon Free (0.5 GB, **pauses after 5 min idle**) | Building, throwaway demos. **Not** for real Tenants — cold starts + DB pauses make the publish saga unreliable. |
| **Pilot minimum (recommended for any real Tenant)** | Railway/Fly/Render **paid, always-warm** (~$5–8/mo) | Neon paid or the host's managed Postgres (no idle pause) | First paying/real Tenants. This is the true floor; $0 is explicitly *not* a pilot substrate. |

Media (Cloudflare R2 free 10 GB), customer Sites (Cloudflare Pages), and code (GitHub) stay free at pilot scale regardless of tier. Swapping $0 → pilot is a host change, **no code change**.

## Components & where they run

### 1. The Brain — one Node/Next.js application
Payload v3 **is** a Next.js app, so the Product is one Next.js codebase containing: Payload CMS (admin + content collections + multi-tenant plugin + drafts/versions), the Tenant-facing **Chat + Preview UI** (custom routes), the **Agent orchestrator**, the **Tool broker**, the **draft-media proxy**, and the **Publish saga + Jobs**. All share one process and one Postgres connection — the reason Path B was chosen (broker/saga call Payload's **Local API in-process**, no self-HTTP).

### 2. Content + control-plane database — one Postgres
- **Content** in Payload collections, tenant-scoped by the multi-tenant plugin.
- **Control-plane data** in the same Postgres as admin-only Payload collections, **with hard DB constraints, not convention (Codex #10):**
  - `tenants` → `{ githubRepo, deployProjectId, status }`.
  - `changesets` → the state machine (`AgentPlan.md` §9). Enforced by a **partial unique index** `UNIQUE(siteId) WHERE status IN ('active','previewing','publishing', <unresolved-failure states>)` so **one active/blocking ChangeSet per Site** is a DB guarantee; transitions go through guarded application code that rejects illegal moves and **blocks new ChangeSets while a Site is in any unresolved failure state**.
  - `media_refs` → reference registry **with explicit states + transactional rules (Codex #9, N2):** a ref is `staged` (row written **before** the R2 object is copied; production not yet serving it), `deployed` (production deploy succeeded and is serving it, **but Payload publish has not yet succeeded**), `live` (deploy **and** publish both succeeded), or `orphaned`. Promotion is strictly `staged → deployed` (on deploy success) → `live` (on publish success). **GC deletes an R2 object only if every one of its `media_refs` is `orphaned` — i.e. it has no `staged`, `deployed`, or `live` ref — under a row lock (Codex N6).** This protects not only media production is serving (`deployed`/`live`) but also **in-flight `staged`** objects a concurrent saga has reserved but not yet deployed. A ref transitions to `orphaned` **only under the per-Site saga lock after an abort/failure** — and for post-deploy cases, only **after the revert deploy reaches `success`** (production no longer references them); the object is GC'd after that transition. Mirrors `AgentPlan.md` §5 reference-safe GC with concrete DB semantics.
  - `audit_log` → append-only; see Observability.
- **Host:** Neon (tier per table above).

### 3. Per-Tenant website code — GitHub (private repos, free) (Codex #4)
- One **private** repo per Tenant from a **Template repo** (Astro starter + Section primitive library + snapshot-based static build).
- The Brain acts via a **GitHub App** on the Operator's org (per-repo installation tokens). The App identity is **never on the production branch protection bypass list** (`AgentPlan.md` §9 / round-8 C2).

### 4. Per-Tenant media — Cloudflare R2 (free 10 GB)
- `@payloadcms/storage-r2` / S3 adapter. **Private bucket** for draft media; **public bucket** for published media, staged to **random-nonce paths** before go-live with reference-safe GC (`media_refs` above; `AgentPlan.md` §5/§9). Draft media is **never** served by expiring signed URLs in the UI — it goes through the Brain's draft-media proxy (Contract C).

### 5. Per-Tenant Sites — two distinct Cloudflare surfaces (Codex N1)
Astro's `@astrojs/cloudflare` SSR adapter is **Workers-only**, so the two surfaces are **different Cloudflare products**, not two modes of one Pages project:
- **Preview = SSR on Cloudflare Workers**, one deployment **per ChangeSet branch**, reading **drafts** via the Brain, **gated by Cloudflare Access** (Contract C). This is `AgentPlan.md` §5's "SSR on Cloudflare Workers."
- **Production = static snapshot build on Cloudflare Pages** (free `*.pages.dev`), token-free, from committed `content.snapshot.json` + `media-manifest.json` (`AgentPlan.md` §2/§5). Fails closed if snapshot files are absent. (Workers Static Assets is the alternative static host; Pages chosen for free per-Tenant project simplicity.)

## Key contracts (how the parts talk)

### A. Agent → change, through the broker, as a per-Tenant service principal (Codex #1, #14)
- The agent **never** touches a store directly; it emits *intents* to the **Tool broker**, hard-bound to the current Tenant + Site + ChangeSet + per-mode allowlist.
- **Identity:** the broker acts as a **per-Tenant service principal** — a dedicated Payload user with a **minimal role** (CRUD on that Tenant's content collections only; **no** admin/schema/user-management powers), created at provisioning. The human Tenant is recorded as the **initiator** for audit but is **never** the principal the write executes as — so the agent can't inherit a human editor/admin's broader powers.
- **Content writes — single audited Local-API adapter:** there is exactly **one** module that imports/holds the `payload` handle. It always calls Local API with **`overrideAccess: false`** and the **service principal `user`** (identical enforcement to a scoped REST call: multi-tenant rules + validation + hooks all run). A **lint rule denies any other `payload.*`/`getPayload` import** in the codebase, and **isolation tests** assert cross-Tenant reads/writes fail. This is the load-bearing isolation control — see Risks.
- **Code writes:** broker commits to the ChangeSet branch via the GitHub App, restricted to the **theme/templates/CSS/content path allowlist** and enforced by the full build-surface lockdown (Contract D).

### B. Every content write forced into the active ChangeSet — system calls can't bypass (Codex #2)
- A shared **`beforeChange` hook** on tenant-scoped collections derives the active ChangeSet from the principal and stamps `changeSetId`; **no active ChangeSet → `throw Forbidden`** (`AgentPlan.md` §3).
- **System/Jobs writes are deny-by-default:** because provisioning/publish Jobs run in-process and would otherwise pass `!req.user`, the hook **rejects** any tenant-scoped content write that lacks either (a) a real Tenant principal with an active ChangeSet, or (b) a **typed, allowlisted `req.context.systemPurpose`** (e.g. `'materialize-snapshot'` which is read-only, or an explicit migration). **Tests prove a Job cannot create/modify Tenant content outside a ChangeSet.**

### C. Preview = SSR-on-Workers drafts + gated draft-media proxy (reverted from static — Codex #3,#4,#5,#6,#16,N1,N3,N4)
- **Preview is SSR on a Cloudflare Worker** per ChangeSet branch, reading **live drafts** from the Brain — no per-edit static rebuild, so no build-order races (#5) and no Cloudflare Pages Free build-limit exhaustion (#6).
- **Preview runs agent-edited branch code, so it is locked down BEFORE it deploys (N3):** every **preview deployment** must first pass the **same build-surface gate as merge** — path denylist + **AST/env/network guard** (`AgentPlan.md` §9) — so a malicious/broken branch can't add `fetch`/`process.env`/`child_process` to exfiltrate. The preview's draft-read path goes **only through the Brain's proxy** using a **ChangeSet-scoped, read-only, public-DTO-only** credential that returns nothing but allowlisted public fields for *that* ChangeSet and is **useless outside the proxy** (no Tenant API key, no admin token, no cross-ChangeSet reach). Blast radius of a leaked preview credential = read-only public-DTO view of the Tenant's own ChangeSet.
- **Draft media never leaks:** the SSR preview references **stable proxy URLs** `https://<brain>/preview-media/<tenant>/<id>` served by the **Brain's draft-media proxy**, which checks the Cloudflare Access / Payload session and streams from the **private** R2 bucket. **Authorization (N4):** serve the asset iff it is **Tenant-owned AND referenced by either the active ChangeSet's draft graph OR the Tenant's current live published snapshot** — so previews that reuse already-published/shared media still render, but cross-Tenant/unreferenced assets are refused. No expiring signed URL is baked into HTML; draft media is **never** staged publicly (#3); no draft snapshot is committed to Git (#4).
- **Preview gating is proven, not assumed (#16):** provisioning includes a **gate verifying Cloudflare Access protects the exact preview Worker URL shape** before the Site is usable; if Access can't be proven for that URL shape, previews are served **through the Brain** (already behind Access). The SSR→Brain draft-read secret is server-side only, never exposed to the browser.

### D. Publish saga — protected merge, durable jobs (Codex #7,#8,#12)
The saga from `AgentPlan.md` §5 runs as **Payload Jobs** in the Brain, made **durable (#12):** every step has an **idempotency key**, holds a **Postgres advisory lock / lease** per Site (single-worker semantics — no two saga runs for one Site), writes **per-step checkpoints**, and resumes from **webhook replay** (Cloudflare deploy webhooks) rather than long polling.

Ordering (hardened):
1. Materialise + **sanitise** snapshot via Local API → `content.snapshot.json` + `media-manifest.json` (full DTO allowlist + fail-closed + strict JSON-Schema, `AgentPlan.md` §5 step 1 / round-8 C1).
2. Stage media to public **random-nonce** paths; write `media_refs` as `staged` **before** copy (Contract A / #9).
3. **Commit snapshot + media-manifest to the branch FIRST — before required human review (#8)** — so the reviewed head SHA already includes the generated files. No bot commit lands *after* approval.
4. **Protected merge (#8):** require **stale-review dismissal** on the production branch; verify **all required GitHub checks on the exact final head SHA**; merge with the **expected SHA** (`PUT /merge` 405 is the hard gate). Required checks = the **full build-surface lockdown copied verbatim from `AgentPlan.md` §9 (#7):** path allowlist **+ denylist** (`package.json`/lockfiles/`astro.config.*`/adapters/`scripts/`/`functions/`/`_worker.js`/`wrangler.*`/`.github/**`/CODEOWNERS) **+ AST/env/network guard** (`process.env`/`import.meta.env`/`fetch`/`child_process`/`fs`-writes) **+ CODEOWNERS review (path-scoped)** + registry check + snapshot-schema check. **CODEOWNERS review is required only when the ChangeSet modifies code-owned (build-surface / structural-code) paths**; a **content-only publish** changes only the generated `content.snapshot.json` + `media-manifest.json` data (not code-owned paths) and therefore **auto-satisfies the review check with no human approval** — so routine content edits publish without per-edit gatekeeping, while code changes still require platform review (`UserFlow.md` Flow 6). Production branch ruleset has an **empty bypass list**; the GitHub App is not exempt.
5. Merge triggers the **single** Pages production build (token-free static); **resume on the Pages deploy webhook** matched to the merge SHA.
6. On `deploy=success`: promote `media_refs` `staged → deployed` (production now serves them; **not yet `live`** — N2); **then publish via Payload's publish API** (never a direct version-table write). **Only after publish succeeds:** promote `deployed → live`, ChangeSet → `published`. If publish fails here, the ChangeSet is `deployed_pending_publish`, refs stay `deployed` (GC-protected, since production is serving them) until the recovery saga either retries publish or reverts the merge and demotes/ GCs after the revert deploy succeeds.
- Compensation/rollback (`failed_deploy_reverted`, `deployed_pending_publish`, `rolled_back_from_deployed_pending_publish`, revert-the-merge, reference-safe GC of non-`live` refs) **exactly as `AgentPlan.md` §5** — saga steps, not new design.

### E. Identity & auth (Codex #14)
- **Human Tenants** authenticate with Payload users, scoped by the multi-tenant plugin; the same login gates the Chat+Preview UI and the Tenant-scoped Payload admin. The **Operator** is an admin user.
- **The agent/broker is a separate per-Tenant service principal** (Contract A), distinct from any human user. Tenants never receive raw GitHub/Cloudflare credentials; only the Brain holds those (server-side env). Roles/billing remain an `AgentPlan.md` open item.

### F. Agent model seam
- Config point `{ provider, modelSlug }`; v1 default **Claude** (structural/code) + **Gemini** (content/routing); OpenRouter later (`AgentPlan.md` §7). UI streams agent output via **Server-Sent Events**.

## Observability (Codex #15)
- **One correlation ID** threads a Tenant request → ChangeSet → Job run → Git commit → Cloudflare deployment → `media_refs` ops, in every log line.
- **`audit_log` is append-only and covers every risky operation, not just "broker action":** each saga state transition, every Local-API write (principal + Tenant + collection + doc), generated **snapshot content hashes**, GitHub **merge attempts** (+ result, incl. 405), Cloudflare **deploy webhook** payloads, media **copy/promote/GC**, and **every access denial** (cross-Tenant attempt, no-ChangeSet write, lockdown CI failure).

## Deviations from `AgentPlan.md` (post-review status)
1. **Broker uses a single audited Local-API adapter as a per-Tenant minimal-role service principal (`overrideAccess:false`)** instead of REST-with-API-key. Hardened per Codex #1/#14: one `payload` handle, lint-denied elsewhere, isolation tests, no admin inheritance. Enforcement is identical to scoped REST; the win is in-process simplicity. **Residual risk owned in Risks.**
2. ~~Static-rebuild preview~~ **WITHDRAWN.** Reverted to **SSR draft preview + gated media proxy** (Contract C), realigning with `AgentPlan.md` §5. The static simplification was a net negative (draft-media privacy hole, Git leak surface, build races, Pages free-tier build limits).
3. **Cloudflare-Workers/D1 + the 10-gate spike are deferred** (Path B chosen). Reconciled with `AgentPlan.md` status above (#13); v1 needs no spike.

## Risks / open questions
- **The single Local-API adapter is now the load-bearing tenant-isolation control (Deviation #1).** Mitigate: one exported handle, lint rule denying other `payload` imports, mandatory `overrideAccess:false` + service-principal `user`, and cross-Tenant isolation tests in CI. A bug here = cross-Tenant leak.
- **$0 substrate is dev/demo only** — real pilots must use the warm paid tier (cold starts + Neon idle-pause break the saga). Documented in Hosting tiers.
- **Durable jobs on a single small host** — advisory-lock leases + checkpoints + webhook replay give single-worker correctness; revisit a real queue (e.g. pg-boss) before multi-instance scaling.
- **Cloudflare Access on preview URLs is proven at provisioning (#16)** — if it can't be proven for the **preview Worker URL shape**, previews route through the Brain behind Access; confirm during the first Tenant provisioning.
- **Tenant auth/roles/billing** still unspecified beyond store access (inherited from `AgentPlan.md`).
- **Cloudflare Pages production build minutes / project count** on free tier at pilot scale — confirm as Tenants grow (preview is SSR so it doesn't consume build minutes).

## Out of scope (v1)
- Cloudflare Workers + D1 content hosting and its spike (deferred — Path A).
- Splitting the agent/broker/CMS into separate services (one program in v1).
- Custom domains, OpenRouter, DB-per-Tenant isolation, billing — later, per `AgentPlan.md`.

## Review status
- Act 1 (grill-with-docs) complete — topology locked with the user; `CONTEXT.md` written.
- Act 2 (Codex): **R1 REVISE (16) → R2 REVISE (5) → R3 REVISE (1) → R4 ✅ APPROVED.** Converged at round 4/5; 22 findings raised, all resolved, 0 rejected.
