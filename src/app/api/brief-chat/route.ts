import { NextRequest, NextResponse } from 'next/server'
import { createOpenAIResponse, getOpenAIOutputText, getOpenAITextModel } from '@/lib/openaiResponses'
import type { CompanyBrief } from '@/types'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function POST(req: NextRequest) {
  const { messages, currentBrief }: { messages: ChatMessage[]; currentBrief: CompanyBrief } =
    await req.json()

  const system = `You are a creative brief editor for Faultline, an OOH (out-of-home) advertising platform. Help users refine their advertising campaign brief before it goes to image generation.

Always respond with valid JSON only, no prose outside the JSON object:
{
  "message": "1-2 sentence friendly response explaining what you changed",
  "brief": { ...complete updated CompanyBrief... }
}

Current brief:
${JSON.stringify(currentBrief, null, 2)}

Rules:
- Only modify what the user asks about. Keep everything else exactly the same.
- brandAdjectives must always be exactly 3 strings.
- Be concrete: if they say "more playful", actually change tone/adjectives/coreMessage to reflect that.
- Keep responses short and confident.`

  try {
    const json = await createOpenAIResponse({
      model: getOpenAITextModel('OPENAI_BRIEF_CHAT_MODEL'),
      maxOutputTokens: 1024,
      instructions: system,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    })

    const text = getOpenAIOutputText(json)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'No JSON in response', raw: text }, { status: 500 })
    }

    const parsed = JSON.parse(jsonMatch[0])
    return NextResponse.json({ message: parsed.message, brief: parsed.brief })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
