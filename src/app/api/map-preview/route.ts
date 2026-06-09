import { NextRequest, NextResponse } from 'next/server'

let cached: { points: unknown[]; mediaTypeCodes: Record<string, string> } | null = null

export async function GET(req: NextRequest) {
  if (!cached) {
    const url = new URL('/api/ooh-map?limit=25000', req.url)
    const res = await fetch(url)
    const raw = await res.json() as {
      points?: unknown[]
      metadata?: { media_type_codes?: Record<string, string> }
    }

    cached = {
      points: raw.points ?? [],
      mediaTypeCodes: raw.metadata?.media_type_codes ?? {},
    }
  }

  return NextResponse.json(cached)
}
