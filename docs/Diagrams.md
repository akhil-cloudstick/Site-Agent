# SiteAgent v1 — Simple Diagrams

Two separate, easy-to-read diagrams in one file:
1. **Architecture** — what programs run, where, and how they talk (from `Architecture.md`).
2. **Workflow** — how a person moves through the product (from `UserFlow.md`).

Both are drawn to be readable first, exhaustive second. The detailed rules live in the source docs; these are the map.

---

# 1. Architecture — What Runs Where

The whole product is **one app** ("The Brain"). Everything inside the dashed box is a single Node/Next.js codebase sharing one database connection. Outside it are the stores and the two public website surfaces.

```mermaid
flowchart TB
    User(["👤 Tenant<br/>(browser)"])

    subgraph BRAIN["🧠 THE BRAIN — one app, one codebase, one Postgres connection"]
        direction TB
        UI["💬 Chat + Preview UI"]
        Agent["🤖 Agent<br/>(Claude + Gemini)"]
        Broker["🛡️ Tool Broker<br/>the only safe gate"]
        Adapter["🔑 Local-API Adapter<br/>the ONLY DB handle<br/>+ ChangeSet hook"]
        Proxy["🖼️ Draft-Media Proxy<br/>gated access"]
        Saga["⚙️ Publish Saga + Jobs<br/>durable, resumable"]
        CMS["📚 Payload CMS<br/>per-Tenant admin"]
    end

    subgraph STORES["💾 Stores & External Services"]
        direction TB
        PG[("🗄️ Postgres / Neon<br/>content + tenants +<br/>changesets + media_refs +<br/>audit log")]
        GH["🐙 GitHub App<br/>1 private repo per Tenant"]
        R2priv[("🔒 R2 Private<br/>draft media")]
        R2pub[("🌐 R2 Public<br/>published media")]
    end

    subgraph SITES["☁️ The Live Websites (Cloudflare)"]
        direction TB
        Prod["✅ PRODUCTION<br/>Cloudflare Pages<br/>static, public site"]
        Prev["👁️ PREVIEW<br/>Cloudflare Workers<br/>draft site, login-gated"]
    end

    %% ---- Main user path ----
    User -->|"1 - opens & chats"| UI
    UI -->|"2 - sends request"| Agent
    Agent -->|"3 - asks for a change"| Broker
    Broker -->|"4 - content writes"| Adapter
    Adapter -->|"in-process, safe"| PG
    CMS --> PG
    UI -->|"Direct editor panel<br/>(focused, element-scoped)"| CMS

    %% ---- Code path ----
    Broker -->|"code/layout writes"| GH

    %% ---- Publishing ----
    Saga -->|"build snapshot"| Adapter
    Saga -->|"commit + protected merge"| GH
    Saga -->|"stage media"| R2pub
    GH -->|"merge triggers build"| Prod
    GH -->|"branch = preview"| Prev
    Prod -->|"serves"| R2pub

    %% ---- Preview reads (always through the Brain) ----
    Prev -.->|"draft data (read-only)"| Proxy
    Prev -.->|"draft images"| Proxy
    Proxy -.->|"reads draft content"| PG
    Proxy -.->|"streams draft images from"| R2priv
    Prod -.->|"deploy done → webhook"| Saga

    classDef brain fill:#e8f0fe,stroke:#4285f4,stroke-width:2px,color:#111
    classDef store fill:#fff4e5,stroke:#f9a825,stroke-width:2px,color:#111
    classDef site fill:#e6f4ea,stroke:#34a853,stroke-width:2px,color:#111
    class UI,Agent,Broker,Adapter,Proxy,Saga,CMS brain
    class PG,GH,R2priv,R2pub store
    class Prod,Prev site
```

### How to read it (the 5 rules that matter)
- **The Agent never touches a store directly.** It can only *ask* → `Agent → Broker → Adapter → Postgres`. (Contract A)
- **One door to the database.** The Local-API Adapter is the single module that holds the DB handle, always runs with tenant rules on, and stamps every write into the active ChangeSet. A no-ChangeSet write is rejected. (Contracts A + B)
- **Drafts are private.** The Preview website can only read drafts **through the Brain's proxy** (dotted lines) — the proxy reads draft *content* from Postgres/Payload and streams draft *images* from private R2. The Worker never touches the database or storage directly. (Contract C)
- **Publishing is a safe, resumable saga.** It builds a snapshot, does a protected merge into the production branch, then a single build deploys the static site. If anything breaks, it rolls back. (Contract D)
- **Two different Cloudflare products.** Production = static Pages site (fast, public). Preview = Workers SSR (draft, login-gated). Not two modes of one thing.

---

# 2. Workflow — The Human Journey

This is what a **customer** actually experiences. All the branches, merges, and saga steps from the architecture stay **invisible** — they only ever see *edit → preview → Publish*.

```mermaid
flowchart TB
    Start(["🔑 Operator sets up the Tenant<br/>then sends a login link"])
    Login["🏠 Tenant logs in → workspace<br/>chat on left · live preview on right<br/>starter site already showing"]

    Mode{"What kind of change?"}

    subgraph EDIT["✏️ Editing (changes pile up as 'draft changes pending')"]
        direction TB
        Content["💬 Edit Content<br/>chat: 'change the hero to Summer Sale'<br/>or the Direct editor panel<br/>→ change applied"]
        Layout["🧱 Change Layout<br/>describe it or upload an image<br/>→ Agent builds from sections"]
        Preview["👁️ Live preview refreshes<br/>'● N draft changes not yet live'"]
    end

    Decide{"Happy with it?"}
    Discard["↩️ Discard changes<br/>back to last published version"]

    Publish["🚀 Tenant clicks Publish<br/>editing locks (~1–2 min)"]
    ReviewQ{"Did it touch<br/>code/path files?"}
    Review["⏳ Reviewing changes<br/>(ONLY for code/path changes)<br/>a human checks them"]
    Running["⚙️ Publishing…<br/>snapshot → merge → build → deploy<br/>(all hidden from the customer)"]

    Result{"Did it work?"}
    Live(["✅ You're live!<br/>state = Published"])
    Fail["⚠️ Publish hit a problem<br/>live site restored · draft is safe<br/>Operator is notified"]

    Start --> Login --> Mode
    Mode -->|"Edit content"| Content
    Mode -->|"Change layout"| Layout
    Content --> Preview
    Layout --> Preview
    Preview --> Decide
    Decide -->|"more edits"| Mode
    Decide -->|"start over"| Discard
    Discard --> Login
    Decide -->|"ship it"| Publish
    Publish --> ReviewQ
    ReviewQ -->|"yes — code/path: needs review"| Review
    ReviewQ -->|"content only → fast, no wait"| Running
    Review --> Running
    Running --> Result
    Result -->|"success"| Live
    Result -->|"failure"| Fail
    Live --> Login
    Fail -->|"Try again / Operator clears it"| Login

    classDef start fill:#ede7f6,stroke:#673ab7,stroke-width:2px,color:#111
    classDef edit fill:#e8f0fe,stroke:#4285f4,stroke-width:2px,color:#111
    classDef good fill:#e6f4ea,stroke:#34a853,stroke-width:2px,color:#111
    classDef bad fill:#fdecea,stroke:#ea4335,stroke-width:2px,color:#111
    class Start,Login start
    class Content,Layout,Preview edit
    class Live good
    class Fail,Discard bad
```

### How to read it (the customer's 5 states)
- **Published** — live site and draft match; nothing pending.
- **Draft changes pending** — edits are stacking up; banner shows *"● N draft changes not yet live"* with **[Publish]** / **[Discard changes]**.
- **Reviewing changes** — appears **only** when the publish touches code/path files; a real person checks them. **Content-only publishes skip this entirely and feel fast** — straight to *Publishing…*, no human wait.
- **Publishing…** — editing is locked for ~1–2 minutes while the hidden saga runs.
- **Publishing paused** — something failed; the live site is restored, the draft is kept safe, and the Operator steps in. New edits are blocked until cleared.

### The words the customer NEVER sees
`ChangeSet · branch · merge · deploy · saga · snapshot · CODEOWNERS` — all of that lives in the architecture and the Operator's logs only. The customer just sees **edit → preview → Publish**.

---

## How the two diagrams connect
| Customer action (Workflow) | What actually happens (Architecture) |
|---|---|
| Types a chat edit, or uses the Direct editor panel | Agent/CMS → Broker → Adapter → Postgres (Contract A) |
| Sees the live preview | Preview Worker reads draft content (Postgres) + draft images (R2) through the Brain's proxy (Contract C) |
| Clicks **Publish** | Publish saga: snapshot → protected merge → build → deploy (Contract D) |
| "Reviewing changes" wait | CODEOWNERS human review on code-owned paths (Contract D) |
| **Discard changes** | Tear down ChangeSet branch + preview + GC staged media |
| "Publish hit a problem" | Saga compensation / rollback, Operator notified |
