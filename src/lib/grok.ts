// Thin client for the Grok (xAI) chat completions API.
// Master brief Part 6 (menu import) and Part 13 (command parsing) both go through here.
// Uses the OpenAI-compatible endpoint at https://api.x.ai/v1/chat/completions.

const GROK_ENDPOINT = 'https://api.x.ai/v1/chat/completions'

export interface GrokMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface GrokOptions {
  model?: string
  temperature?: number
  maxTokens?: number
  responseFormat?: 'json_object' | 'text'
  signal?: AbortSignal
}

export class GrokError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.status = status
    this.name = 'GrokError'
  }
}

export async function grokChat(messages: GrokMessage[], opts: GrokOptions = {}): Promise<string> {
  const apiKey = process.env.GROK_API_KEY
  if (!apiKey) throw new GrokError('GROK_API_KEY is not set')

  const body: Record<string, unknown> = {
    model: opts.model || 'grok-2-latest',
    messages,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens ?? 2048,
  }
  if (opts.responseFormat === 'json_object') {
    body.response_format = { type: 'json_object' }
  }

  const res = await fetch(GROK_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new GrokError(`Grok ${res.status}: ${text.slice(0, 200)}`, res.status)
  }

  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new GrokError('Grok returned no content')
  return content
}

export async function grokJson<T = unknown>(messages: GrokMessage[], opts: GrokOptions = {}): Promise<T> {
  const raw = await grokChat(messages, { ...opts, responseFormat: 'json_object' })
  // Some models wrap JSON in code fences; strip them defensively.
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()
  try {
    return JSON.parse(cleaned) as T
  } catch (e) {
    throw new GrokError(`Could not parse JSON from Grok: ${(e as Error).message}`)
  }
}
