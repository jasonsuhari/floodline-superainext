import { NextRequest, NextResponse } from 'next/server'
import { createOpenAIResponse, getOpenAIOutputText, getOpenAITextModel } from '@/lib/openaiResponses'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function POST(req: NextRequest) {
  const { agentName, billboardName, messages }: {
    agentName: string
    billboardName: string
    messages: ChatMessage[]
  } = await req.json()

  const system = `You are ${agentName}, a pedestrian who just walked past an outdoor advertisement. Respond as this real person would: casual, a little distracted. You have genuine opinions about the ads you see in the city. Most of the time you barely noticed it or it didn't really stick. Keep every reply to 1-2 short sentences. Don't mention specific street names, intersections, or billboard locations. Don't mention your own name. Don't be sycophantic. The billboard label for internal context is "${billboardName}", but do not mention it.`

  try {
    const json = await createOpenAIResponse({
      model: getOpenAITextModel('OPENAI_PEDESTRIAN_CHAT_MODEL'),
      maxOutputTokens: 128,
      instructions: system,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    })

    return NextResponse.json({ reply: getOpenAIOutputText(json) })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
