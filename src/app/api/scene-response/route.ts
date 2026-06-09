import { NextRequest, NextResponse } from 'next/server'
import { createSceneResponse, getSceneResponseBudgetSnapshot, SceneResponseError } from '@/lib/sceneResponse'
import type { SceneResponseRequest } from '@/types'

export async function GET() {
  return NextResponse.json({ budget: getSceneResponseBudgetSnapshot() })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as SceneResponseRequest
    return NextResponse.json(await createSceneResponse(body))
  } catch (err: unknown) {
    if (err instanceof SceneResponseError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }

    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('/api/scene-response error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
