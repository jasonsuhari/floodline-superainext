import { NextRequest, NextResponse } from 'next/server'
import { fetchBuildings } from '@/lib/overpass'

export async function POST(req: NextRequest) {
  try {
    const { lat, lng, radiusKm } = await req.json() as {
      lat: number
      lng: number
      radiusKm: number
    }

    const buildings = await fetchBuildings({ lat, lng }, radiusKm)

    return NextResponse.json({ buildings })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('/api/simulate error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
