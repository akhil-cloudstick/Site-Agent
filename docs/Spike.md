# Spike Runbook — Payload + Astro on Cloudflare (Workers + D1 + R2)
_Prerequisite spike for the SiteAgent v1 plan (`AgentPlan.md`). Throwaway PoC — not product code._
_Researched 2026; the Cloudflare×Payload integration is official but **beta** and fast-moving — re-verify versions/docs before relying on anything here._

## Goal (one question)
Does **Payload on Cloudflare Workers + D1 + R2** hold together for our use case?
**Pass → build on the planned architecture. Fail → move Payload to Node + Postgres** (Railway/Fly), keep Astro Tenant sites on Cloudflare.

## Prerequisites
- A **Cloudflare account on the Workers Paid plan** (Payload's bundle exceeds the 3 MB free limit; fits 10 MB paid).
- `pnpm`, Node 20+, `wrangler` (logged in), a GitHub account.
- An R2 bucket + an R2 API token (for the S3-compatible path) — or use the native R2 binding from the template.

## Key facts (so the spike isn't surprised)
- **It's Workers, not Pages.** Template `templates/with-cloudflare-d1` = Next.js 15 admin via `@opennextjs/cloudflare` + `@payloadcms/db-d1-sqlite` (D1, **beta**) + `@payloadcms/storage-r2`. Astro's `@astrojs/cloudflare` adapter is also **Workers-only** now.
- **No `sharp` on Workers** → Payload auto image-resize won't run; plan to use **Cloudflare Images** (`/cdn-cgi/image/`).
- **D1**: no connection pooling, **no interactive transactions** (use `db.batch()`), read-replication experimental.
- **GraphQL on Workers**: not guaranteed — validate only if you depend on it.
- **Scheduled publish** needs a **Jobs runner** (cron/worker); explicit publish is fine without one.
- Pin versions — open template bugs: payload #16757 (breaks ≥ v3.85.0), #15070 (silent DELETE on Workers).

## Steps (each is a yes/no gate — stop and assess on any ❌)

### 1. Bare Payload deploys on Workers
```bash
npx giget@latest gh:payloadcms/payload/templates/with-cloudflare-d1 spike-app
cd spike-app && pnpm install
pnpm wrangler login
pnpm payload migrate:create
wrangler secret put PAYLOAD_SECRET
pnpm run deploy            # migrates remote D1, opennext build, deploy
```
`wrangler.jsonc` must have: `compatibility_flags: ["nodejs_compat","global_fetch_strictly_public"]`, `compatibility_date ≥ "2025-08-15"`, `d1_databases` binding `D1`, `r2_buckets` binding `R2`, `assets` binding `ASSETS`.
✅ **PASS:** deployed `*.workers.dev` admin URL returns 200. Check bundle: `wrangler deploy --dry-run --outdir bundled/` < 10 MB gzip.

### 2. Admin loads against D1
✅ **PASS:** `/admin` renders, create first user, log in, dashboard loads.

### 3. Multi-tenancy (row scoping)
```bash
pnpm add @payloadcms/plugin-multi-tenant
```
Add a `tenants` collection + `multiTenantPlugin({ collections: { pages: {} } })`; migrate+deploy.
✅ **PASS:** admin shows a tenant selector; `tenant` field injected on scoped collections.

### 4. Drafts / versions
Set `versions: { drafts: { schedulePublish: true } }` on a collection.
✅ **PASS:** Save Draft / Publish buttons + version history; `_status` present.

### 5. Tenant-scoped write (isolation — the critical one)
- Auth collection with `auth: { useAPIKey: true }`; create **two tenants** + **two users**, each assigned to one tenant (no super-admin).
- Generate an API key per user; call REST with header `Authorization: users API-Key <key>` (slug, case-sensitive).
✅ **PASS:** tenant-A key can create/read only tenant-A docs; cross-tenant read/write is **denied** (403/empty). In any server/Local-API script, isolation needs `overrideAccess: false` + `user` (Local API defaults to `overrideAccess: true` = bypass).

### 6. Media → R2
`@payloadcms/storage-r2` (native binding) **or** `@payloadcms/storage-s3` (`region:'auto'`, R2 S3 endpoint, `forcePathStyle:true`). For a private collection set `signedDownloads`.
✅ **PASS:** object lands in R2 and is retrievable; private collection blocks anon and a signed URL works. (Presigned URLs only work on the `r2.cloudflarestorage.com` domain, not `r2.dev`/custom domain.)

### 7. Astro SSR draft preview (Workers)
Astro app, `npx astro add cloudflare`, `output: 'server'` (or per-route `prerender=false`); route fetches Payload REST `?draft=true` with the tenant API key.
✅ **PASS:** draft-only content renders in preview; an **unauthenticated** request does **not** see the draft (`?draft=true` is not self-gating — token required).

### 8. Local-API materialize `content.snapshot.json` (token-free)
Node build script: `getPayload({ config })` → `findVersions` then `findVersionByID(<versionId>)` → write `content.snapshot.json` + `media-manifest.json`. (Sanitize per AgentPlan §5 step 1: validate tenant/changeSet ownership, allowlist public fields, fail closed on unknown.)
✅ **PASS:** JSON holds the exact frozen version content, produced with **no HTTP and no token**.

### 9. Astro static build from local JSON (no Payload token)
`output: 'static'`, `import content from '../data/content.snapshot.json'`; run `astro build` with **no Payload env/token present**.
✅ **PASS:** build succeeds **offline**; emitted HTML contains the snapshot content; grep output → **no token leaked**.

### 10. Deploy the static site to Cloudflare
Deploy the prerendered output (Workers static assets via the adapter, or Pages static hosting).
✅ **PASS:** public URL serves the static pages with **zero runtime Payload dependency**.

## Decision
- **All 10 green** → platform fit confirmed; proceed on the `AgentPlan.md` architecture (Workers).
- **Any of the fallback triggers hit** → switch Payload to **Node + Postgres** (`@payloadcms/db-postgres` on Railway ~$5–8/mo or Fly ~$5–7/mo), media on R2, Astro Tenant sites stay on Cloudflare. Triggers: need `sharp` resizing / GraphQL / interactive transactions / Jobs queue; bundle > 10 MB; beta-adapter breakage; D1 latency hurts admin UX.

## Sources
- Cloudflare blog "Payload on Workers" (2025-09-30): blog.cloudflare.com/payload-cms-workers
- Template README: github.com/payloadcms/payload/tree/main/templates/with-cloudflare-d1
- D1/SQLite adapter (beta): payloadcms.com/docs/database/sqlite
- Workers limits: developers.cloudflare.com/workers/platform/limits
- Multi-tenant plugin: payloadcms.com/docs/plugins/multi-tenant · API keys: payloadcms.com/docs/authentication/api-keys
- Versions/drafts: payloadcms.com/docs/versions/overview · /drafts · admin preview: /admin/preview
- Storage adapters: payloadcms.com/docs/upload/storage-adapters · R2 presigned: developers.cloudflare.com/r2/api/s3/presigned-urls
- Astro Cloudflare adapter: docs.astro.build/en/guides/integrations-guide/cloudflare · Local API: payloadcms.com/docs/local-api/overview
- Fallback: docs.railway.com/guides/payload-cms · fly.io/docs/about/pricing
