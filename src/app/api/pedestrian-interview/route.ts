import { NextRequest, NextResponse } from 'next/server'
import {
  getOrCreatePedestrianInterviewAgent,
  startPedestrianInterviewSession,
  listSessionEvents,
  parsePedestrianInterviewResponse,
  ManagedAgentsConfigError,
} from '@/lib/openaiManagedAgents'
import type { BillboardPlacement } from '@/types'

export async function POST(req: NextRequest) {
  const { agentName, billboardName, billboard }: {
    agentName: string
    billboardName: string
    billboard?: BillboardPlacement | null
  } = await req.json()

  const environmentId = process.env.OPENAI_MANAGED_ENVIRONMENT_ID || 'openai-responses'

  try {
    const agentId = await getOrCreatePedestrianInterviewAgent()
    const sessionId = await startPedestrianInterviewSession({ agentName, billboardName, billboard, environmentId, agentId })
    return NextResponse.json({ sessionId })
  } catch (err) {
    if (err instanceof ManagedAgentsConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 })
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId')
  if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })

  try {
    const events = await listSessionEvents(sessionId)
    const result = parsePedestrianInterviewResponse(events)
    return NextResponse.json({ sessionId, ...result })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), status: 'error' },
      { status: 500 },
    )
  }
}
