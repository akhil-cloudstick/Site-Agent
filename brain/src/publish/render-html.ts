import type { PreviewBlock } from '../workspace/types'
import type { PublishedPage, PublishedSite } from './published'

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

const bgOf = (url?: string) => (url ? `background-image:url('${esc(url)}');background-size:cover;background-position:center;` : '')
const overlayOf = (url?: string) => (url ? `<div style="position:absolute;inset:0;background:rgba(0,0,0,0.5)"></div>` : '')

function blockHtml(b: PreviewBlock, accent: string): string {
  const bg = b.imageUrl
  const bgCss = bgOf(bg)
  const overlay = overlayOf(bg)
  const wrap = (inner: string, sectionStyle: string, ov = overlay) => `<section style="${sectionStyle}">${ov}<div style="position:relative;z-index:1">${inner}</div></section>`

  switch (b.type) {
    case 'hero':
      return `<section style="position:relative;${bg ? 'min-height:460px;' : ''}display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:80px 48px;${bgCss}">${bg ? `<div style="position:absolute;inset:0;background:rgba(0,0,0,0.38)"></div>` : ''}<div style="position:relative;z-index:1"><h1 style="font-size:48px;margin:0 0 14px;color:${bg ? '#fff' : '#111'}">${esc(b.heading)}</h1><p style="font-size:22px;margin:0;color:${bg ? '#f3f3f3' : '#555'}">${esc(b.subheading)}</p></div></section>`
    case 'features': {
      const cards = b.items
        .map(
          (it) =>
            `<div style="flex:1 1 220px;max-width:280px;background:#fff;border:1px solid #eee;border-radius:10px;padding:24px;overflow:hidden;text-align:left">${it.imageUrl ? `<img src="${esc(it.imageUrl)}" alt="" style="width:calc(100% + 48px);height:150px;object-fit:cover;display:block;margin:-24px -24px 16px">` : ''}<h3 style="font-size:18px;margin:0 0 8px">${esc(it.title)}</h3><p style="font-size:14px;color:#666;margin:0">${esc(it.text)}</p></div>`,
        )
        .join('')
      return wrap(`<h2 style="font-size:30px;margin:0 0 36px;color:${bg ? '#fff' : '#111'}">${esc(b.heading)}</h2><div style="display:flex;gap:24px;justify-content:center;flex-wrap:wrap;align-items:flex-start">${cards}</div>`, `position:relative;padding:64px 48px;text-align:center;background:${bg ? '#222' : '#fafafa'};${bgCss}`)
    }
    case 'products': {
      const cards = b.items
        .map((p) => {
          const img = p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="" style="width:100%;height:180px;object-fit:cover;display:block">` : `<div style="width:100%;height:180px;background:#f1f1f1"></div>`
          const badge = p.badge ? `<span style="position:absolute;top:10px;left:10px;background:#111;color:#fff;font-size:12px;font-weight:600;padding:3px 8px;border-radius:6px">${esc(p.badge)}</span>` : ''
          const price = p.price || p.oldPrice ? `<div style="font-size:15px;margin-bottom:${p.buttonLabel ? '12px' : '0'};display:flex;gap:8px;align-items:baseline">${p.price ? `<span style="font-weight:700">${esc(p.price)}</span>` : ''}${p.oldPrice ? `<span style="color:#aaa;text-decoration:line-through;font-size:13px">${esc(p.oldPrice)}</span>` : ''}</div>` : ''
          const btn = p.buttonLabel ? `<span style="display:block;text-align:center;padding:10px 0;border-radius:8px;background:${esc(accent)};color:#fff;font-size:13px;font-weight:600">${esc(p.buttonLabel)}</span>` : ''
          const desc = p.description ? `<p style="font-size:13px;color:#666;margin:0 0 12px;line-height:1.5">${esc(p.description)}</p>` : ''
          return `<div style="position:relative;flex:1 1 220px;max-width:260px;background:#fff;border:1px solid #eee;border-radius:12px;overflow:hidden;text-align:left;box-shadow:0 1px 4px rgba(0,0,0,0.06)"><div style="position:relative">${img}${badge}</div><div style="padding:16px"><h3 style="font-size:16px;margin:0 0 6px">${esc(p.name)}</h3>${desc}${price}${btn}</div></div>`
        })
        .join('')
      return wrap(`<h2 style="font-size:30px;margin:0 0 36px;color:${bg ? '#fff' : '#111'}">${esc(b.heading)}</h2><div style="display:flex;gap:24px;justify-content:center;flex-wrap:wrap;align-items:flex-start">${cards}</div>`, `position:relative;padding:64px 48px;text-align:center;background:${bg ? '#222' : '#fff'};${bgCss}`)
    }
    case 'testimonials': {
      const cards = b.items
        .map(
          (t) =>
            `<div style="flex:1 1 240px;max-width:300px;background:#fafafa;border:1px solid #eee;border-radius:10px;padding:24px">${t.imageUrl ? `<img src="${esc(t.imageUrl)}" alt="" style="width:56px;height:56px;border-radius:50%;object-fit:cover;display:block;margin:0 auto 10px">` : ''}<p style="font-size:15px;font-style:italic;color:#444;margin:0 0 12px">&ldquo;${esc(t.quote)}&rdquo;</p><p style="font-size:13px;font-weight:600;color:${esc(accent)};margin:0">&mdash; ${esc(t.author)}</p></div>`,
        )
        .join('')
      return wrap(`<h2 style="font-size:30px;margin:0 0 36px;color:${bg ? '#fff' : '#111'}">${esc(b.heading)}</h2><div style="display:flex;gap:24px;justify-content:center;flex-wrap:wrap;align-items:flex-start">${cards}</div>`, `position:relative;padding:64px 48px;text-align:center;background:${bg ? '#222' : '#fff'};${bgCss}`)
    }
    case 'gallery': {
      const cells = b.items
        .map(
          (it) =>
            `<figure style="flex:1 1 200px;max-width:300px;margin:0">${it.imageUrl ? `<img src="${esc(it.imageUrl)}" alt="${esc(it.caption)}" style="width:100%;height:200px;object-fit:cover;display:block;border-radius:10px">` : `<div style="width:100%;height:200px;background:#eee;border-radius:10px"></div>`}${it.caption ? `<figcaption style="font-size:13px;color:#666;margin-top:8px">${esc(it.caption)}</figcaption>` : ''}</figure>`,
        )
        .join('')
      return wrap(`<h2 style="font-size:30px;margin:0 0 36px;color:${bg ? '#fff' : '#111'}">${esc(b.heading)}</h2><div style="display:flex;gap:16px;justify-content:center;flex-wrap:wrap">${cells}</div>`, `position:relative;padding:64px 48px;text-align:center;background:${bg ? '#222' : '#fff'};${bgCss}`)
    }
    case 'faq': {
      const rows = b.items
        .map(
          (it) =>
            `<div style="max-width:760px;margin:0 auto 16px;text-align:left;border-bottom:1px solid #eee;padding-bottom:16px"><h3 style="font-size:18px;margin:0 0 6px;color:${bg ? '#fff' : '#111'}">${esc(it.question)}</h3><p style="font-size:15px;color:${bg ? '#ddd' : '#555'};margin:0;line-height:1.6">${esc(it.answer)}</p></div>`,
        )
        .join('')
      return wrap(`<h2 style="font-size:30px;margin:0 0 36px;color:${bg ? '#fff' : '#111'}">${esc(b.heading)}</h2>${rows}`, `position:relative;padding:64px 48px;text-align:center;background:${bg ? '#222' : '#fafafa'};${bgCss}`)
    }
    case 'pricing': {
      const cards = b.items
        .map((p) => {
          const hot = p.highlighted === 'true'
          const feats = (p.features || '')
            .split('\n')
            .map((f) => f.trim())
            .filter(Boolean)
            .map((f) => `<li style="font-size:14px;color:#555;margin:6px 0">${esc(f)}</li>`)
            .join('')
          const btn = p.buttonLabel ? `<span style="display:block;text-align:center;padding:10px 0;border-radius:8px;background:${hot ? esc(accent) : '#111'};color:#fff;font-size:14px;font-weight:600;margin-top:16px">${esc(p.buttonLabel)}</span>` : ''
          return `<div style="flex:1 1 240px;max-width:300px;background:#fff;border:${hot ? `2px solid ${esc(accent)}` : '1px solid #eee'};border-radius:12px;padding:28px;text-align:left;box-shadow:0 2px 8px rgba(0,0,0,0.06)"><h3 style="font-size:20px;margin:0 0 8px">${esc(p.name)}</h3><div style="margin:0 0 16px"><span style="font-size:32px;font-weight:700">${esc(p.price)}</span><span style="font-size:14px;color:#888">${esc(p.period)}</span></div><ul style="list-style:none;padding:0;margin:0">${feats}</ul>${btn}</div>`
        })
        .join('')
      return wrap(`<h2 style="font-size:30px;margin:0 0 36px;color:${bg ? '#fff' : '#111'}">${esc(b.heading)}</h2><div style="display:flex;gap:24px;justify-content:center;flex-wrap:wrap;align-items:stretch">${cards}</div>`, `position:relative;padding:64px 48px;text-align:center;background:${bg ? '#222' : '#fafafa'};${bgCss}`)
    }
    case 'logos': {
      const cells = b.items
        .map(
          (it) =>
            `<div style="flex:0 0 auto;display:flex;align-items:center;justify-content:center;height:48px">${it.imageUrl ? `<img src="${esc(it.imageUrl)}" alt="${esc(it.alt)}" style="max-height:48px;max-width:140px;object-fit:contain;filter:grayscale(1);opacity:.7">` : `<span style="color:#bbb;font-size:13px">${esc(it.alt || 'Logo')}</span>`}</div>`,
        )
        .join('')
      return wrap(`${b.heading ? `<h2 style="font-size:20px;margin:0 0 28px;color:${bg ? '#fff' : '#888'};font-weight:600">${esc(b.heading)}</h2>` : ''}<div style="display:flex;gap:40px;justify-content:center;flex-wrap:wrap;align-items:center">${cells}</div>`, `position:relative;padding:48px;text-align:center;background:${bg ? '#222' : '#fff'};${bgCss}`)
    }
    case 'cta':
      return wrap(`<h2 style="font-size:30px;margin:0 0 22px;color:#fff">${esc(b.heading)}</h2><span style="display:inline-block;padding:12px 28px;border-radius:8px;background:${esc(accent)};color:#fff;font-size:16px">${esc(b.buttonLabel)}</span>`, `position:relative;padding:72px 48px;text-align:center;background:#111;color:#fff;${bgCss}`)
    case 'contact':
      return wrap(`<h2 style="font-size:30px;margin:0 0 14px;color:${bg ? '#fff' : '#111'}">${esc(b.heading)}</h2><p style="font-size:16px;color:${bg ? '#eee' : '#555'};margin:0 0 24px">${esc(b.text)}</p><span style="display:inline-block;padding:12px 28px;border-radius:8px;background:${esc(accent)};color:#fff;font-size:16px">${esc(b.buttonLabel)}</span>`, `position:relative;padding:72px 48px;text-align:center;background:${bg ? '#222' : '#fafafa'};${bgCss}`)
    case 'richText':
    default:
      return wrap(`<h2 style="font-size:28px;margin:0 0 14px;color:${bg ? '#fff' : '#111'}">${esc((b as any).heading)}</h2><p style="font-size:16px;color:${bg ? '#eee' : '#555'};max-width:680px;margin:0 auto;line-height:1.6">${esc((b as any).body)}</p>`, `position:relative;padding:56px 48px;text-align:center;${bg ? 'background:#222;' : ''}${bgCss}`)
  }
}

/** Render a published page to its body inner HTML (nav + sections). `linkBase`
 *  prefixes nav links ('/site/<slug>' for the in-Brain route, '' for static export). */
export function renderSiteBody(site: PublishedSite, current: PublishedPage, linkBase: string): string {
  const accent = current.theme.primaryColor
  const fontFamily = current.theme.font === 'serif' ? 'Georgia, &quot;Times New Roman&quot;, serif' : 'system-ui, sans-serif'

  let nav = ''
  if (site.pages.length > 1) {
    const links = site.pages
      .map((p) => {
        const href = p.route === '/' ? linkBase || '/' : `${linkBase}${p.route}`
        const active = p.route === current.route
        return `<a href="${esc(href)}" style="text-decoration:none;font-size:15px;font-weight:${active ? 700 : 500};color:${active ? esc(accent) : '#444'}">${esc(p.navLabel)}</a>`
      })
      .join('')
    nav = `<nav style="display:flex;gap:20px;justify-content:center;padding:16px 24px;border-bottom:1px solid #eee;flex-wrap:wrap">${links}</nav>`
  }

  const sections = current.layout.map((b) => blockHtml(b, accent)).join('')
  return `<div style="font-family:${fontFamily};color:#111">${nav}${sections}</div>`
}
