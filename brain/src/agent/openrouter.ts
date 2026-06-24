import { getAiApiKey, getModelConfig } from './aiSettings'

/**
 * Minimal OpenRouter chat client (OpenAI-compatible). Tries the configured
 * models in order, falling back to the next on any failure (HTTP error, empty
 * response, network). Throws only if every model fails.
 */
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ContentPart[]
}

export interface CompletionResult {
  model: string
  content: string
}

export async function chat(
  messages: ChatMessage[],
  opts: { json?: boolean } = {},
): Promise<CompletionResult> {
  // Key + models come from the DB-backed settings global (env fallback). getAiApiKey
  // throws a clear message if unset / undecryptable (fail-closed).
  const apiKey = await getAiApiKey()
  const { models } = await getModelConfig()

  const errors: string[] = []
  for (const model of models) {
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://siteagent.local',
          'X-Title': 'SiteAgent',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0,
          ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
        }),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        errors.push(`${model}: HTTP ${res.status} ${body.slice(0, 200)}`)
        continue
      }
      const data: any = await res.json()
      const content = data?.choices?.[0]?.message?.content
      if (typeof content !== 'string' || content.trim() === '') {
        errors.push(`${model}: empty response`)
        continue
      }
      return { model, content }
    } catch (e: any) {
      errors.push(`${model}: ${e?.message ?? String(e)}`)
    }
  }
  throw new Error('All models failed:\n' + errors.join('\n'))
}
