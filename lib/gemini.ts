export interface GeminiMessage {
  role: 'user' | 'model'
}

export interface GeminiContent {
  role: 'user' | 'model'
  parts: { text: string }[]
}

export function getGeminiApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY. Add it to .env.local or the server environment.')
  }
  return apiKey
}

export async function createGeminiResponse(input: {
  instructions?: string
  messages: { role: 'user' | 'model'; content: string }[]
  model?: string
  maxOutputTokens?: number
  temperature?: number
}): Promise<string> {
  const apiKey = getGeminiApiKey()
  const model = input.model || 'gemini-2.0-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const body = {
    // REST API uses snake_case: system_instruction
    system_instruction: input.instructions ? {
      parts: [{ text: input.instructions }]
    } : undefined,
    contents: input.messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    })),
    generationConfig: {
      maxOutputTokens: input.maxOutputTokens,
      temperature: input.temperature,
    }
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Gemini API error ${res.status}: ${text.slice(0, 500)}`)
  }

  const json = await res.json()

  try {
    return json.candidates[0].content.parts[0].text
  } catch (e) {
    throw new Error(`Failed to parse Gemini response: ${JSON.stringify(json).slice(0, 500)}`)
  }
}
