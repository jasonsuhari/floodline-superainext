import { NextRequest, NextResponse } from 'next/server'
import { fetchTrafficDensity } from '@/lib/overpass'

export async function POST(req: NextRequest) {
  try {
    const { lat, lng, radiusKm } = await req.json() as {
      lat: number
      lng: number
      radiusKm: number
    }

    const points = await fetchTrafficDensity({ lat, lng }, radiusKm)

    return NextResponse.json({ points, debug: { count: points.length, lat, lng, radiusKm } })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('/api/traffic-density error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
