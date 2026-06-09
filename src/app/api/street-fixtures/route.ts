import { NextRequest, NextResponse } from 'next/server'
import { fetchStreetFixtures } from '@/lib/overpass'

export async function POST(req: NextRequest) {
  try {
    const { lat, lng, radiusKm } = await req.json() as {
      lat: number
      lng: number
      radiusKm: number
    }

    const fixtures = await fetchStreetFixtures({ lat, lng }, radiusKm)

    return NextResponse.json({ fixtures })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('/api/street-fixtures error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
