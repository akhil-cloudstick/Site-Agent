# Changelog

## 2026-06-19

**`06:18 PM`**
- Locked down the safety architecture with an automatic guardrail: code can no longer sneak around the single audited content-write path (a lint rule enforces it). Also replaced the starter demo home page with a proper SiteAgent landing page. Lint passes clean and the app builds.

**`05:32 PM`**
- Polished the workspace: added a Sign-out button, made the chat history survive a page refresh, and made the preview update instantly after each change (no manual refresh needed).

**`05:02 PM`**
- The full hands-on demo is built: a customer can sign in and land on a chat-and-preview screen, type a change in plain English ("change the hero heading to Summer Sale"), and watch their site's live preview update — powered by the AI, safely scoped to their own site. This is the complete walking skeleton (slice 1): sign in → chat-edit → see it in preview. Publishing to a public website and the layout/design tools come in later phases.

**`04:52 PM`**
- The AI agent now works end to end. Asked in plain English to "change the hero heading to Summer Sale," the AI (via OpenRouter — Kimi, falling back to Qwen) produced a valid, safety-checked instruction and the page updated through the safe doorway — the new heading is live in the draft. This is the heart of the product working: say what you want, the AI makes the change, safely scoped to your own site. Only the chat screen and live preview remain before it's a full hands-on demo.

**`04:15 PM`**
- Built the single safe doorway the AI will use to change content, and proved customer data stays separated. The agent can only write through one audited path that acts as the customer's dedicated machine account, opens a batch of changes automatically on the first edit, and runs every per-customer security check. Wrote automated isolation tests — which immediately caught a real hole (one customer's account could write into another customer's content through the raw database) and forced it closed. Also stopped a class of database-setup confusion by turning off automatic schema "push." All verified by tests.

**`02:59 PM`**
- Made the core safety rules real and proved them: every content edit is now automatically tied to the customer's open batch of changes; edits with no open batch are refused; and background/system processes can't quietly change content. Also added a setup script that creates a first test customer (Acme) with logins, so the editing experience can now be tried by hand in the admin. Verified with automated tests and a clean build.

**`02:40 PM`**
- Turned on per-customer data separation (multi-tenancy): each customer's content is now scoped to that customer, with an operator/super-admin role for the platform owner who oversees everyone. Verified the database updated and the app builds cleanly.

**`02:15 PM`**
- Built the core data structure the whole product stands on. Three things now exist in the database: the list of customers (Tenants); the "batch of edits" record that tracks a set of changes from draft to live — with a built-in rule, enforced by the database itself, that a site can only have one batch in progress at a time; and the content area where page content lives, kept separate per customer and per batch, with draft and published versions. Verified end-to-end: the database correctly rejects a second in-progress batch, 10 automated checks pass, and the app builds cleanly.

**`12:52 PM`**
- Set up a single, safe place for the app's secret settings (database connection, signing key, AI key). Now there's exactly one checked entry point for these, the app refuses to start with a clear message if a required one is missing, and none of them can leak into anything a website visitor's browser downloads. Backed by 7 automated tests, all passing.

**`12:12 PM`**
- Built the foundation of the product — the "Brain" — and got it running on this machine. It's a single application (Next.js + Payload CMS) talking to a local PostgreSQL database. Confirmed it compiles cleanly and the database is set up (its starting tables are created). This is the base everything else is built on. Along the way we worked around a few quirks of running on the shared `S:` network drive.

**`11:16 AM`**
- Agreed how we'll build SiteAgent: one small, working piece at a time instead of everything at once. The first piece ("slice 1") is the core editing loop — a customer logs in, types a change to their site in chat, and sees it appear in a live preview. Publishing to a real public website comes in a later piece.
- Settled the practical choices for that first piece: build and test it locally first (using the Postgres database already installed), use Gemini as the AI that understands the chat requests for now (with the option to add Claude later as a one-line change), and create the first test customer with a simple setup script rather than the full onboarding system.
- Wrote the plan down and had a second, independent AI (Codex) try hard to poke holes in it. It found 16 issues across three rounds — all fixed — before giving its approval. This means the plan was stress-tested by two different models before any code gets written.
- Started a running list of everything we're intentionally leaving for later (`PENDING.md`) so nothing planned gets quietly forgotten.
