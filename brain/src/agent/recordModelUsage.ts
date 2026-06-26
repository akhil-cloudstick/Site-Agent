import { getBrokerClient } from '../broker/payload-client'

/**
 * Best-effort per-model usage counter — incremented after each `chat()` model attempt
 * (success OR failure) so the operator can see, on /admin/settings, which models carry the
 * load and which fail/overload. Fire-and-forget from the hot path; NEVER throws.
 */
export async function recordModelUsage(
  model: string,
  opts: { ok: boolean; promptTokens?: number; completionTokens?: number },
): Promise<void> {
  try {
    if (!model) return
    const payload = await getBrokerClient()
    const found = await payload.find({ collection: 'modelUsage', where: { model: { equals: model } }, limit: 1, depth: 0, overrideAccess: true })
    const cur = found.docs[0] as any
    const data = {
      calls: (cur?.calls ?? 0) + (opts.ok ? 1 : 0),
      fails: (cur?.fails ?? 0) + (opts.ok ? 0 : 1),
      promptTokens: (cur?.promptTokens ?? 0) + (Number(opts.promptTokens) || 0),
      completionTokens: (cur?.completionTokens ?? 0) + (Number(opts.completionTokens) || 0),
      lastUsedAt: new Date().toISOString(),
    }
    if (cur) await payload.update({ collection: 'modelUsage', id: cur.id, data, overrideAccess: true })
    else await payload.create({ collection: 'modelUsage', data: { model, ...data }, overrideAccess: true })
  } catch {
    // best-effort telemetry — must never affect the request.
  }
}

export interface ModelUsageRow {
  model: string
  calls: number
  fails: number
  promptTokens: number
  completionTokens: number
  lastUsedAt: string | null
}

/** Read all per-model usage rows (operator settings page). */
export async function loadModelUsage(): Promise<ModelUsageRow[]> {
  const payload = await getBrokerClient()
  const res = await payload.find({ collection: 'modelUsage', overrideAccess: true, limit: 200, depth: 0 }).catch(() => null)
  return ((res?.docs ?? []) as any[]).map((d) => ({
    model: d.model,
    calls: d.calls ?? 0,
    fails: d.fails ?? 0,
    promptTokens: d.promptTokens ?? 0,
    completionTokens: d.completionTokens ?? 0,
    lastUsedAt: d.lastUsedAt ?? null,
  }))
}

/** Zero all model-usage counters (operator "Reset usage"). */
export async function resetModelUsage(): Promise<void> {
  const payload = await getBrokerClient()
  await payload.delete({ collection: 'modelUsage', where: { model: { exists: true } }, overrideAccess: true }).catch(() => {})
}
