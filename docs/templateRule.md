# SiteAgent — Editable Website Build Standard

Build a static website to this standard and SiteAgent can edit its **text and images** and republish it to the same URL, with the design untouched.

## 1. Golden rule
Editable text and images **must be present in the built HTML** — not rendered by JavaScript at runtime.
- ✅ `<h1>Welcome</h1>`
- ❌ `<h1></h1>` filled by a script on load.

## 2. Stack
- **Recommended:** Astro with `output: 'static'`.
- **Allowed:** any static-site generator that outputs plain HTML (Astro, Eleventy, Hugo, Next.js static export, hand-written HTML).
- **Not allowed:** client-side-rendered apps (empty-shell SPAs).

## 3. Hosting & how SiteAgent publishes
- Host on **Cloudflare Pages**. Build output is a normal static folder (e.g. `dist/`).
- SiteAgent **clones the repo, runs the build, applies your content edits, and direct-uploads the whole folder** to the Cloudflare Pages project (same URL). It does **not** push to GitHub or rely on git auto-deploy — it just needs the **Cloudflare Pages project name** (the API token lives in SiteAgent). If the site isn't on Cloudflare yet, the first publish **creates** the project.
- **Caveat:** since content edits live in SiteAgent (not your source), don't rely on **git → Cloudflare auto-deploy** for a connected site — a later source push would rebuild from the repo and overwrite SiteAgent's edits. **SiteAgent owns the deploys.**
- The repo must build with a standard command (`npm install && npm run build`) into a static folder (`dist` / `build` / `out` / `_site` / `public`).

## 4. Marking content (`data-sa`) — recommended
SiteAgent auto-detects content, so tagging is optional — but a `data-sa` marker gives an element a **stable name that survives a redesign**. Use a dedicated `data-sa` attribute; never reuse `id`/`class`.

```html
<h1  data-sa="text:hero.heading">Welcome to Ayurveda Wellness</h1>
<p   data-sa="text:hero.subheading">Natural healing, the traditional way.</p>
<img data-sa="image:hero.image" src="/images/hero.jpg" alt="Clinic" />
```

- Format: `text:<key>` for text, `image:<key>` for images.
- `<key>` = `section.field`, lowercase (`hero.heading`, `about.body`); repeated items indexed (`services.items.0.title`).
- Unique per page. Assign once; never rename.

## 5. Images, icons & logos
- **Editable images:** plain `<img src="/images/…">` from `public/` — not framework-optimized/hashed imports.

### Icons & logos — three patterns, all supported
How an icon is *included* only decides *how* it can be edited. Pick per icon — none require changing your normal workflow:

| Pattern | Example | Change image (click → upload/swap) | Edit with AI |
|---|---|---|---|
| **A. Inline SVG** (paste the SVG code; incl. icon fonts) | `<svg viewBox="0 0 512 512"><path d="…"/></svg>` | ❌ | ✅ |
| **B. Remote image** (icon straight from a CDN — no local file) | `<img src="https://cdn.icons.com/home.svg">` | ✅ | ✅ |
| **C. Local image** (your own file) | `<img src="/icons/home.svg">` or `.png` | ✅ | ✅ |

- **A — Inline `<svg>` / icon fonts** (`<i class="fa-…">`, `material-icons`): render exactly as designed with full CSS control (`currentColor`, hover, animation). They **can't be swapped with the image picker** (they're markup, not a file) but **are editable via "Edit with AI"** ("change the gear icon to a database icon"). **Recommended for ordinary/themed icons when the client edits via AI — no local file needed.** This is the normal "paste the SVG" workflow and it's fine.
- **B — Remote `<img src="https://…">`**: use an icon straight from an **online source, no local file required**. SiteAgent treats it as an image, so it's swappable via **Change image** (the swap uploads a replacement) *and* AI-editable. Good when you don't host icons yourself.
- **C — Local `<img src="/…">`**: your own file — use this for the **brand logo / custom marks** you keep locally. Fully editable, and the **only** way the client can upload their **exact** asset (AI can only *generate* an approximation, not your precise file).
- **An icon/logo that links somewhere:** wrap the `<img>` in `<a href="…">` — then it's both **image-editable** and **link-editable** (set/redirect, reorder).
- Mark editable icons/logos with a `data-sa` image marker like any image: `<img data-sa="image:nav.logo" src="/logo.svg" alt="Acme">`.

## 6. CSS / JavaScript / animations
- All allowed. SiteAgent changes only the text/image values inside elements — never classes, CSS, layout, or scripts.

## 7. Shared components (nav / footer / logo)
- Edits to a shared component **sync to every page automatically** — SiteAgent detects that the same text/image appears on multiple pages and updates them all. **Requirement:** keep shared components **byte-identical across pages** (same text, same image path). A real shared/imported component already is — just don't hard-code per-page wording into the footer/nav.

## 8. Editable text granularity
- Each **separate text run** is edited on its own. If a heading splits text with inline tags for styling — e.g. `Powering the AI era with <span class="accent">high-density compute</span> built to last.` — the **coloured piece** and each plain piece are edited **separately** (the plain pieces around a styled span aren't merged into one box).
- **If you want a whole phrase editable as one box, keep it as a single text run** (one element, no inner styling spans), or style it with CSS on the whole element instead of wrapping part of the text.

## 9. id / class
- Yours, for styling and JS. SiteAgent reads only `data-sa` (and otherwise auto-detects) — no clash.

## 10. Do not
- Render editable text/images with JavaScript only.
- Put editable content behind a login.
- Reuse or rename `data-sa` keys.
- Hash/optimize images that should be swappable.
- **Inline an `<svg>` for the brand logo / any asset the client must upload as a specific file** — use `<img src="…">` so they can replace the exact file. _(Inline `<svg>` is fine for ordinary icons that are edited via AI.)_

## 11. Handover
- GitHub repo (or the built site files).
- Cloudflare Pages project name.
- Live URL — **optional**: if the site isn't deployed yet, SiteAgent does the first deploy and creates the URL.
- Confirm: static build, editable content in the HTML.

## 12. Example (Astro)
```astro
---
// src/pages/index.astro
---
<html lang="en">
  <body>
    <header>
      <!-- Logo as <img> → editable + linkable. (An inline <svg> here would NOT be swappable.) -->
      <a href="/"><img data-sa="image:nav.logo" src="/logo.svg" alt="Ayurveda Wellness" /></a>
    </header>
    <section class="hero">
      <h1  data-sa="text:hero.heading">Welcome to Ayurveda Wellness</h1>
      <p   data-sa="text:hero.subheading">Natural healing, the traditional way.</p>
      <img data-sa="image:hero.image" src="/images/hero.jpg" alt="Clinic" />
      <!-- Feature icon as <img> → swappable via "Change image". -->
      <img data-sa="image:hero.icon" src="/icons/leaf.svg" alt="" width="32" height="32" />
    </section>
  </body>
</html>
```

---
**Scope:** SiteAgent edits **text, images, and icons/logos referenced as `<img>`**. It also now does **structural editing** on a connected site — add/remove/reorder pages & sections, reorder/duplicate/remove items (cards, nav links, buttons), set links/redirects, and AI-generate or AI-edit a section/page/card. Following the build standard above keeps content edits reliable; the structural ops layer on top.
