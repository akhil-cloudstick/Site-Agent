# SiteAgent

A multi-tenant platform where each customer (a **Tenant**) gets a website they edit by chatting with an AI agent or directly in a CMS. See `docs/` for the full, Codex-reviewed design.

## Project structure

```
SiteAgent/
├── README.md              ← you are here
├── brain/                 ← THE BRAIN: the one Node app (Next.js + Payload v3 + Postgres)
│                            All product code lives here. Local dev only for now (slice 1).
├── docs/                  ← Design + planning (source of truth)
│   ├── CONTEXT.md           glossary / ubiquitous language
│   ├── AgentPlan.md         feature + security design (8 Codex rounds)
│   ├── Architecture.md      runtime topology — Path B (Node + Postgres)
│   ├── DB-Architecture.md   concrete Postgres schema + hard constraints
│   ├── UserFlow.md          the 11 customer flows
│   ├── Diagrams.md          architecture + workflow maps
│   ├── Spike.md             (deferred Path-A: Cloudflare Workers/D1 spike)
│   ├── PLAN.md              ← slice-1 execution plan (Codex-APPROVED, the thing we're building)
│   ├── PLAN-REVIEW-LOG.md   the grill + Codex argument transcript
│   ├── PENDING.md           deferred work / slice shortcuts (nothing cut, only owed)
│   └── CHANGELOG.md         plain-language, dated progress log
└── .serve/                ← the live task tracker (ProjectPlan.html, served on :8080)
    ├── ProjectPlan.html     13 modules / 90 tasks, dependency graph + build waves
    ├── server.js            zero-dep shared-state server
    └── state.json           shared task status
```

## Build approach

Vertical-slice-first, task-by-task against `.serve/ProjectPlan.html` in dependency order.
**Slice 1 (in progress):** the walking skeleton — one Tenant logs in → chat-edits content →
sees it in an in-Brain preview → discards. No publish, no Cloudflare, no media yet
(all deferred and tracked in `docs/PENDING.md`). Full plan: `docs/PLAN.md`.

## Local development (slice 1)

- **Runtime:** Node ≥ 24.15, pnpm 10.
- **Database:** local PostgreSQL 18 — database `siteagent_dev`, role `siteagent`.
- The Brain app is in `brain/`; its `.env` holds `DATABASE_URL` + `PAYLOAD_SECRET` (never committed).
- Production later swaps `DATABASE_URL` to a warm host (Neon) with **no code change**.
