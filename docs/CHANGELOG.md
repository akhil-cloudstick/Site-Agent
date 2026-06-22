# Changelog

## 2026-06-23

**`12:30 AM`**
- **Connected-site text editing reworked to be piece-by-piece and non-destructive.** Each text run is now its own editable box, so a heading like "Powering the AI era with **high-density compute** built to last" edits as three separate pieces with the coloured word/styling kept. Edits happen **in place** (the page is never rebuilt), which **fixes the reordering bug** (the coloured phrase no longer jumps to the end), preserves spacing, comments, cards, and all structure, and means **Publish outputs your exact original HTML** with only the words changed. Content still lives in Payload; the code is never touched. Verified on fixtures (order, spaces, comments, cards, checkbox, icon+text, images) + multi-page shared sync.

## 2026-06-22

**`09:30 PM`**
- **Connected-site editing brought up to the builder's level.** The in-preview editor now: edits text **inline** (click and type, keeping icons/inline pieces intact), shows a **real dropdown menu** (Edit with AI / Change image) via a floating **⋮** that never gets clipped, and **"Edit with AI" targets the item in chat** (no popup). **Edit mode toggles instantly** (no reload). The chat panel matches the builder — **message bubbles**, **attach/paste a reference image** (e.g. a screenshot to copy wording from), and an **auto-growing** box with no scrollbar.
- **Undo** for connected edits (reverts your last change), and **styled/split text** (e.g. a two-colour logo) is now fully editable without duplicating text.
- **Publish fixes:** the real failure reason is shown (e.g. "No Cloudflare project set"), you can **set the Cloudflare project from the editor**, and removing a site now also **deletes its pulled repo/built files** from disk.
- **Connect a GitHub URL** (we clone + build it), works for sites **not yet deployed** (first Publish creates the Cloudflare project), and deploys to the site's **exact** project.
- **Dev speed:** `pnpm dev` now uses file polling (fixes the network-drive watcher), plus a faster `pnpm dev:fast` (Turbopack).

**`05:30 PM`**
- **One workspace, with a simple "New" menu.** The two separate screens (build-from-scratch and edit-a-connected-site) are now **one screen**. A **"New ▾"** button at the top lets you **Connect a website** or **Create from scratch**, and a **History** list reopens anything you've already connected or the builder. Both open in the **same editing layout** (chat panel, live preview, edit-mode toggle).
- **Connecting now handles a real, whole website — not just one page.** You point SiteAgent at the **built site folder (`dist`) or a GitHub repo** (it builds the repo for you). It loads **every page plus all the styles, scripts, and images**, so the preview looks exactly like the real site. You can switch between pages, and **edit text & images by clicking or by chat** — all saved as drafts in the CMS; **the website's code is never touched**.
- **Publish now redeploys the whole site** (every page + all assets, with your edits) to the **same web address**, with one-click rollback. Connected sites are **content-only** for now (no adding pages/sections — that's a later phase).
- **You can connect a site that isn't deployed yet.** Give just the code (folder or repo) and leave the live address blank — you can edit straight away, and **Publish does the first Cloudflare deploy for you** (creates the project) and fills in the live address. Also fixed publishing to use the site's **exact** Cloudflare project name, so it updates the real site instead of a new one.
- **Swapped images now show on the live site** — uploaded replacement images are bundled into the deployed site (no more broken images after publish).
- Cleaned up the build standard into a professional, rules-only `docs/templateRule.md` (replaces `docs/rules.md`).

**`03:30 PM`**
- **New capability — edit an existing website with SiteAgent.** A client can hand over a static website they already built (its address + a Cloudflare key), and SiteAgent now: **connects** to it (reads every text and image into the CMS), lets you **edit any of them — by clicking on a live preview or by chatting with the AI** (saved as drafts), and on **Publish** puts the changes back at the **same web address** — the design is never touched. Safety built in: edits stay drafts until Publish, the new version is checked before going live, and there's **one-click rollback**. Verified the connect → edit (text + image) → render loop on a sample site, with the design and untouched parts preserved; the live deploy reuses the existing Cloudflare publishing.
- Added **`docs/rules.md`** — the standard a client follows when building a site so SiteAgent can edit it (recommended stack, the one golden rule, optional `data-sa` markers, images, handover checklist, example).
- The project tracker now has a **"Connected Sites"** module reflecting this work.

## 2026-06-20

**`06:50 PM`**
- **"Add a new page" in chat now actually adds a page.** Before, typing something like *"add new page Product"* into the chat was treated as a content edit and dumped a products section onto the page you were already on. The chat now recognises a clear page-creation request ("add / create / make a new page X", "new page: About") and creates a brand-new page named X — then drops you onto it so you can fill it in. It's deliberately careful: ordinary edits like *"add a hero to the page"* or *"add a products section"* still edit the current page as before. New pages created this way use the exact same naming/slug logic as the "+ Add page" button.
- **Responsive workspace header ("top hat").** The chat panel's top bar (Signed-in email · live URL · Publish · Sign out) used to overflow and get cramped when the chat panel was made narrow. It now wraps cleanly onto a second row, with the email truncating gracefully, so everything stays reachable at any panel width.

**`08:35 PM`**
- **Live URL is now captured, saved, and always shown.** Fixed a bug where a *successful* Cloudflare publish was mis-read as a failure (the URL has two subdomain parts and the matcher only allowed one). Now Publish returns the clean public address, **saves it on the customer's record**, and shows it **persistently in the workspace header** (e.g. `siteagent-acme.pages.dev ↗`) — so the customer can always open their live site, even after a refresh. Also made the publish chat reply **short and standard** ("Your site is now live.") instead of dumping the raw deploy log; any real error is logged server-side and the customer just sees "Publishing failed. Please try again."

**`08:05 PM`**
- **Real publishing to Cloudflare (step 4 — going live for real).** Publish now does the whole pipeline: freeze the draft → render the site to a self-contained static website (HTML per page + copied images) → upload it to the customer's own Cloudflare Pages project via direct upload → return the real public URL (`siteagent-<customer>.pages.dev`). No GitHub needed for this path. When Cloudflare isn't configured it falls back to the local `/site/<customer>` preview, so nothing breaks. Cloudflare credentials are read through the same safe config seam (optional). Verified the static-site render + export end to end; the live upload runs once the Cloudflare token is in place.

**`07:20 PM`**
- **Publish (step 1 — going live, local).** Added a green **Publish** button in the workspace: it freezes the current draft as the live version, and the customer's site is then viewable at a public, no-login URL — `/site/<customer>` (e.g. `/site/acme`) — rendering the published pages, nav, sections, images, and theme exactly as a visitor sees them. A **"View live site"** link appears after publishing. This is the full **edit → preview → LIVE** loop working on `localhost` today; the next step wires the same output to Cloudflare for a real public web address. Verified publish + public render end to end.

**`06:35 PM`**
- **Flexible Product cards** (per the "give a reference, match it" goal — done the safe way with configurable sections, not free-form code). The product card now has a **description**, and price / old-price / badge / button are all **optional** — so the same card renders as a plain *image + name + description* card (matching a simple catalog) or a full shop card. Add the extra fields per card from its ⋯ menu ("Add price / badge / button") or by asking the AI; the AI now only fills the fields you ask for.
- **Friendlier AI replies.** The agent now explains what it actually did in plain language ("Done — I changed your main heading to 'Welcome'.") instead of a generic "3 sections".
- **Sent-message badges.** When you target a section (or attach an image) your sent chat message now shows it as a badge (e.g. "Section: Call to action"), so it's clear what the request applied to.
- **Chat box polish.** Removed the scrollbar, shortened the placeholder to one line, and the box now grows automatically as you type (Enter sends, Shift+Enter new line). You can also paste an image straight into the chat.

**`05:55 PM`**
- **New "Product cards" section.** A proper e-commerce section: a grid of product cards, each with an image, name, price, a struck-through old price, a discount badge (e.g. "-30%"), and a button. Add it from "Add a section", or ask the AI ("add a products section with 3 products") — verified the AI fills name/price/old price/badge correctly. This is the right fit for shop/reference-image requests (instead of cramming products into a generic Features card). You still upload each product photo.
- **Database safety hardening.** Made it impossible at the database level for a page to exist without an owner (added NOT-NULL on the page's tenant and change-batch links) — verified it doesn't affect normal editing.
- **Working indicator.** The chat now shows a clean animated "working" indicator while the AI composes, instead of a static "Thinking…".

**`05:20 PM`**
- **Themed dialogs.** Replaced the browser's grey native pop-ups ("localhost:3000 says…") with clean in-app dialogs that match the project style — used for the delete-section confirm and the new-page name prompt (a proper input field, Enter to confirm, Esc/Cancel to dismiss, click-outside to close).

**`05:00 PM`**
- **Chat refinements.** Removed the redundant background-image upload button from the chat (images are now placed directly in the preview). The remaining attach button is for reference images and now also accepts **paste (Ctrl+V)** of an image straight into the chat. The chat box is now multi-line: **Enter sends, Shift+Enter adds a new line.**

**`04:40 PM`**
- **Professional UI pass.** Replaced the editing on/off control with a proper minimal **toggle switch** ("Edit mode"). Collapsed the per-section emoji buttons (point-AI / move / delete / image) into a single discreet **"⋯" menu** in each section and item corner — click to open a small options list (Edit with AI, Change/Remove background image, Move up/down, Delete), click outside to close. Removed the playful emoji throughout (image/attach buttons and chips now use clean line icons), to match the minimal, professional standard for the project.

**`04:05 PM`**
- **Edit-mode toggle.** Top-right of the preview there's now an **"✏️ Editing: ON / 👁 Preview only"** switch. ON shows all the editing controls (click-to-edit text, image/section buttons, add-section bar); OFF hides every control and shows the site exactly as a visitor would see it — a clean preview.
- **Minimal icon controls.** The bulky "🖼 Change image / Add image / ✕" text buttons are now small icon-only buttons (🖼 to set, ✕ to remove; 🎯 ↑ ↓ 🗑 for sections) that only appear in edit mode.

**`03:30 PM`**
- **You can now fully build a page by hand, not only via the AI.** Every section has on-canvas controls: move up/down, delete, and **🎯 "Point AI here"** — and there's an **"Add a section"** bar (hero, features, testimonials, call-to-action, contact, text) plus **+ Add item / ✕** on feature and testimonial cards. So customers can shape the whole layout themselves.
- **"Point AI here" + Alt+E shortcut.** Don't know what a section is called? Click **🎯 Point AI here** on it (or hover it and press **Alt+E**) — a chip shows "your next message edits the Hero section," and the AI applies your instruction to exactly that section, even if you just say "make this shorter."
- **Undo.** An **↶ Undo** button reverts the last change to a page (one level; press again to redo). Works for AI edits, text edits, image changes, and add/remove/move section.
- **Housekeeping:** removed the old unused fixed-section fields from the database now that everything runs on the dynamic layout.

**`02:30 PM`**
- **Images anywhere, placed by clicking.** Every section can now have its own background image, and feature/product cards can each have their own photo — not just the hero. To set one, the customer **clicks the image (or "Add image") right on the section/product in the preview**, picks a file, and it lands exactly where they clicked — so there's no need to know section names. If they don't like it there's a one-click **Undo** (revert to the previous image), and an **✕** to remove an image. Crucially, uploaded photos are **kept when the AI later edits the text** (verified: changed a section's heading and both the background and product images stayed). Removed the decorative browser dots from the address bar.

**`12:58 PM`**
- **Multi-page sites.** A customer's site can now have many pages (Home, About, Services…), not just one. In the workspace there's a row of page tabs with an **"+ Add page"** button, a fake browser **address bar** at the top of the preview showing the current page's route (e.g. `yoursite.com/about`), and a **navigation menu** rendered on the site once there's more than one page. Chat edits, click-to-edit, and image uploads all apply to whichever page you're viewing. Verified end to end (added an About page at `/about` and switched to it). Next: per-section background images.

**`12:15 PM`**
- Rebuilt the page to be **fully dynamic** — the product's real logic. A page is now an open-ended stack of sections (hero, features, testimonials, call-to-action, contact, text): any sections, any number of items, in any order. You can genuinely add more now — "add two more features" actually adds them (verified 3 → 5), add new sections, reorder, and restyle, all from a single chat request, and everything in the preview stays click-to-edit. This replaces the old fixed-slot sections.

**`11:19 AM`**
- More design power: two new sections — customer **Testimonials** and a **Contact** section — plus **theming** (the AI, or the customer, can change the site's accent colour and switch the font). Verified the AI added a full testimonials section and recoloured the theme to green in a single request. A page can now stack hero, features, testimonials, call-to-action, and contact — each editable and styled by the theme.

**`10:46 AM`**
- The AI can now *design*, not just reword. In a single request a customer can say "add a features section about our coffee shop" and the AI turns the section on and writes the heading plus all three columns at once — verified (one sentence produced 8 coordinated edits). It also works with an attached reference image. This is the core of the "AI builds your site" promise.

**`10:22 AM`**
- Pages are now real multi-section websites. On top of the hero, there's a 3-column "Features" section and a "Call to action" section with a button — and every piece is click-to-edit, just like the hero. The example site now shows all three sections stacked like a proper landing page. (Next: letting the AI add and fill a whole section from a single request.)

**`10:02 AM`**
- Fixed the hero section preview: an uploaded image now shows as a full-width background with the heading and subheading laid over it (a proper hero banner), instead of the image sitting on top of the text.

## 2026-06-19

**`08:04 PM`**
- Image features complete. Fixed the upload error (photos now save correctly, scoped to each customer). And the AI can now "see" images: a customer can attach a reference image (📎 button) and ask the AI to act on it — verified end-to-end (sent a coloured image, the AI read it and updated the page from what it saw). So images now work two ways: add a photo to the page (🖼), or show the AI a reference (📎).

**`07:41 PM`**
- Added direct "click-to-edit": in the live preview, a customer can click the heading or subheading and type a new value in place — the second way to edit (alongside chat), without touching the technical admin. It saves through the same safe, tracked path. So the workspace now offers all three: chat with the AI, click-to-edit, and image upload.

**`07:15 PM`**
- Added image upload (first stage): from the chat workspace a customer can upload a photo and it instantly appears on their site as the hero image, kept private to their own account. Stored on this machine for now (moves to cloud storage when we deploy). Next stage: letting the AI "see" an uploaded reference image to decide changes.

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
