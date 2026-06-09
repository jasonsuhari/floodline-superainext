'use client'

import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

const MapCanvas = dynamic(() => import('@/components/MapCanvas'), { ssr: false })

const DEFAULT_MAP_FOCUS: MapFocus = {
  lat: 1.35,
  lng: 103.82,
  countryIso: 'SG',
}

type MapFocus = {
  lat: number
  lng: number
  countryIso: string | null
}

function isValidCoordinate(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng)
}

function MapPageInner() {
  const params = useSearchParams()

  const rawQueryLat = params.get('lat')
  const rawQueryLng = params.get('lng')
  const queryLat = rawQueryLat === null ? null : Number(rawQueryLat)
  const queryLng = rawQueryLng === null ? null : Number(rawQueryLng)
  const queryFocus = queryLat !== null && queryLng !== null && isValidCoordinate(queryLat, queryLng)
    ? { lat: queryLat, lng: queryLng, countryIso: params.get('country') ?? null }
    : null
  const mapFocus = queryFocus ?? DEFAULT_MAP_FOCUS
  const focusArea = mapFocus ? { lat: mapFocus.lat, lng: mapFocus.lng } : null
  const countryIso = mapFocus?.countryIso ?? null

  return <MapCanvas focusArea={focusArea} countryIso={countryIso} />
}

export default function MapPage() {
  return (
    <Suspense fallback={null}>
      <MapPageInner />
    </Suspense>
  )
}
