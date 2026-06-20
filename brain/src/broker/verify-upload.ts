/** Reproduce a media upload server-side to surface the real error.
 *  Run: pnpm payload run src/broker/verify-upload.ts   (-> upload-result.txt) */
import { writeFileSync } from 'node:fs'

import sharp from 'sharp'

import { uploadTenantMedia } from './adapter'
import { getBrokerClient } from './payload-client'

const RESULT_FILE = 'S:/SiteAgent/brain/upload-result.txt'
const out: string[] = []

try {
  const payload = await getBrokerClient()
  const acme = (await payload.find({ collection: 'tenants', where: { slug: { equals: 'acme' } }, limit: 1, overrideAccess: true })).docs[0]
  if (!acme) throw new Error('seed data missing')
  const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 10, g: 200, b: 80 } } }).png().toBuffer()
  const media = await uploadTenantMedia(acme.id, { buffer: png, filename: 'test.png', mimetype: 'image/png', alt: 'test' })
  out.push('media created id=' + (media as any).id + ' url=' + (media as any).url + ' filename=' + (media as any).filename)
  writeFileSync(RESULT_FILE, 'UPLOAD_OK\n' + out.join('\n') + '\n')
  process.exit(0)
} catch (err: any) {
  writeFileSync(RESULT_FILE, 'UPLOAD_FAIL\n' + out.join('\n') + '\n' + (err?.stack ?? String(err)) + '\n')
  process.exit(1)
}
