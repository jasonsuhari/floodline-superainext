import { NextRequest, NextResponse } from 'next/server'
import { fetchVegetation } from '@/lib/overpass'

export async function POST(req: NextRequest) {
  try {
    const { lat, lng, radiusKm } = await req.json() as {
      lat: number
      lng: number
      radiusKm: number
    }

    const vegetation = await fetchVegetation({ lat, lng }, radiusKm)

    return NextResponse.json({ vegetation })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('/api/vegetation error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
