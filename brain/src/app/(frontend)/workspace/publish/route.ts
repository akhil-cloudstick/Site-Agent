import path from 'node:path'

import { type NextRequest, NextResponse } from 'next/server'

import { getSessionUser, tenantIdOfUser } from '@/auth/session'
import { cloudflareConfigured, deployToCloudflare } from '@/publish/deploy-cloudflare'
import { exportSite } from '@/publish/export-site'
import { publishTenantPages, saveTenantLiveUrl } from '@/publish/publish'

/** POST /workspace/publish — freeze the current drafts as the published site,
 *  and (if Cloudflare is configured) deploy it to a real public URL. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req.headers)
  if (!user) return NextResponse.json({ ok: false, message: 'Please log in.' }, { status: 401 })

  const tenantId = tenantIdOfUser(user)
  if (!tenantId) return NextResponse.json({ ok: false, message: 'No site linked.' }, { status: 403 })

  try {
    const { count, slug } = await publishTenantPages(tenantId)

    if (cloudflareConfigured()) {
      const dir = path.join(process.cwd(), '.publish', slug)
      const exported = await exportSite(slug, dir)
      if (!exported) return NextResponse.json({ ok: false, message: 'Nothing to publish.' }, { status: 400 })
      const { url } = await deployToCloudflare(slug, dir)
      await saveTenantLiveUrl(tenantId, url)
      return NextResponse.json({ ok: true, count, url, deployed: true })
    }

    // No Cloudflare yet — the local in-Brain published site.
    return NextResponse.json({ ok: true, count, url: `/site/${slug}`, deployed: false })
  } catch (err) {
    // Keep the full (noisy) deploy output in the server log; show the customer a short message.
    console.error('[publish] failed:', err)
    return NextResponse.json({ ok: false, message: 'Publishing failed. Please try again.' }, { status: 500 })
  }
}
