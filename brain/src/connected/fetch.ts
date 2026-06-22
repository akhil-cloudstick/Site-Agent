/** Fetch a public URL's HTML server-side, with basic SSRF guards. */
export async function fetchPageHtml(url: string): Promise<string> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Invalid URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Only http(s) URLs are allowed')
  const host = parsed.hostname
  // Block obvious internal targets.
  if (/^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|::1)/i.test(host) || /\.local$/i.test(host)) {
    throw new Error('That address is not allowed')
  }
  const res = await fetch(parsed.toString(), { headers: { 'user-agent': 'SiteAgent/1.0 (+content-editor)' }, redirect: 'follow' })
  if (!res.ok) throw new Error(`Could not fetch the page (${res.status})`)
  return await res.text()
}
