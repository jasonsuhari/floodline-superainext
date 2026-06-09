const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const DEFAULT_TEXT_MODEL = 'gpt-5.5'

export interface OpenAITextBlock {
  type?: string
  text?: string
}

export interface OpenAIOutputItem {
  type?: string
  content?: OpenAITextBlock[]
}

export interface OpenAIResponseBody {
  id?: string
  model?: string
  output?: OpenAIOutputItem[]
  usage?: {
    input_tokens?: number
    output_tokens?: number
  }
}

export type OpenAIInputContent =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string; detail?: 'low' | 'high' | 'auto' }

export interface OpenAIMessage {
  role: 'user' | 'assistant' | 'system' | 'developer'
  content: string | OpenAIInputContent[]
}

export function getOpenAIApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY. Add it to .env.local or the server environment, then restart Next.js.')
  }
  return apiKey
}

export function getOpenAITextModel(envName = 'OPENAI_TEXT_MODEL'): string {
  return process.env[envName] || process.env.OPENAI_RESPONSES_MODEL || DEFAULT_TEXT_MODEL
}

export async function createOpenAIResponse(input: {
  instructions?: string
  messages: OpenAIMessage[]
  model?: string
  maxOutputTokens?: number
  temperature?: number
}): Promise<OpenAIResponseBody> {
  const body: Record<string, unknown> = {
    model: input.model ?? getOpenAITextModel(),
    instructions: input.instructions,
    input: input.messages.map(message => ({
      role: message.role,
      content: typeof message.content === 'string'
        ? [{ type: 'input_text', text: message.content }]
        : message.content,
    })),
  }

  if (input.maxOutputTokens !== undefined) body.max_output_tokens = input.maxOutputTokens
  if (input.temperature !== undefined) body.temperature = input.temperature

  const res = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${getOpenAIApiKey()}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenAI API error ${res.status}: ${text.slice(0, 280)}`)
  }

  return await res.json() as OpenAIResponseBody
}

export function getOpenAIOutputText(body: OpenAIResponseBody): string {
  return (body.output ?? [])
    .flatMap(item => item.content ?? [])
    .filter(block => block.type === 'output_text' && block.text)
    .map(block => block.text)
    .join('\n')
    .trim()
}
