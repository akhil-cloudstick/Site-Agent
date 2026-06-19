# Plan: AI-Agent Website Customization Platform (v1)
_Locked via grill-with-docs — by Claude + Akhil. Terms per the glossary below._

> **⚠️ SUPERSEDED FOR v1 BY [`Architecture.md`](Architecture.md).** v1 ships on **Path B (Node + Postgres)** — Payload's blessed model — so **the Cloudflare-Workers/D1 spike is NOT a v1 prerequisite**. Wherever this document says "run the spike first" or "Payload on Cloudflare Workers/D1" (the Prerequisite-spike section, the Spike research & runbook, and the closing Review-status lines), treat it as **deferred Path-A material**, not the v1 plan. The runtime topology of record for v1 is `Architecture.md`.

## Context
The Operator (the client) is building a **Product** (separate from this `s:\TestUI` repo): a platform where each of their customers (a **Tenant**) gets their own website and edits it two ways — by **chatting with an AI agent**, or **directly in a CMS**. UI is chat on one side, a **live Preview** on the other, with a CMS editing panel.

Two kinds of edit:
- **Content edit** (heading text, hero image, add a blog post) → content only, no code structure change.
- **Structural edit** (new page, new block/section, new button, different layout) → changes the site code, reproducing a Tenant-supplied design reference from a library of reliable section primitives.

**v1 stack: Astro (frontend) + Payload CMS (content), on GitHub + Cloudflare.** The CMS is **Payload** — chosen over Keystatic/Sanity because it is **database-backed** (real querying, relations, roles, versions/scheduled publish), with **native i18n**, an **official multi-tenant plugin**, and **media via Cloudflare R2**. It self-hosts free (MIT) and runs on the Cloudflare stack (Workers + D1 + R2).

Architecture consequence: content lives in **one shared Payload instance** (all Tenants, **row-level tenant scoping** via the multi-tenant plugin — cheap, no per-Tenant database), while each Tenant's **code** lives in its **own GitHub repo**. So there are **two stores** — Payload (content) and Git (code) — and the preview/publish flow must coordinate both (see §5).

`s:\TestUI` (Astro + Sanity Ayurveda site) is a **pattern reference and a future example Tenant** — not the Product's template and not the CMS. Its EN/ES i18n is site-specific; multilingual is per-Tenant and **natively supported by Payload** when a Tenant needs it.

> **Deploy model (spike research, 2026) — the explicit targets the rest of this doc refers to:**
> ```
> Payload CMS      : Cloudflare Worker + D1 + R2 (OpenNext; @payloadcms/db-d1-sqlite beta; Workers PAID)
>                    — fallback: Node host + Postgres if the spike fails
> Preview site     : Astro SSR on Cloudflare WORKERS (@astrojs/cloudflare is Workers-only; Pages dropped for SSR)
> Production site  : static build on Cloudflare Pages OR Workers Static Assets — CHOSEN BY THE SPIKE
> Deploy/rollback  : the "production deploy target"'s Git-build + deployment/rollback API
>                    (Pages Deploy Hooks/deployments API, or Workers Builds/wrangler) — bound once the spike picks the host
> ```
> So below, **"production deploy target"** = whichever of Pages / Workers-Static-Assets the spike selects; SSR preview is always **Workers**. Also flagged by research and resolved in the spike: **`sharp` image-resize doesn't run on Workers** (use **Cloudflare Images**), **scheduled publish needs a Jobs runner**, **GraphQL-on-Workers isn't guaranteed**. See "## Spike research & runbook" at the end.

> **Why Payload fits:** DB-backed CMS with built-in drafts/versions/scheduled publish, field-level i18n, and official multi-tenant (shared instance, row-scoped). ~$5/mo base on Cloudflare, scales cheaply across Tenants.

> **Shared-instance constraint (drives several rules below):** because all Tenants share one Payload app, **Payload block/collection *schema* is global code, not per-Tenant data.** A new block type changes the CMS for *every* Tenant. So v1 lets the agent **only compose pre-approved global primitives** for a Tenant; creating a *new* primitive type is a **Product-level (global) release**, never a per-Tenant edit. (Codex round-2 #1.)

## Glossary (to be written to CONTEXT.md if/when implementation starts)
- **Product** — the platform being built (separate from TestUI).
- **Operator** — the client who owns/sells the Product; owns the GitHub org, Cloudflare account, and the shared Payload instance.
- **Tenant** — an Operator's customer; owns one Site.
- **Site** — a Tenant's website: **one GitHub repo (code)** + **tenant-scoped content rows in the shared Payload instance** + one **Cloudflare production deploy** (deploy target per the deploy model).
- **Production deploy target** — the host for the static production site, **chosen by the spike**: Cloudflare **Pages** or **Workers Static Assets**. Its Git-build + deployment/rollback API is what the publish saga drives. (Preview SSR is always Cloudflare **Workers**.)
- **Payload instance** — one shared, Operator-hosted Payload CMS (Workers + D1 + R2) serving all Tenants, isolated by the **multi-tenant plugin** (row-level `tenant` scoping) + a per-Tenant API key.
- **ChangeSet** — one unit of edit for a Site: a **Git branch** (code) **and/or** a **Payload draft/version** (content), tracked together with a preview deploy and status. Previewed, published, and rolled back as a unit.
- **Tool broker** — Product-owned layer between the agent and the stores: for content it calls **Payload's REST/GraphQL API with the Tenant's scoped auth** (the broker enforces tenant access — it does **not** rely on the experimental MCP, and never uses the Local API's access-control-bypassing default); for code it commits to the Tenant's repo/branch. Per-mode allowlist; no raw cross-Tenant access.
- **Primitive registry** — machine-readable contract per **global** section primitive (Astro component, allowed props, examples, visual constraints, test fixture, Payload block schema, migration behavior). Primitives are global/shared, not per-Tenant.
- **Section primitive** — a pre-approved, **global**, parameterized Astro section/block (extends the `SectionRenderer` pattern; backed by a shared Payload block). Tenants compose and configure these; only the Product team adds new ones.
- **Design reference** — a Tenant-supplied screenshot/Figma/URL the agent reproduces using section primitives.

## Goal
Ship a v1 Product where a Tenant, from a chat-plus-preview UI, can (a) edit their Site's content — through the AI agent (broker → Payload REST/GraphQL, tenant-scoped) or directly in the Payload admin (tenant-scoped) — and (b) request structural changes the agent implements by **composing pre-approved global primitives** (reproducing a supplied design reference; new primitive types are Product-level releases, not per-Tenant). Content lives in one shared, row-scoped Payload instance; code lives per-Tenant in Git. Every change is a ChangeSet (Git branch + Payload draft) that lands on a gated Preview URL first; **Publish** runs a saga that snapshots content and ships a **static** production build. v1 runs one fixed stack (Astro + Payload on Cloudflare), gated on a prerequisite spike; other stacks are out of scope.

## Approach

### 1. Tenancy & provisioning (per-Tenant isolation)
Each Tenant gets, at onboarding:
1. **A GitHub repo** created from the Template repo (site code).
2. **A Tenant record + scoped API key** in the **shared Payload instance** (multi-tenant plugin) — no per-Tenant database; content is row-scoped.
3. **A Cloudflare production deploy target** (Pages or Workers Static Assets per the deploy model) producing per-branch Preview URLs (SSR on Workers) and a production URL.
- `provisionTenant()` is an **idempotent queued job**: create-repo-from-template → create Payload tenant + API key → create the **Cloudflare deploy target** (production + preview) + wire env → store the Tenant→{repo, payloadTenantId, deploy} mapping in the Product DB. Each step keyed for retry; partial-failure rollback/cleanup; record minimum Cloudflare plan tier (Payload-on-Workers needs **Workers Paid**) and watch D1/build limits at Tenant scale.
- **Stronger-isolation option (later):** Payload + **D1-database-per-Tenant** instead of shared-instance row-scoping; more wiring, harder isolation. Default v1 = shared instance + multi-tenant plugin (cheapest).

### 2. The canonical Template repo
- A clean Astro starter (composition patterns referenced from `s:\TestUI`'s `SectionRenderer`) using the **`@astrojs/cloudflare`** adapter, with two build modes:
  - **preview** = SSR on **Cloudflare Workers** (`@astrojs/cloudflare`) reading Payload **drafts** via a **tenant-scoped, draft-read-only** token, gated by Cloudflare Access.
  - **production** = a **pure static build from committed local files** — **`content.snapshot.json` + `media-manifest.json`** — with **NO Payload token in the build env** (round-7 P1). The trusted Product backend materializes those files (via Payload **Local API** `findVersionByID`/`findVersions`, no token needed) and commits them; the build only reads local JSON. So agent-edited build code has no secret to leak and no way to fetch latest/draft. Build **fails closed** if the snapshot files are absent.
- Curate a **section primitive library** governed by a **primitive registry**: each entry declares its Astro component, allowed props, examples, visual constraints, test fixture, Payload block schema, and migration behavior. This contract keeps "primitive assembly" from degrading into freeform codegen — the agent and a CI check validate every structural edit against it.

### 3. Content-edit path (agent via Payload REST/GraphQL, or human in Payload admin)
- Tenant selects **"Edit content"** mode.
- **Agent path:** the agent edits content through the **Tool broker → Payload REST/GraphQL API** using the **Tenant's scoped auth key** (Codex round-2 #2 — *not* the experimental MCP, and *not* the Local API, whose default `overrideAccess` skips access control). With `overrideAccess: false` / authenticated API calls, Payload enforces multi-tenant access rules, field validation, and hooks on every write, so the agent is scoped to the Tenant and can't write invalid or cross-Tenant data. The broker adds a content-mode allowlist (CRUD on content collections; **no schema/migration ops**).
- **Human path:** the **Payload admin UI**, served behind Product auth and scoped to the Tenant. Polished editor for non-technical Tenants (covers "both edit equally").
- **Every edit (agent *or* admin) is forced into the active ChangeSet (Codex round-3 #2, refined round-4 #4).** A shared **`beforeChange` hook** on all tenant-scoped collections **infers the Tenant's active ChangeSet from `req.user`/tenant session** — the standard admin UI can't set `req.context.changeSetId`, so the hook **derives** the active ChangeSet (via `req.payload.find`) rather than relying on context being passed — then **stamps** `data.changeSetId`. If there is **no active ChangeSet** for the Tenant it **`throw`s `Forbidden`**, aborting the write, so neither the agent nor a human admin can edit outside a ChangeSet. Guard `!req.user` (system/migration calls) and hook re-entrancy (pass `req` + a `context` flag). Admin list/edit views are also filtered to the active ChangeSet via `admin.baseListFilter` (convenience; the hook is the hard guarantee).
- Content edits are made as **drafts/versions** (written to the versions table via `draft: true`), not published, until Publish (§5).

### 4. Structural-edit path (compose GLOBAL primitives only — Codex round-2 #1)
- Tenant selects **"Change layout"** mode and supplies a **design reference** + instructions.
- The agent **reproduces the reference by composing, ordering, and configuring pre-approved GLOBAL primitives** — it does **not** create new Payload block schemas or backend config per Tenant (that would mutate the shared CMS for every Tenant). Most of this composition is **Payload page-builder content** (which global blocks, in what order, with what props), edited via the broker → Payload API like §3; per-Tenant code changes are limited to presentational/theme tweaks in the Tenant repo on a **per-ChangeSet branch**, never shared schema.
- **No fit?** If the reference needs a primitive that doesn't exist, that is a **Product-level (global) release** — a new primitive added to the shared registry + Payload schema by the Product team, versioned and rolled out to all Tenants — **not** a per-Tenant edit. The agent surfaces this as a request, picks the closest existing primitives, and asks to refine.
- Validation: registry/CI check + Astro build on the branch → Cloudflare preview deploy (SSR on Workers).
- **Hardening:** *reference-guided assembly of vetted global primitives* keeps output reliable, on-brand, and safe for the shared instance. Freeform layout generation and per-Tenant schema invention are out. The agent's repo edits are confined to a **theme/templates/CSS/content allowlist** — it cannot touch build-executable surface (build config, scripts, Workers/Pages Functions, env access, network calls); enforced by CI + CODEOWNERS (§9, round-7 P1).

### 5. Preview → Publish (publish saga — two-store coordination, Codex round-2 #4)
- A **ChangeSet** ties together its **code state** (Git branch) and its **content state** (Payload draft/version). The ChangeSet is the join key; **v1 allows one active ChangeSet per Site** so the two stores never get ambiguous.
- **Preview = dynamic SSR, one clear mechanism (Codex round-3 #3).** The branch's preview runs **SSR on Cloudflare Workers** (`@astrojs/cloudflare` adapter) and reads **live Payload drafts** through Payload **Draft Preview** (`draft: true` + a preview secret + the editor's session). Chosen over "static preview rebuilt on every draft change" because drafts change constantly — SSR shows fresh content with zero rebuild latency. (Production is the opposite — static, below.)
- **Preview protection:** the preview surface is **gated by Cloudflare Access** (allowed emails / service tokens); the draft API is reached server-side with the preview secret, never exposed publicly.
- **Draft media stays private during preview (Codex round-3 #4).** Unpublished images live in a **private R2 bucket** via `@payloadcms/storage-s3` (R2 = S3-compatible) with **`signedDownloads`** → short-lived **presigned URLs** (e.g. `expiresIn` 300–3600s), Payload's upload-collection `access.read` left **on** (do *not* set `disablePayloadAccessControl`). No public/custom-domain access, so gating the preview URL alone can't leak images. (Published media is staged to a public bucket *before* the production build — see the saga.)
- **Production = static snapshot build (not live SSR), token-free (round-4 #2 + round-7 P1).** The trusted **Product backend materializes** the frozen snapshot via Payload **Local API** (`findVersionByID` — no token, can't drift to latest) into **`content.snapshot.json` + `media-manifest.json`** and commits them. The production deploy target's build is then **pure static from those local files with zero Payload build vars** — it never calls Payload, so agent-edited build code has no token to leak and no way to fetch drafts or bypass the snapshot. Media URLs come from the committed manifest (public, not private signed URLs). Build **fails closed** if the snapshot files are missing. (Eliminates the token-in-build risk class rather than mitigating it.)
- **Publish saga (round-5 ordering — media staged before deploy; single build trigger; publish via Payload's API; content committed LAST):**
  1. **Materialize + sanitize the frozen snapshot (Product backend, round-7 P1 / round-8 C1)** — via Payload **Local API** (`findVersionByID` for the ChangeSet's exact version IDs) produce **`content.snapshot.json` + `media-manifest.json`**. No build token; can't drift to latest. **The materializer must sanitize** because the Local API runs `overrideAccess: true` (bypasses access control) and the output is public: (a) **re-validate in code** that every version's `tenant` and `changeSetId` match the expected Tenant+ChangeSet (don't trust overrideAccess scoping); (b) serialize through **explicit per-block "public DTO" mappers** that copy only allowlisted public fields and **strip** tenant IDs, `changeSetId`, auth-collection fields (`email`/`password`/`salt`/`hash`/`apiKey`/tokens), `_status`/version metadata, and internal IDs; (c) **fail closed on any unknown field or unknown `blockType`**; (d) **validate both files against a strict JSON Schema (`additionalProperties:false`) before writing** — a new CMS field can never silently leak. Same allowlisting for `media-manifest.json` (url/filename/mimeType/dimensions/alt only; drop storage internals).
  2. **Stage media to public (round-5 P1, round-6/7 hardened)** — copy the snapshot's referenced media to **snapshot-namespaced random-prefix public paths** (`media/<random-nonce>/…` — a UUIDv4/random nonce, **not** a content hash; "content-addressed ≠ unguessable", round-7 P2), record them in `media-manifest.json` and in a **media reference registry** (object → set of snapshots referencing it). Objects exist *before* the site goes live (no expiring private URLs baked in, no missing-object race).
  3. **Commit `content.snapshot.json` + `media-manifest.json`** on the branch.
  4. **Merge the ChangeSet branch → production branch — only if required checks pass (round-8 C2).** Before merging, the Product backend verifies all **required GitHub checks** are green on the **head SHA** (combined **Commit Status API** + **Check Runs API**): registry check, path allowlist/denylist, AST/env/network guard, build check, **snapshot-schema check**, CODEOWNERS review. The merge call itself (`PUT /pulls/{n}/merge` with expected `sha`) is the hard gate — **GitHub returns 405 if protection isn't satisfied** (treat as abort, never retry-around). The production branch carries a **ruleset** requiring those checks + Code-Owner review with an **empty bypass list** (the publishing bot/App is *not* exempt). Merge-then-build chosen over "promote preview" (Cloudflare has no real preview→production promotion; rollback rejects preview targets). **Abort on merge conflict** — never publish content for code that isn't on production.
  5. **Single build trigger (round-5 P1):** the **merge triggers the Git-integrated production build on the chosen deploy target** — do **not** also fire a second build trigger (that double/races builds). Build is token-free static from the committed files. *(Single-trigger principle; the exact API — Pages Deploy Hook vs Workers Builds/`wrangler` — is bound by the spike.)*
  6. **Wait for deploy success** — poll the **deploy target's deployment matched to the merge commit SHA** until `deploy = success`.
  7. **Only on success, publish** — **publish the version via Payload's supported publish API/action** (round-5 note — *not* a direct DB/version-table mutation), mark the ChangeSet `published`. **Idempotent/resumable** — if deploy succeeded but publish failed, mark the ChangeSet **`deployed_pending_publish`** and **block new ChangeSets for this Site** until the publish retry succeeds (or the rollback below runs).
- **Failure compensation — the merge must be undone, not just media (round-6 P1), and GC must be reference-safe (round-7 P2):**
  - **Merge conflict (pre-merge):** abort, reference-safe-GC the staged media, content stays unpublished, ChangeSet → `aborted`.
  - **Deploy failure (post-merge):** the production branch now contains the failed snapshot, so GC-ing media isn't enough. **Revert the merge commit on the production branch**, **wait for the rollback deployment to reach `deploy = success`** (block further publishes for the Site until then), **then** reference-safe-GC staged media, keep content unpublished, ChangeSet → **`failed_deploy_reverted`**. Prevents a later rebuild/unrelated merge from shipping the failed snapshot.
  - **Publish failure after a good deploy (`deployed_pending_publish`, round-7 P3):** production is already serving the new snapshot while content is unpublished — restore it: **revert the merge commit → wait rollback deploy `success`** (optionally call the deploy target's **rollback API** to a *prior successful production* deployment as fast mitigation first, then reconverge git) → **reference-safe-GC staged media if unreferenced** → keep the Payload draft unpublished → ChangeSet → **`rolled_back_from_deployed_pending_publish`**. Idempotent/re-runnable.
- **Reference-safe media GC (round-7 P2):** GC deletes an object **only if no published or live snapshot references it** (per the media reference registry); with snapshot-namespaced random prefixes, aborting a snapshot = delete its prefix (via S3 `ListObjectsV2` + `DeleteObjects`, ≤1000/call). An R2 prefix **lifecycle rule** on a `staging/` prefix is a time-based backstop only — never on live media.
- **Rollback (of a published ChangeSet):** `git revert` on code **and** Payload **version restore** on content, keyed off the ChangeSet log → re-run the saga to redeploy the prior snapshot.

### 6. Editor routing UX
- **Explicit mode toggle**: "Edit content" vs "Change layout." Mode picks the broker path (Payload REST/GraphQL writes vs Git commits) — no auto-classification in v1. Human direct-editing happens in the Payload admin regardless of mode.

### 7. AI agent models (v1 testing → OpenRouter later)
- **v1 / testing:** use the AI access already on hand (e.g. Gemini Pro, Claude) to build/validate the agent flows. No paid routing layer yet.
- **Later:** integrate **OpenRouter** so the Operator can swap models freely. Build the agent layer now to take a **model slug + provider from config** (single seam) so the switch is config, not a rewrite.
- Rough fit when chosen: a stronger model for the structural/code agent, a lighter model for content edits/routing.

### 8. Distribution
- Tenants reach the Product via a shared web link → sign up / log in → land in their Site's chat+preview workspace. Standard tenant auth + the Tenant→Site mapping from §1.

### 9. Security, isolation & auth
- **Tenant auth:** the Product authenticates Tenants; they never get raw GitHub credentials or Payload admin secrets. Agent → broker → Payload **REST/GraphQL** (per-Tenant scoped key) / Git; humans → tenant-scoped Payload admin.
- **Content isolation** = Payload **multi-tenant plugin** (row-level scoping) + per-Tenant scoped key, with API calls using `overrideAccess: false` (never the Local API default that skips access control). The same rules gate the agent's API calls and the admin UI. **Risk to test hard:** a scoping bug = cross-Tenant leak — cover with plugin enforcement + per-key scoping + isolation tests (D1-per-Tenant as the stronger-isolation upgrade).
- **Code isolation** = one GitHub repo per Tenant; Product holds a scoped token per repo; broker restricts paths (no CI/workflow files) and the active branch.
- **Tool broker** is the only path the agent has to either store: per-mode allowlist, hard-bound Tenant identity (Payload key + repo), auditable.
- **ChangeSet enforcement (both write paths)** = the `beforeChange` hook (§3) rejects any content write — agent *or* human-admin — not tied to the Tenant's active ChangeSet, so the one-active-ChangeSet invariant can't be bypassed.
- **Draft-media isolation** = private R2 bucket + signed downloads for unpublished assets; published media is staged to the public bucket **before** the production build using **snapshot-namespaced random-nonce paths** (UUIDv4, not a content hash — round-7 P2), with reference-safe GC.
- **No Payload token in the production build (round-7 P1).** Content is materialized by the **trusted Product backend** (Payload Local API) into committed `content.snapshot.json` + `media-manifest.json`; the production build (on the chosen deploy target) has **zero Payload build vars**. Preview SSR uses a **tenant-scoped, draft-read-only** token (gated by Cloudflare Access; blast radius = the tenant's own drafts).
- **Build-surface lockdown for the agent (round-7 P1).** Because the agent edits the Tenant repo, executable build surface is protected so it can't read secrets / add network calls / bypass the snapshot: a **path allowlist** (agent may touch theme/templates/CSS/design-tokens/content only) enforced by a **required path-scoped CI denylist** that fails on changes to `package.json`/lockfiles, `astro.config.*`, adapters, `scripts/`, `functions/` (Workers/Pages Functions), `_worker.js`, `wrangler.*`, `.github/**`/CODEOWNERS, plus an **AST/lint guard** failing on `process.env`/`import.meta.env`, `fetch`/network calls, `child_process`, or `fs` writes inside allowed files; **CODEOWNERS / required-reviewer ruleset** makes build-surface paths require human (platform-team) approval.
- **Snapshot materializer sanitizes output (round-8 C1).** Local API runs with `overrideAccess: true`, so the materializer treats Payload output as untrusted: re-validates tenant/ChangeSet ownership, serializes only allowlisted public fields via per-block DTO mappers, strips auth/tenant/version/internal fields, and **fails closed** on unknown fields/blocks + strict JSON-Schema (`additionalProperties:false`) before writing the public files (§5 step 1).
- **Merge requires passing checks; the bot can't bypass (round-8 C2).** Production-branch **ruleset** requires the named checks + Code-Owner review with an **empty bypass list**; the publishing bot uses a **GitHub App** identity that is *not* exempt; the merge endpoint enforces protection server-side (405 on unmet checks). So the CI/AST/CODEOWNERS controls can't be merged around (§5 step 4).
- **Publishing is done via Payload's supported publish API/action**, never a direct DB/version-table write (round-5 note).
- **ChangeSet has an explicit state machine (round-6 P1, extended round-7 P3):** `active → previewing → publishing → published`, with failure states `aborted` (pre-merge), **`failed_deploy_reverted`** (post-merge deploy failure → merge reverted), **`deployed_pending_publish`** (deploy ok, publish failed), and **`rolled_back_from_deployed_pending_publish`** (the recovery for the prior). **New ChangeSets for a Site are blocked while it is in `deployed_pending_publish` or any unresolved failure state**, preserving the one-active-ChangeSet invariant and a clean production branch.

## Key decisions & tradeoffs
- **Payload CMS (DB-backed), not Keystatic/Sanity.** Wanted a real database: querying, relations, roles, native i18n, versions/scheduled publish, official multi-tenant, media via R2. Tradeoff: **two stores** (content DB + code Git) → preview/publish must coordinate both; self-host ops; Cloudflare Workers needs the Paid tier and has bundle limits. *(Candidate ADR.)*
- **One shared Payload instance, row-scoped (multi-tenant plugin), not a DB per Tenant.** Cheapest; official plugin enforces isolation. DB-per-Tenant is the stronger-isolation upgrade. *(Candidate ADR.)*
- **Global primitives only; new primitive types are Product-level releases, not per-Tenant edits** (shared instance → schema is global code). *(Candidate ADR — Codex round-2 #1.)*
- **Agent writes via broker → Payload REST/GraphQL with tenant-scoped auth, NOT raw MCP / NOT Local API default.** Don't depend on the experimental MCP for isolation. *(Codex round-2 #2.)*
- **One repo per Tenant for code; ChangeSet = Git branch + Payload draft.** Code isolation + a join key to coordinate the two stores. *(Candidate ADR.)*
- **Structural edits = reference-guided assembly of *global* primitives, not freeform codegen or per-Tenant schema.**
- **Explicit mode toggle, not auto-routing.**
- **Publish is a saga/state machine (retry + compensation), not a true atomic commit; production sites are static snapshot builds (not live SSR).** Order: materialize snapshot → **stage media public** → merge branch → **single Git-triggered build** → verify deploy → **publish via Payload API** last; reference-safe-GC media + revert-merge on abort. *(Codex round-2 #4, round-4, round-5, round-6.)*
- **Token-free production build + build-surface lockdown (round-7 P1).** Content is pre-materialized by the trusted backend (Payload Local API) into committed JSON; the build holds no Payload secret; the agent is fenced out of all build-executable files. Removes the agent-leaks-secret / bypass-snapshot risk class. *(Candidate ADR.)*
- **Sanitized snapshots + protected merge (round-8, implementation conditions).** Materializer outputs only allowlisted public fields and fails closed (no internal CMS metadata leaks); merges require green required-checks on a ruleset-protected production branch with the bot off the bypass list. *(Implementation conditions on approval.)*
- **v1 tests with existing AI; model layer is config-driven** for an OpenRouter swap later.

## Prerequisite spike (no spike, no lock — Codex round-2 #3)
Run a throwaway **Cloudflare + Payload spike** to prove the platform fits before committing. **Full runbook with commands + sources: see "## Spike research & runbook (2026)" at the end of this doc** (and `Spike.md`). Ordered pass/fail gates:
```
1  bare Payload deploys on Cloudflare Workers (with-cloudflare-d1 template; Workers PAID)
2  admin UI loads against D1; create first user
3  multi-tenancy plugin enabled (tenant field + selector)
4  drafts/versions enabled (_status, version history, schedulePublish)
5  tenant-scoped REST/GraphQL write (Authorization: users API-Key …); cross-tenant denied
6  media upload to R2 (private + signedDownloads)
7  Astro SSR draft preview (Workers) reads ?draft=true with token; anon blocked
8  Local-API materialize content.snapshot.json (token-free)
9  Astro static build from local JSON with NO Payload token in env
10 deploy the static site to Cloudflare
```
**Fallback** if it fails: Payload on a **Node host + Postgres** (Railway/Fly ≈ $5–8/mo) with media on R2; Astro Tenant sites stay on Cloudflare. **Fallback triggers:** need native (sharp) image resizing, GraphQL, interactive DB transactions, or Payload's Jobs queue / scheduled publish; bundle won't fit 10 MB; beta-adapter breakage; or D1 per-request latency is unacceptable.

## Risks / open questions
- **Cloudflare Workers + D1 fit (must spike)** — Payload-on-Workers is **official but Workers-Paid-only**, with a **beta** D1 adapter (`@payloadcms/db-d1-sqlite`, breaking-change warning + open template bugs), a **3 MB free / 10 MB paid** bundle limit, **no `sharp`** (image resize → Cloudflare Images), **Jobs queue needs a runner** (scheduled publish), and **GraphQL-on-Workers unproven** — see the spike + research below; Node+Postgres fallback if these bite.
- **Two-store coordination** — content (Payload draft) and code (Git branch) must publish/rollback together; the one-active-ChangeSet rule + the publish **saga** (retry/compensation) + static snapshot builds handle v1, but this is the main complexity to get right.
- **Shared-instance scoping** — a multi-tenant scoping bug leaks cross-Tenant data; mitigate with plugin enforcement, per-Tenant scoped keys (`overrideAccess:false`), and isolation tests; D1-per-Tenant if stronger isolation is needed.
- **Design-reference fidelity within global primitives** — the agent can only assemble existing global primitives; references needing a new primitive become a Product backlog item, not a Tenant edit. Needs a "closest match + refine + request-new-primitive" loop.
- **Media** — Payload uploads → **Cloudflare R2** (keeps media out of Git). Confirm R2 storage adapter + limits in the spike.
- **Tenant auth/roles/billing** — product-level details still to specify (§9 covers store access).

## Out of scope (v1)
- Any stack other than Astro + Payload — broader stack support is a later update.
- DB-per-Tenant isolation — documented upgrade, not v1 (v1 = shared instance, row-scoped).
- **Per-Tenant new Payload block schemas / backend config** — new primitives are global Product releases only.
- **Reliance on the Payload MCP for isolation** — v1 uses broker → REST/GraphQL with scoped auth.
- **Live-SSR production sites** — v1 production is static snapshot builds.
- OpenRouter integration — v1 tests with existing AI access.
- Freeform layout code generation; auto-classification of content vs structural intent; multi-stack template selection.

## Review status
- **Codex Round 1 (`REVISE`): addressed.** CMS evolved Sanity → Keystatic → **Payload**.
- **Codex Round 2 (`REVISE`) on the Payload plan: addressed in this version** —
  1. **Shared schema conflict** → structural edits use **global primitives only**; new primitives are Product-level releases (§4, decisions, out-of-scope).
  2. **MCP risk** → agent writes via **broker → REST/GraphQL with tenant-scoped auth**, never raw MCP / Local-API default (§3, §9).
  3. **Cloudflare/Payload uncertainty** → added a **required prerequisite spike** with Node+Postgres fallback.
  4. **"Atomic publish" overclaim** → renamed to a **publish saga/state machine**; **production = static snapshot builds** (§5).
- **Codex Round 3 (`NEARLY APPROVED — small REVISE`): addressed in this version** —
  1. **Stale MCP references** → §3 title and §6 now read **broker → Payload REST/GraphQL** (no MCP).
  2. **Human admin edits could bypass the ChangeSet** → **`beforeChange` hook** forces every write into the active ChangeSet or rejects it (§3, §9).
  3. **Preview freshness was half-static/half-dynamic** → committed to **one mechanism: SSR draft preview gated by Cloudflare Access** (production stays static) (§5).
  4. **Draft media could leak on public R2** → **private bucket + `signedDownloads`/presigned URLs**; promote to public only on publish (§5, §9).
  5. **Publish order let content lead code** → saga reordered to **snapshot → deploy → verify deploy success → commit Payload publish + promote media last** (§5).
- **Codex Round 4 (`REVISE — very close`): addressed in this version** —
  1. **Saga never said when the Git branch merges** → added explicit **merge ChangeSet branch → production branch** as step 2 (merge-then-build; abort on conflict), so new code actually reaches production (§5).
  2. **Static build wasn't pinned to a snapshot** → build pinned via a **committed `snapshot.json`** (deterministic from the merge commit); resolves **frozen versions by ID** and **fails closed** if absent (§2, §5).
  3. **Hook couldn't get `changeSetId` from admin UI** → hook **infers the active ChangeSet from `req.user`/tenant session** instead of relying on `req.context` (§3).
- **Codex Round 5 (`SMALL REVISE`): addressed in this version** —
  1. **Media publish order could break production** (static build baking private/expiring or not-yet-existing URLs) → media is **staged to public deterministic paths + a media manifest BEFORE the build**; the build references manifest URLs; staged media is GC'd on abort (§5).
  2. **Merge + Deploy Hook could double-trigger builds** → **single trigger**: the merge fires the Git-integrated production build; **no Deploy Hook** (§5, Option A).
  3. **Note:** frozen-version reads use a **build-time-only token**, never in client/static output; **publish via Payload's publish API/action**, not a direct version-table write (§5, §9).
- **Codex Round 6 (`SMALL REVISE`): addressed in this version** —
  1. **Deploy failure after merge left the production branch polluted** → the post-merge deploy-failure path now **reverts the merge commit on production** (waits for the rollback deploy / blocks further publishes), *then* GCs media; ChangeSet → **`failed_deploy_reverted`** (§5).
  2. **Post-deploy publish failure unnamed** → explicit **`deployed_pending_publish`** state that **blocks new ChangeSets** until publish retry succeeds or a rollback saga runs (§5, §9 state machine).
  3. **Note:** staged public media uses unguessable paths since it exists before final publish (refined in round-7 P2) (§5, §9).
- **Codex Round 7 (`REVISE`): addressed in this version** —
  1. **P1 — agent-editable code + build secret.** Production build is now **token-free**: the **trusted Product backend materializes** content via Payload **Local API** into committed `content.snapshot.json` + `media-manifest.json`; the build reads only local files with **zero Payload build vars**. Plus a **build-surface lockdown** (path allowlist + CI denylist + AST/lint guard + CODEOWNERS) so the agent can't edit build config/scripts/Functions/env/network code (§2, §4, §5, §9).
  2. **P2 — reference-safe media GC.** Staged media uses **snapshot-namespaced random-nonce paths** (UUIDv4, not a hash — "content-addressed ≠ unguessable") + a **reference registry**; GC deletes only objects unreferenced by any published/live snapshot (§5, §9).
  3. **P3 — explicit `deployed_pending_publish` rollback.** Revert merge → wait rollback deploy success → reference-safe-GC → keep draft unpublished → state **`rolled_back_from_deployed_pending_publish`** (§5, §9).
- **Codex Round 8 (`APPROVED WITH TWO IMPLEMENTATION CONDITIONS`): both folded in** —
  1. **C1 — snapshot materializer must sanitize.** Re-validate tenant/ChangeSet ownership, allowlist-only public DTO mappers, strip auth/tenant/version/internal fields, **fail closed** on unknown fields/blocks + strict JSON-Schema before writing (§5 step 1, §9).
  2. **C2 — merge must require passing checks.** Production-branch **ruleset** with required checks + Code-Owner review + **empty bypass list**; backend verifies checks on head SHA and relies on GitHub's server-side merge enforcement (405) so the bot can't bypass (§5 step 4, §9).
- **✅ Round 8 final outcome: VALIDATED — no remaining plan-grilling blockers.** Approved **for the Cloudflare + Payload spike only**, not full product implementation. The one open unknown is platform fit (**Payload + Cloudflare Workers + D1 + R2**): if the spike passes, build on this architecture; if it fails, keep Astro Tenant sites on Cloudflare and move Payload to **Node + Postgres**.
- **Round 9 (`VALIDATED FOR SPIKE, small revise`): done.** Replaced the vague Pages-correction note with an **explicit deploy model** (Payload→Worker+D1+R2; preview→SSR on Workers; production→Pages **or** Workers Static Assets, chosen by spike) and de-hardcoded every load-bearing "Cloudflare Pages" mention to **"production deploy target"** (glossary term added); the exact Deploy-Hook-vs-Workers-Builds API is bound once the spike picks the host.
- **Status: planning document only — not executed.** No implementation code, `CONTEXT.md`, or `PLAN.md` is generated unless explicitly requested. **The next real step is the Cloudflare + Payload spike** (above) — it decides whether Workers + D1 + R2 is viable or Payload moves to Node + Postgres while Astro sites stay on Cloudflare.

## Verification (how we'll prove v1 works end-to-end, when built)
- **Spike (do first):** complete the Cloudflare+Payload spike checklist before any of the below.
- **Provisioning:** run `provisionTenant()` → confirm a repo from template, a Payload tenant + scoped API key, and a Cloudflare deploy target with a working **gated** Preview URL; re-run to confirm idempotency.
- **Content path (agent):** in "Edit content" mode, prompt "add a blog post titled X" → confirm the broker's **REST/GraphQL write (tenant-scoped, `overrideAccess:false`)** created a **draft** scoped to the Tenant (rejected if cross-Tenant or invalid) and it renders on the gated preview, not production.
- **Content path (human):** edit the same content in the tenant-scoped Payload admin → confirm it attaches to the active ChangeSet and previews; **then attempt an admin edit with no active ChangeSet → confirm the `beforeChange` hook rejects it (Forbidden).**
- **Draft media privacy:** upload an image to a draft → confirm it is served only via a short-lived **presigned URL** from the **private** bucket (no public/`r2.dev` URL works); confirm it becomes publicly reachable **only after Publish** promotes it.
- **Structural path:** in "Change layout" mode, supply a hero design reference → confirm the agent composes **existing global primitives** (no new schema), the registry/CI check + Astro build pass, and the layout renders on the Cloudflare preview against draft content; confirm a reference needing a missing primitive is surfaced as a Product request, not a Tenant schema change.
- **Token-free build + build-surface lockdown (round-7 P1):** confirm the production deploy target has **no Payload build vars** and the build reads only committed `content.snapshot.json` + `media-manifest.json` (works offline); grep the static output + build logs for the Payload token → **absent**; attempt an agent PR that edits `astro.config.*`/`package.json`/`functions/` or adds `fetch`/`process.env` in a theme file → **CI denylist + AST guard fail it**; confirm CODEOWNERS forces human review on build-surface paths.
- **Publish gate (round-7 ordering):** click Publish → confirm the saga runs **materialize snapshot (Local API) → stage media to random-nonce public paths (+ manifest, + reference registry) → commit JSON → merge → single Git-triggered build → verify deploy `success` (matched to merge SHA) → publish via Payload API**; confirm the **new code/layout is on production**, the live URL renders the **pinned snapshot, not newest**, and **every image resolves to a public URL that existed before deploy** (no private/expiring URLs, no 404s); confirm **only one build runs**; build **fails closed** if snapshot files are missing.
- **Failure paths:** force a **merge conflict** → aborts pre-merge, reference-safe-GC, ChangeSet `aborted`; force a **deploy failure after merge** → **merge commit reverted on production**, rollback deploy `success`, reference-safe-GC, ChangeSet `failed_deploy_reverted` (a later unrelated rebuild can't ship the failed snapshot); force a **publish failure after good deploy** → ChangeSet `deployed_pending_publish`, **new ChangeSets blocked**; run the recovery → merge reverted, rollback deploy `success`, draft kept unpublished, ChangeSet `rolled_back_from_deployed_pending_publish`.
- **Reference-safe GC (round-7 P2):** stage an asset shared by a published snapshot, then abort a different snapshot → confirm GC **does not** delete the still-referenced asset; confirm staged paths use a **random UUIDv4 nonce** (not a content hash).
- **Snapshot sanitization (round-8 C1):** add a sensitive field (e.g. an auth field / tenant ID / a new unmapped block) to a draft → confirm it is **absent** from `content.snapshot.json`; confirm an **unknown field/block fails the materializer closed** (no public file written) and the strict JSON-Schema rejects extra properties.
- **Protected merge (round-8 C2):** with a required check **red**, have the publishing bot attempt the merge → confirm GitHub **rejects it (405)** and the saga aborts; confirm the bot identity is **not** on the ruleset bypass list (it cannot merge around CI); confirm checks are evaluated on the **current head SHA**.
- **Isolation:** edit Tenant A → confirm Tenant B's repo, content rows, and deploy are untouched; confirm the broker/Payload reject any cross-Tenant content access and out-of-allowlist repo paths.

## Spike research & runbook (2026)
**Verdict:** green-light the spike. Payload-on-Cloudflare is an **official** integration (Cloudflare × Payload, Sep 2025) — but **beta** D1 adapter + **Workers Paid only** keep it "spike, not commit." Full standalone runbook: `S:\SiteAgent\Plan\Spike.md`.

**Stack (corrects "Pages" in the body — it's Workers):**
- Template **`templates/with-cloudflare-d1`** (github.com/payloadcms/payload) = Next.js 15 admin via **`@opennextjs/cloudflare`** + **`@payloadcms/db-d1-sqlite`** (D1, **beta**) + **`@payloadcms/storage-r2`** (R2). Runs on **Workers** (not Pages), Workers **Paid** (bundle > 3 MB free; fits 10 MB paid).
- Astro `@astrojs/cloudflare` adapter is **Workers-only** (Pages dropped). SSR preview → Workers; static production → committed JSON (Pages static hosting still fine for pure static).

**Setup (commands):**
```
npx giget@latest gh:payloadcms/payload/templates/with-cloudflare-d1 my-app
cd my-app && pnpm install && pnpm wrangler login
pnpm dev                         # Miniflare mocks D1/R2 locally
pnpm payload migrate:create
wrangler secret put PAYLOAD_SECRET
pnpm run deploy                  # migrate remote D1 → opennext build → deploy
# wrangler.jsonc: nodejs_compat + global_fetch_strictly_public, compatibility_date ≥ 2025-08-15,
#   d1_databases binding "D1", r2_buckets binding "R2", assets binding "ASSETS"
# adapter: sqliteD1Adapter({ binding: cloudflare.env.D1 })
```

**Gotchas (re-verify; integration is beta/fast-moving):** Workers Paid required; **no `sharp`** on Workers → drop auto image-resize, use **Cloudflare Images** (`/cdn-cgi/image/`); `nodejs_compat` + compat date ≥ 2025-08-15 (older dates hit `MessageChannel is not defined`); D1 has **no pooling / no interactive transactions** (use `db.batch()`); **GraphQL on Workers unproven**; **scheduled publish needs a Jobs runner**; let Payload own D1 migrations; check bundle size (`wrangler deploy --dry-run`); pin versions (open bugs #16757, #15070).

**Fallback (Node + Postgres) — Payload's blessed model:** `@payloadcms/db-postgres` on Railway (~$5–8/mo) or Fly (~$5–7/mo), media on R2, Astro Tenant sites stay on Cloudflare. **Trigger it if:** you need sharp resizing / GraphQL / interactive transactions / Jobs queue, the bundle won't fit 10 MB, beta-adapter breakage stalls you, or D1 latency hurts admin UX.

**Key sources:** Cloudflare blog "Payload on Workers" (2025-09-30); `templates/with-cloudflare-d1` README; payloadcms.com/docs/database/sqlite (beta note); developers.cloudflare.com/workers/platform/limits; plugin-multi-tenant, versions/drafts, storage adapters, and `@astrojs/cloudflare` docs.
