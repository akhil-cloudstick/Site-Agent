/** Live test: images can live on any section + on product items, survive an AI
 *  text edit (carried over), and revert. Run: pnpm payload run src/agent/verify-images.ts */
import { writeFileSync } from 'node:fs'

import { listTenantPages, updateTenantPage, uploadTenantMedia } from '../broker/adapter'
import { getBrokerClient } from '../broker/payload-client'
import { setImageForUpload } from '../workspace/layout'
import { runContentEdit } from './content-agent'

const RESULT_FILE = 'S:/SiteAgent/brain/images-result.txt'
const out: string[] = []
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

async function featuresBlock(payload: any, tenantId: number) {
  const page = (await payload.find({ collection: 'pages', where: { and: [{ tenant: { equals: tenantId } }, { slug: { equals: 'home' } }] }, draft: true, depth: 2, limit: 1, overrideAccess: true })).docs[0]
  const idx = (page?.layout ?? []).findIndex((b: any) => b.blockType === 'features')
  return { page, idx, block: page?.layout?.[idx] }
}

try {
  const payload = await getBrokerClient()
  const acme = (await payload.find({ collection: 'tenants', where: { slug: { equals: 'acme' } }, limit: 1, overrideAccess: true })).docs[0]
  if (!acme) throw new Error('seed data missing')

  const media = (await uploadTenantMedia(acme.id, { buffer: PNG, filename: 'test.png', mimetype: 'image/png', alt: 'test' })) as any
  out.push('created media id=' + media.id)

  // Place a section background + a product image on the first feature item.
  let { page, idx } = await featuresBlock(payload, acme.id)
  const r1 = setImageForUpload(page, `layout.${idx}.image`, media.id)
  await updateTenantPage(acme.id, page.id, { layout: r1!.layout })
  ;({ page, idx } = await featuresBlock(payload, acme.id))
  const r2 = setImageForUpload(page, `layout.${idx}.items.0.image`, media.id)
  await updateTenantPage(acme.id, page.id, { layout: r2!.layout })

  let fb = await featuresBlock(payload, acme.id)
  const sectionImg = fb.block?.image?.id ?? fb.block?.image
  const itemImg = fb.block?.items?.[0]?.image?.id ?? fb.block?.items?.[0]?.image
  out.push(`after upload: sectionImage=${sectionImg} itemImage=${itemImg}`)

  // An AI text edit must NOT wipe the images.
  const edit = await runContentEdit(acme.id, page.id, 'Change the features heading to "Our Products".')
  out.push('ai edit: ' + JSON.stringify(edit))
  fb = await featuresBlock(payload, acme.id)
  const sectionImg2 = fb.block?.image?.id ?? fb.block?.image
  const itemImg2 = fb.block?.items?.[0]?.image?.id ?? fb.block?.items?.[0]?.image
  out.push(`after AI edit: heading="${fb.block?.heading}" sectionImage=${sectionImg2} itemImage=${itemImg2}`)

  // Revert (clear) the section image.
  const r3 = setImageForUpload(fb.page, `layout.${fb.idx}.image`, null)
  await updateTenantPage(acme.id, fb.page.id, { layout: r3!.layout })
  fb = await featuresBlock(payload, acme.id)
  const cleared = !(fb.block?.image)
  out.push('after clear: sectionImage cleared=' + cleared + ' (previous from set=' + r3!.previous + ')')

  const ok =
    sectionImg === media.id && itemImg === media.id &&
    edit.ok && sectionImg2 === media.id && itemImg2 === media.id &&
    cleared
  writeFileSync(RESULT_FILE, (ok ? 'IMAGES_OK' : 'IMAGES_FAIL') + '\n' + out.join('\n') + '\n')
  process.exit(ok ? 0 : 1)
} catch (err: any) {
  writeFileSync(RESULT_FILE, 'IMAGES_ERROR\n' + out.join('\n') + '\n' + (err?.stack ?? String(err)) + '\n')
  process.exit(1)
}
