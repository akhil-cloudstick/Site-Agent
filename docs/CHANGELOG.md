# Changelog

## 2026-06-19

**`11:16 AM`**
- Agreed how we'll build SiteAgent: one small, working piece at a time instead of everything at once. The first piece ("slice 1") is the core editing loop — a customer logs in, types a change to their site in chat, and sees it appear in a live preview. Publishing to a real public website comes in a later piece.
- Settled the practical choices for that first piece: build and test it locally first (using the Postgres database already installed), use Gemini as the AI that understands the chat requests for now (with the option to add Claude later as a one-line change), and create the first test customer with a simple setup script rather than the full onboarding system.
- Wrote the plan down and had a second, independent AI (Codex) try hard to poke holes in it. It found 16 issues across three rounds — all fixed — before giving its approval. This means the plan was stress-tested by two different models before any code gets written.
- Started a running list of everything we're intentionally leaving for later (`PENDING.md`) so nothing planned gets quietly forgotten.
