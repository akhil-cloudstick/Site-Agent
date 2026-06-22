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

## 3. Hosting
- Static build → **Cloudflare Pages**, connected to the site's **GitHub repo** (auto-deploy on push).
- Build output is a normal static folder (e.g. `dist/`).

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

## 5. Images
- Editable images: plain `<img src="/images/…">` from `public/` — not framework-optimized/hashed imports.

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
    <section class="hero">
      <h1  data-sa="text:hero.heading">Welcome to Ayurveda Wellness</h1>
      <p   data-sa="text:hero.subheading">Natural healing, the traditional way.</p>
      <img data-sa="image:hero.image" src="/images/hero.jpg" alt="Clinic" />
    </section>
  </body>
</html>
```

---
**Scope:** SiteAgent edits **text and images** only. Structural changes (pages, sections, layout) are a later capability.
