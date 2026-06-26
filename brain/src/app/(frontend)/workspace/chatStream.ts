/**
 * Client helper for the AI chat's NDJSON progress stream (B1). The chat/edit routes stream
 * `{stage:'thinking'|'applying'|'updating'}` events then a terminal `{stage:'done', …}`. This
 * reads them, calling `onStage` for each progress event, and resolves with the `done` payload.
 * Falls back to plain JSON when the response isn't a stream (e.g. a 4xx guard error).
 */

/** Map a server stream `stage` to a human label (real backend progress, not a timer). */
export const STAGE_LABEL: Record<string, string> = {
  thinking: 'Asking the AI…',
  applying: 'Applying your change…',
  updating: 'Updating the preview…',
}
export const stageLabel = (s: string): string => STAGE_LABEL[s] ?? 'Working…'

export async function readChatStream(res: Response, onStage: (stage: string) => void): Promise<any> {
  const ct = res.headers.get('content-type') || ''
  if (!res.body || !ct.includes('ndjson')) return await res.json().catch(() => ({ ok: false, message: 'Something went wrong.' }))
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let done: any = null
  const handle = (line: string) => {
    const t = line.trim()
    if (!t) return
    let evt: any
    try {
      evt = JSON.parse(t)
    } catch {
      return
    }
    if (evt.stage === 'done') done = evt
    else if (evt.stage) onStage(evt.stage)
  }
  for (;;) {
    const { value, done: rdone } = await reader.read()
    if (rdone) break
    buf += decoder.decode(value, { stream: true })
    let nl
    while ((nl = buf.indexOf('\n')) >= 0) {
      handle(buf.slice(0, nl))
      buf = buf.slice(nl + 1)
    }
  }
  handle(buf)
  return done ?? { ok: false, message: 'No response.' }
}
