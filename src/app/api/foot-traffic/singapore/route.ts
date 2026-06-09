import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import type { TrafficPoint } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type CompactLtaPoint = [
  id: string,
  lng: number,
  lat: number,
  weight: number,
  totalVolume: number,
  peakHour: number,
  description: string,
  roadName: string,
]

interface LtaPointPayload {
  metadata: {
    built_at: string
    source: string
    schema: string
    year_month: string | null
    bus_stop_count: number
    matched_stop_count: number
    activity_record_count: number
  }
  points: CompactLtaPoint[]
}

interface CachedPayload {
  loadedAt: number
  payload: LtaPointPayload
}

const POINTS_PATH = path.join(process.cwd(), 'data', 'foot-traffic', 'singapore', 'lta_bus_stop_activity_points.json')
const DEFAULT_LIMIT = 1500
const MAX_LIMIT = 6000

let cachedPayload: CachedPayload | null = null

async function loadPayload() {
  if (cachedPayload) return cachedPayload.payload

  const raw = await readFile(POINTS_PATH, 'utf8')
  const payload = JSON.parse(raw) as LtaPointPayload
  cachedPayload = {
    loadedAt: Date.now(),
    payload,
  }
  return payload
}

function parseBbox(value: string | null) {
  if (!value) return null

  const parts = value.split(',').map(part => Number.parseFloat(part.trim()))
  if (parts.length !== 4 || parts.some(part => !Number.isFinite(part))) {
    throw new Error('bbox must be west,south,east,north')
  }

  const [west, south, east, north] = parts
  if (west >= east || south >= north) {
    throw new Error('bbox must be ordered as west,south,east,north')
  }

  return { west, south, east, north }
}

function parseLimit(value: string | null) {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_LIMIT
  return Math.min(parsed, MAX_LIMIT)
}

function pointInBbox(point: CompactLtaPoint, bbox: NonNullable<ReturnType<typeof parseBbox>>) {
  const lng = point[1]
  const lat = point[2]
  return lng >= bbox.west && lng <= bbox.east && lat >= bbox.south && lat <= bbox.north
}

export async function GET(req: NextRequest) {
  try {
    const payload = await loadPayload()
    const { searchParams } = req.nextUrl
    const bbox = parseBbox(searchParams.get('bbox'))
    const limit = parseLimit(searchParams.get('limit'))

    const points: Array<TrafficPoint & {
      dataSource: 'lta-pv-bus'
      totalVolume: number
      peakHour: number
      name: string
      roadName: string
    }> = []

    for (const point of payload.points) {
      if (bbox && !pointInBbox(point, bbox)) continue

      points.push({
        id: point[0],
        position: { lng: point[1], lat: point[2] },
        weight: point[3],
        category: 'transit-hub',
        source: 'lta',
        confidence: 0.9,
        label: 'Observed LTA bus passenger volume',
        dataSource: 'lta-pv-bus',
        totalVolume: point[4],
        peakHour: point[5],
        name: point[6],
        roadName: point[7],
      })

      if (points.length >= limit) break
    }

    return NextResponse.json(
      {
        metadata: {
          ...payload.metadata,
          returned_points: points.length,
          total_points: payload.points.length,
          bbox,
          limited: points.length >= limit,
        },
        points,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
        },
      },
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
