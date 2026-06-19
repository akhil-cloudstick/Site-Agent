# CONTEXT — SiteAgent ubiquitous language
_Glossary only. No implementation details. Terms here are the canonical vocabulary used across `AgentPlan.md`, `Architecture.md`, and any ADRs._

- **Product** — the platform being built: customers get a website they edit by chatting with an AI agent or directly in a CMS. (Separate from the `s:\TestUI` reference site.)
- **Operator** — the client who owns and sells the Product. Owns the GitHub org, the Cloudflare account, and the single shared CMS instance.
- **Tenant** — an Operator's customer. Owns exactly one Site.
- **Site** — a Tenant's website: one GitHub repo (code) + tenant-scoped content rows in the shared CMS + one live production deploy.
- **CMS instance** — one shared content system (Payload) serving all Tenants, kept separate per Tenant by row-level scoping (multi-tenant plugin).
- **Content edit** — a change to words/images only (heading text, hero image, add a blog post). No change to the site's code structure.
- **Structural edit** — a change to the site's layout/structure (new page, new section, new button, different layout), built by composing pre-approved Section primitives to reproduce a Design reference.
- **Section primitive** — a pre-approved, shared, parameterised building block (an Astro section backed by a CMS block). Tenants compose and configure these; only the Product team creates new ones.
- **Primitive registry** — the machine-readable contract for each Section primitive (its component, allowed settings, examples, constraints, test fixture, CMS block schema).
- **Design reference** — a screenshot / Figma / URL a Tenant supplies for the agent to reproduce using Section primitives.
- **ChangeSet** — one unit of edit for a Site, tracked as a whole: a code branch and/or a content draft, plus its preview and status. Previewed, published, and rolled back together. v1 allows one active ChangeSet per Site.
- **Tool broker** — the only path the agent has to change anything: a Product-owned layer that enforces which Tenant, which Site, and what kinds of change are allowed.
- **Preview** — a private, gated view of a ChangeSet's unpublished changes, before it goes live.
- **Publish** — the careful, multi-step go-live process (a saga) that ships a ChangeSet to the Tenant's live Site.
- **Agent** — the AI that interprets a Tenant's chat request and makes the change through the Tool broker.
