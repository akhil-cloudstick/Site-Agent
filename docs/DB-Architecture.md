# DB Architecture: SiteAgent v1 — Database Design

_Expands `Architecture.md` §2 ("Content + control-plane database — one Postgres") into a concrete schema. Terms per `CONTEXT.md`. Authoritative for v1 on **Path B — Node + Postgres** (the v1 decision recorded in `AgentPlan.md`); it does **not** describe the deferred Path-A (D1) topology. Where this doc and `Architecture.md` agree, `Architecture.md` is the source of the *decision*; this doc is the source of the *schema*._

## Goal
Define the v1 database: one Postgres instance holding **both** Tenant content **and** the control-plane data that coordinates the two-store (Postgres + Git) publish model — with the isolation, one-active-ChangeSet, reference-safe-GC, durable-saga, and audit guarantees that `AgentPlan.md`/`Architecture.md` hardened, expressed as **hard DB constraints, not convention**.

## Stores at a glance (what lives where)
| Data | Store | Notes |
|---|---|---|
| Tenant **content** (pages/blocks, posts, media metadata) | **Postgres** (Payload collections) | tenant-scoped, drafts/versions |
| **Control-plane** (tenants, changesets, media_refs, audit, leases, saga checkpoints) | **Postgres** (admin-only Payload collections + custom DDL) | hard constraints |
| **Media bytes** | **Cloudflare R2** (private + public buckets) | DB stores only the object **key**, never bytes |
| **Site code** | **GitHub** (one private repo per Tenant) | DB stores only repo name + branch + head SHA |
| Cloudflare deploy targets | — | DB stores only project/deployment **ids** |

One Postgres, one connection, shared by the whole Brain (Path B's payoff — broker + saga use Payload's in-process Local API against it). Two **logical zones** in that DB: the **content zone** (Payload owns the DDL via migrations) and the **control-plane zone** (Payload collections **plus** custom-migration DDL for the constraints Payload can't express natively).

## Entity-relationship overview
```mermaid
erDiagram
    TENANTS ||--o{ USERS : "scopes (multi-tenant)"
    TENANTS ||--o{ CHANGESETS : "has many (1 active/blocking)"
    TENANTS ||--o{ CONTENT : "owns rows"
    TENANTS ||--|| EDIT_LEASES : "0..1 active editor"
    CHANGESETS ||--o{ CONTENT : "stamps changeSetId"
    CHANGESETS ||--o{ MEDIA_REFS : "stages/promotes"
    CHANGESETS ||--o{ SAGA_CHECKPOINTS : "durable steps"
    USERS ||--o{ CHANGESETS : "initiatedBy"
    CONTENT ||--o{ CONTENT_VERSIONS : "drafts/versions"

    TENANTS {
      uuid id PK
      text slug UK
      text githubRepo
      jsonb deployTargets
      enum status
    }
    USERS {
      uuid id PK
      citext email UK
      enum role "operator|tenant_member|service_principal"
      uuid tenant FK
    }
    CHANGESETS {
      uuid id PK
      uuid tenant FK
      uuid siteId
      enum status
      enum kind "content|structural"
      text gitBranch
      text headSha
      text previewDeploymentId
      uuid initiatedBy FK
      uuid correlationId
    }
    CONTENT {
      uuid id PK
      uuid tenant FK
      uuid changeSetId FK
      enum _status "draft|published"
      jsonb blocks
    }
    MEDIA_REFS {
      uuid id PK
      uuid tenant FK
      uuid changeSetId FK
      text objectKey
      enum state "staged|deployed|live|orphaned"
      text snapshotNonce
    }
    EDIT_LEASES {
      uuid id PK
      uuid siteId FK UK
      uuid holderUserId FK
      timestamptz heartbeatAt
      timestamptz expiresAt
    }
    SAGA_CHECKPOINTS {
      uuid id PK
      uuid changeSetId FK
      text step
      text idempotencyKey UK
      enum status
      jsonb payload
    }
    AUDIT_LOG {
      bigint id PK
      uuid correlationId
      uuid tenant FK
      uuid actorUserId
      text action
      text result
      jsonb detail
    }
```

## Tables

### Content zone (Payload-owned DDL)

**`users`** — Payload auth collection.
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| email | citext | unique |
| hash, salt | text | Payload auth |
| role | enum(`operator`,`tenant_member`,`service_principal`) | the broker runs as a `service_principal` with a **minimal role** (CRUD on its Tenant's content only) |
| tenant | uuid FK→tenants | scoped by the multi-tenant plugin; `operator` is cross-tenant admin |
| enableAPIKey | bool | **false in v1** — the broker authenticates as the service-principal *user* via Local API, **not** an API key (`Architecture.md` §A) |

**Content collections** — `pages` (page-builder blocks), `posts`, `media`, etc. Common tenant-scoped pattern:
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| tenant | uuid FK→tenants **NOT NULL** | injected by the multi-tenant plugin |
| changeSetId | uuid FK→changesets **NOT NULL** | **stamped by the `beforeChange` hook** (`Architecture.md` §B); no active ChangeSet ⇒ write rejected |
| _status | enum(`draft`,`published`) | Payload drafts/versions |
| blocks / fields | jsonb / columns | page-builder layout = jsonb (which global primitives, ordered, with props) |
| createdAt, updatedAt | timestamptz | |

**`<collection>_v` (version tables)** — Payload-managed. Each saved version snapshots the row **including `tenant` and `changeSetId`** plus version metadata (`version._status`, `latest`, `autosave`). The publish saga materializes a specific **version by id** (`findVersionByID`) so production is pinned, never "latest".

**`media`** (upload collection) — metadata only: `filename, mimeType, filesize, width, height, alt`, and the **R2 object key** (draft → private bucket). Bytes live in R2; promotion to the public bucket on publish is tracked in `media_refs`.

### Control-plane zone (Payload collections + custom-migration DDL)

**`tenants`** — the multi-tenant plugin's collection, **extended** with Site attributes (one Site per Tenant in v1).
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | |
| slug | text | unique |
| githubRepo | text | repo full name |
| deployTargets | jsonb | `{pagesProjectId, previewWorkerId}` |
| status | enum(`provisioning`,`active`,`suspended`,`failed`) | provisioning is idempotent; Tenant invited only when `active` |

**`changesets`** — the join key for the two stores **and** the state machine.
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| tenant | uuid FK **NOT NULL** | |
| siteId | uuid **NOT NULL** | = tenant.id in v1 (explicit column for a future `sites` split) |
| status | enum (see state machine) | CHECK-constrained |
| kind | enum(`content`,`structural`) | drives CODEOWNERS review gating at publish (`Architecture.md` §D step 4) |
| gitBranch | text | the ChangeSet's code branch |
| headSha | text null | the reviewed/merged head |
| previewDeploymentId | text null | Workers SSR preview deploy |
| productionDeploymentId | text null | Pages deploy matched to the merge SHA |
| initiatedBy | uuid FK→users | the **human** initiator (audit) — never the principal the write runs as |
| correlationId | uuid | threads request→job→commit→deploy→media (`Architecture.md` §Observability) |
| createdAt, updatedAt, publishedAt | timestamptz | |

> **The one-active-ChangeSet invariant is a DB guarantee, not app logic** (`Architecture.md` §2):
> ```sql
> CREATE UNIQUE INDEX one_blocking_changeset_per_site
>   ON changesets (siteId)
>   WHERE status IN ('active','previewing','publishing','deployed_pending_publish');
> ```
> The **blocking set** = states in which a new ChangeSet must not be created. `published`, `aborted`, `failed_deploy_reverted`, and `rolled_back_from_deployed_pending_publish` are terminal/non-blocking. **`deployed_pending_publish` is included** because it is the unresolved state that `UserFlow` Flow 7 says blocks new edits until recovery. (This set is load-bearing — it MUST equal the set the app's transition guard treats as blocking; see Risks.)

**`media_refs`** — the reference registry for reference-safe GC (`Architecture.md` §2 N6 / `AgentPlan.md` §5).
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| tenant | uuid FK **NOT NULL** | |
| changeSetId | uuid FK **NOT NULL** | |
| objectKey | text **NOT NULL** | R2 path `media/<snapshotNonce>/<file>` |
| bucket | enum(`private`,`public`) | |
| snapshotNonce | text | random UUIDv4 prefix (**not** a content hash — "content-addressed ≠ unguessable") |
| state | enum(`staged`,`deployed`,`live`,`orphaned`) | promotion is strictly `staged→deployed→live`; demotion to `orphaned` only under the per-Site saga lock after abort/failure (and, post-deploy, only after the revert deploy succeeds) |
| createdAt, updatedAt | timestamptz | |

> **GC rule (must be reference-safe + race-safe):** delete an R2 object only when **every** `media_refs` row for that `objectKey` is `orphaned` (i.e. no `staged`/`deployed`/`live` ref), evaluated under a **row lock**:
> ```sql
> SELECT 1 FROM media_refs WHERE objectKey = $1 FOR UPDATE;
> -- GC iff NOT EXISTS (… WHERE objectKey=$1 AND state <> 'orphaned')
> ```

**`audit_log`** — append-only (`Architecture.md` §Observability).
| Column | Type | Notes |
|---|---|---|
| id | bigserial PK | |
| ts | timestamptz default now() | |
| correlationId | uuid | |
| tenant | uuid FK null | null for system/cross-tenant ops |
| actorUserId | uuid null | human initiator |
| principal | text | service-principal / system identity the op ran as |
| action | text | e.g. `local_api.write`, `saga.transition`, `merge.attempt`, `media.gc`, `access.denied` |
| targetCollection, targetDocId | text | |
| result | text | `ok` / `denied` / `error` (incl. GitHub `405`) |
| detail | jsonb | snapshot hashes, deploy webhook payloads, denial reasons |

> **Append-only enforced in the DB:** `REVOKE UPDATE, DELETE ON audit_log` from the app role (+ a `BEFORE UPDATE OR DELETE` trigger that raises). Convention is not enough for an audit trail.

**`edit_leases`** — one-editor-per-Site concurrency (`UserFlow` Flow 10).
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| siteId | uuid FK **UNIQUE NOT NULL** | the unique index **is** the "one active editor" guarantee |
| tenant | uuid FK | |
| holderUserId | uuid FK | |
| holderSessionId | text | the editing tab |
| heartbeatAt | timestamptz | renewed every ~N s |
| expiresAt | timestamptz | stale when `< now()` → another editor may take over via `UPDATE … WHERE expiresAt < now()` |

**`saga_checkpoints`** — durable, resumable publish saga (`Architecture.md` §D #12).
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| changeSetId | uuid FK **NOT NULL** | |
| step | text | `materialize`,`stage_media`,`commit`,`merge`,`build`,`deploy_wait`,`publish`,`compensate` |
| idempotencyKey | text **UNIQUE** | makes each step exactly-once on retry/replay |
| status | enum(`pending`,`done`,`failed`) | |
| payload | jsonb | step outputs (version ids, merge SHA, deployment id) for resume |
| | | UNIQUE(`changeSetId`,`step`); a **Postgres advisory lock** `pg_advisory_xact_lock(hashtext(siteId))` gives single-worker-per-Site semantics; Payload's `payload_jobs` table provides the queue |

## ChangeSet state machine (the `status` enum)
```
        ┌──────────────────────── happy path ────────────────────────┐
 active → previewing → publishing → published
   │                       │
   │ (no merge yet)        │ (post-merge)
   ▼                       ▼
 aborted          failed_deploy_reverted        deployed_pending_publish
 (pre-merge:      (deploy failed → merge          (deploy ok, Payload
  conflict/build   reverted, prod restored)        publish failed)
  fail; GC media)                                       │ recovery
                                                        ▼
                                  rolled_back_from_deployed_pending_publish
```
- **Blocking** (no new ChangeSet): `active`, `previewing`, `publishing`, `deployed_pending_publish`.
- **Terminal** (Site publishable again): `published`, `aborted`, `failed_deploy_reverted`, `rolled_back_from_deployed_pending_publish`.
- Transitions run through **guarded application code** (reject illegal moves) **backed by** the CHECK enum + the partial unique index — neither alone is trusted.

## Isolation model (defense in depth)
1. **App layer (load-bearing, v1):** the single audited Local-API adapter — `overrideAccess:false` + service-principal `user` — so the multi-tenant plugin's row filter + field validation + the `beforeChange` hook run on every write. Lint-denied elsewhere; cross-Tenant isolation tests in CI (`Architecture.md` §A).
2. **Schema layer:** `tenant` FK **NOT NULL** on every tenant-scoped table; no row exists unattributed.
3. **DB layer (optional upgrade — defense in depth):** Postgres **Row-Level Security** policies keyed off a per-request GUC (`SET app.tenant_id = …`) so even a raw/buggy query can't cross Tenants. **Not enabled in v1** (the app layer is the control); documented as the hardening path short of full DB-per-Tenant.

## Migrations & ownership
- **Payload owns** content + auth + collection tables via `@payloadcms/db-postgres` migrations.
- The **control-plane constraints Payload can't express** — the partial unique index, CHECK enums, append-only grants/trigger, optional RLS policies — are applied as **custom SQL inside Payload migrations**, so there is **one migration history**, not a side-channel. Let Payload run migrations; never hand-edit the DB.

## Index summary (the hot paths)
| Index | Serves |
|---|---|
| `changesets (siteId) WHERE status IN (blocking set)` UNIQUE partial | one-active-ChangeSet invariant |
| `changesets (tenant, status)`, `(correlationId)` | workspace state + tracing |
| `content (tenant, changeSetId)`, `(tenant, _status)` | preview/draft reads, publish materialize |
| `media_refs (objectKey, state)`, `(changeSetId)` | reference-safe GC, staging |
| `audit_log (correlationId)`, `(tenant, ts DESC)` | tracing + per-Tenant audit |
| `edit_leases (siteId)` UNIQUE, `(expiresAt)` | one editor, stale-takeover |
| `saga_checkpoints (changeSetId, step)` UNIQUE, `(idempotencyKey)` UNIQUE | idempotent resume |

## Risks / open questions
- **Blocking-set drift.** The partial-unique-index `status` set MUST equal the app guard's "blocking" set; a mismatch either lets a second ChangeSet slip in or wrongly locks a Site. Single-source the list (one shared constant + the migration) and test it.
- **App-layer-only isolation in v1.** Without RLS, a bug in the single adapter = cross-Tenant leak. Mitigated by lint-deny + isolation tests; RLS is the next ring.
- **jsonb content is weakly typed in the DB.** Validated by Payload on write and by the strict snapshot JSON-Schema at publish — not by the DB. Acceptable; the publish sanitizer is the gate.
- **Neon idle-pause** breaks advisory locks / mid-saga state on the $0 tier — pilots need the warm paid tier (`Architecture.md` §Hosting).
- **`siteId` = `tenant.id` in v1.** A real `sites` table (multi-Site Tenants) is a later migration; the explicit column keeps the door open.

## Out of scope (v1)
- **DB-per-Tenant** isolation (documented upgrade; v1 is shared instance + row scoping).
- A separate `sites` table / multi-Site Tenants.
- Read replicas, sharding, connection pooling beyond the host's default.
- Cloudflare **D1** schema (deferred Path-A).
