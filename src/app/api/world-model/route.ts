import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { depthToPrompt } from '@/lib/worldModel'

export const runtime = 'nodejs'
export const maxDuration = 180

interface RequestBody {
  imageUrl: string
  depthM: number
  hasIntervention: boolean
}

// --- Cosmos local/hosted server ---
async function generateViaCosmos(cosmosUrl: string, imageUrl: string, prompt: string): Promise<string> {
  const res = await fetch(`${cosmosUrl}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: imageUrl, prompt, num_frames: 81 }),
    signal: AbortSignal.timeout(160_000),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Cosmos server error ${res.status}: ${text.slice(0, 200)}`)
  }
  const buffer = Buffer.from(await res.arrayBuffer())
  const filename = `world_${Date.now()}.mp4`
  const outDir = path.join(process.cwd(), 'public', 'generated')
  await mkdir(outDir, { recursive: true })
  await writeFile(path.join(outDir, filename), buffer)
  return `/generated/${filename}`
}

// --- Fal.ai fallback (Wan2.1) ---
async function generateViaFal(falKey: string, imageUrl: string, prompt: string): Promise<string> {
  fal.config({ credentials: falKey })
  const result = await fal.subscribe('fal-ai/wan-i2v', {
    input: {
      image_url: imageUrl,
      prompt,
      resolution: '480p' as const,
      num_frames: 81,
      frames_per_second: 16,
      acceleration: 'regular' as const,
    },
    logs: false,
  }) as { data: { video: { url: string } } }
  return result.data.video.url
}

export async function POST(req: NextRequest) {
  let body: RequestBody
  try {
    body = await req.json() as RequestBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { imageUrl, depthM, hasIntervention } = body
  if (!imageUrl || typeof depthM !== 'number') {
    return NextResponse.json({ error: 'imageUrl and depthM are required' }, { status: 400 })
  }

  const prompt = depthToPrompt(depthM, hasIntervention ?? false)
  const cosmosUrl = process.env.COSMOS_SERVER_URL?.replace(/\/$/, '')
  const falKey = process.env.FAL_KEY

  // Cosmos server takes priority when configured
  if (cosmosUrl) {
    try {
      const videoUrl = await generateViaCosmos(cosmosUrl, imageUrl, prompt)
      return NextResponse.json({ videoUrl, prompt, provider: 'cosmos' })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn('[world-model] Cosmos failed, trying Fal.ai fallback:', message)
      if (!falKey) return NextResponse.json({ error: `Cosmos failed and no FAL_KEY fallback: ${message}` }, { status: 502 })
    }
  }

  if (!falKey) {
    return NextResponse.json({ error: 'Set COSMOS_SERVER_URL or FAL_KEY in .env.local' }, { status: 503 })
  }

  try {
    const videoUrl = await generateViaFal(falKey, imageUrl, prompt)
    return NextResponse.json({ videoUrl, prompt, provider: 'fal' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[world-model] Fal.ai error:', message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
