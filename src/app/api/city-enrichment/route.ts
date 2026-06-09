import { NextRequest, NextResponse } from 'next/server'
import { getCityEnrichment } from '@/lib/cityEnrichment'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function numberOrDefault(value: unknown, fallback: number) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      lat?: number
      lng?: number
      radiusKm?: number
      mode?: string
    }
    const lat = numberOrDefault(body.lat, Number.NaN)
    const lng = numberOrDefault(body.lng, Number.NaN)

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: 'lat and lng are required numbers' }, { status: 400 })
    }

    const enrichment = await getCityEnrichment({
      center: { lat, lng },
      radiusKm: body.radiusKm,
      mode: body.mode,
    })

    return NextResponse.json(enrichment, {
      headers: {
        'Cache-Control': 'public, max-age=120, stale-while-revalidate=600',
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('/api/city-enrichment error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
