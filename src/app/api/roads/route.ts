import { NextRequest, NextResponse } from 'next/server'
import { fetchRoads } from '@/lib/overpass'

export async function POST(req: NextRequest) {
  try {
    const { lat, lng, radiusKm } = await req.json() as { lat: number; lng: number; radiusKm: number }
    const roads = await fetchRoads({ lat, lng }, radiusKm)
    return NextResponse.json({ roads })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('/api/roads error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
