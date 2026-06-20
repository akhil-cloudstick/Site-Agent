/**
 * One-off probe: can the configured OpenRouter models read images?
 * Sends a solid-red test image and asks the color. Run:
 *   pnpm payload run src/agent/probe-vision.ts   (-> vision-result.txt)
 */
import { writeFileSync } from 'node:fs'

import sharp from 'sharp'

import { getEnv } from '../config/env'
import { MODEL_CONFIG } from './model'

const RESULT_FILE = 'S:/SiteAgent/brain/vision-result.txt'
const out: string[] = []

try {
  const apiKey = getEnv().openRouterApiKey
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set')

  const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 220, g: 30, b: 30 } } })
    .png()
    .toBuffer()
  const dataUrl = 'data:image/png;base64,' + png.toString('base64')

  for (const model of MODEL_CONFIG.models) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://siteagent.local',
          'X-Title': 'SiteAgent',
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'What single color fills this image? Answer in one word.' },
                { type: 'image_url', image_url: { url: dataUrl } },
              ],
            },
          ],
        }),
      })
      const status = res.status
      const data: any = await res.json().catch(() => null)
      const content = data?.choices?.[0]?.message?.content
      if (typeof content === 'string') out.push(`${model}: HTTP ${status} -> "${content.trim().slice(0, 60)}"`)
      else out.push(`${model}: HTTP ${status} -> ERROR ${JSON.stringify(data?.error ?? data).slice(0, 140)}`)
    } catch (e: any) {
      out.push(`${model}: threw ${e?.message}`)
    }
  }
  writeFileSync(RESULT_FILE, out.join('\n') + '\n')
  process.exit(0)
} catch (err: any) {
  writeFileSync(RESULT_FILE, 'PROBE_ERROR\n' + (err?.stack ?? String(err)) + '\n')
  process.exit(1)
}
