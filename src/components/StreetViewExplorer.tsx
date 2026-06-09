'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DeckGL from '@deck.gl/react'
import type { PickingInfo } from '@deck.gl/core'
import { Map } from 'react-map-gl/mapbox'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { makeSelectionLayer } from '@/layers/SelectionLayer'
import type { LatLng } from '@/types'

interface GoogleLatLng {
  lat(): number
  lng(): number
}

interface StreetViewResponse {
  data: {
    location?: {
      latLng?: GoogleLatLng
      pano?: string
    }
  }
}

interface StreetViewService {
  getPanorama(request: {
    location: LatLng
    radius: number
    preference: string
    sources: string[]
  }): Promise<StreetViewResponse>
}

interface StreetViewPanorama {
  setPano(pano: string): void
  setPov(pov: { heading: number; pitch: number }): void
  setZoom(zoom: number): void
}

interface StreetViewLibrary {
  StreetViewPanorama: new (element: HTMLElement, options: Record<string, unknown>) => StreetViewPanorama
  StreetViewPreference: { NEAREST: string }
  StreetViewSource: { OUTDOOR: string }
}

interface GoogleMapsNamespace {
  maps: {
    importLibrary(name: 'streetView'): Promise<StreetViewLibrary>
    StreetViewService: new () => StreetViewService
  }
}

declare global {
  interface Window {
    google?: GoogleMapsNamespace
    __initFaultlineGoogleMaps?: () => void
  }
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
const DEFAULT_POINT: LatLng = { lat: 1.3521, lng: 103.8198 }
const STREET_VIEW_RADIUS_M = 150

const INITIAL_VIEW_STATE = {
  longitude: DEFAULT_POINT.lng,
  latitude: DEFAULT_POINT.lat,
  zoom: 16.5,
  pitch: 0,
  bearing: 0,
}

const STANDARD_STYLE_CONFIG: Array<[string, unknown]> = [
  ['show3dObjects', true],
  ['show3dBuildings', true],
  ['show3dLandmarks', true],
  ['show3dTrees', true],
  ['show3dFacades', true],
  ['lightPreset', 'day'],
]

let googleMapsPromise: Promise<GoogleMapsNamespace> | null = null

function loadGoogleMaps(apiKey: string) {
  if (typeof window === 'undefined') return Promise.reject(new Error('Google Maps requires a browser.'))
  if (window.google?.maps) return Promise.resolve(window.google)
  if (googleMapsPromise) return googleMapsPromise

  googleMapsPromise = new Promise((resolve, reject) => {
    window.__initFaultlineGoogleMaps = () => {
      if (window.google?.maps) resolve(window.google)
      else reject(new Error('Google Maps loaded without the expected API.'))
    }

    const script = document.createElement('script')
    const params = new URLSearchParams({
      key: apiKey,
      v: 'weekly',
      loading: 'async',
      callback: '__initFaultlineGoogleMaps',
    })

    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`
    script.async = true
    script.onerror = () => reject(new Error('Google Maps failed to load.'))
    document.head.appendChild(script)
  })

  return googleMapsPromise
}

function getHeading(from: LatLng, to: LatLng) {
  const fromLat = from.lat * Math.PI / 180
  const toLat = to.lat * Math.PI / 180
  const deltaLng = (to.lng - from.lng) * Math.PI / 180
  const y = Math.sin(deltaLng) * Math.cos(toLat)
  const x = Math.cos(fromLat) * Math.sin(toLat) - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLng)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

export default function StreetViewExplorer() {
  const panoRef = useRef<HTMLDivElement | null>(null)
  const panoramaRef = useRef<StreetViewPanorama | null>(null)
  const streetViewServiceRef = useRef<StreetViewService | null>(null)
  const [selectedPoint, setSelectedPoint] = useState<LatLng>(DEFAULT_POINT)
  const [matchedPoint, setMatchedPoint] = useState<LatLng | null>(null)
  const [status, setStatus] = useState(
    GOOGLE_MAPS_API_KEY
      ? 'Loading Google Street View...'
      : 'Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable Street View.'
  )
  const [isGoogleReady, setIsGoogleReady] = useState(false)

  const layers = useMemo(
    () => [makeSelectionLayer(selectedPoint, STREET_VIEW_RADIUS_M / 1000)],
    [selectedPoint]
  )

  const handleMapLoad = useCallback((event: { target: mapboxgl.Map }) => {
    const map = event.target

    const setup = () => {
      for (const [property, value] of STANDARD_STYLE_CONFIG) {
        try {
          map.setConfigProperty('basemap', property, value)
        } catch {
          // Some Standard options vary by Mapbox GL/style version.
        }
      }
    }

    if (map.isStyleLoaded()) setup()
    else map.once('style.load', setup)
  }, [])

  const setStreetViewPosition = useCallback(async (point: LatLng) => {
    if (!GOOGLE_MAPS_API_KEY || !streetViewServiceRef.current || !panoramaRef.current || !window.google?.maps) return

    setStatus(`Searching within ${STREET_VIEW_RADIUS_M}m...`)

    try {
      const { StreetViewPreference, StreetViewSource } = await window.google.maps.importLibrary('streetView')
      const response = await streetViewServiceRef.current.getPanorama({
        location: point,
        radius: STREET_VIEW_RADIUS_M,
        preference: StreetViewPreference.NEAREST,
        sources: [StreetViewSource.OUTDOOR],
      })

      const location = response.data.location?.latLng
      const panoId = response.data.location?.pano

      if (!location || !panoId) {
        setMatchedPoint(null)
        setStatus('No nearby Street View panorama found.')
        return
      }

      const nextMatchedPoint = { lat: location.lat(), lng: location.lng() }
      setMatchedPoint(nextMatchedPoint)
      panoramaRef.current.setPano(panoId)
      panoramaRef.current.setPov({
        heading: getHeading(nextMatchedPoint, point),
        pitch: 0,
      })
      panoramaRef.current.setZoom(1)
      setStatus('Street View matched.')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      setMatchedPoint(null)
      setStatus(message === 'ZERO_RESULTS'
        ? 'No nearby Street View panorama found.'
        : 'Street View lookup failed.')
    }
  }, [])

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) {
      return
    }

    let cancelled = false

    loadGoogleMaps(GOOGLE_MAPS_API_KEY)
      .then(async google => {
        if (cancelled || !panoRef.current) return
        const { StreetViewPanorama } = await google.maps.importLibrary('streetView')
        streetViewServiceRef.current = new google.maps.StreetViewService()
        panoramaRef.current = new StreetViewPanorama(panoRef.current, {
          addressControl: false,
          fullscreenControl: false,
          linksControl: true,
          panControl: true,
          showRoadLabels: true,
          zoomControl: true,
          motionTracking: false,
          motionTrackingControl: false,
          visible: true,
        })
        setIsGoogleReady(true)
      })
      .catch(() => {
        if (!cancelled) setStatus('Google Maps failed to load.')
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isGoogleReady) return
    const timeout = window.setTimeout(() => {
      void setStreetViewPosition(selectedPoint)
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [isGoogleReady, selectedPoint, setStreetViewPosition])

  const handleMapClick = useCallback((info: PickingInfo) => {
    if (!info.coordinate) return

    const [lng, lat] = info.coordinate
    if (typeof lng !== 'number' || typeof lat !== 'number') return

    setSelectedPoint({ lat, lng })
  }, [])

  return (
    <main style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 38vw) 1fr', width: '100vw', height: '100vh', background: '#111318' }}>
      <section style={{ position: 'relative', borderRight: '1px solid rgba(255,255,255,0.12)' }}>
        {MAPBOX_TOKEN ? (
          <DeckGL
            initialViewState={INITIAL_VIEW_STATE}
            controller
            layers={layers}
            onClick={handleMapClick}
            style={{ position: 'absolute', inset: '0' }}
          >
            <Map
              mapboxAccessToken={MAPBOX_TOKEN}
              mapStyle="mapbox://styles/mapbox/standard"
              onLoad={handleMapLoad}
            />
          </DeckGL>
        ) : (
          <div style={{ padding: 24, color: '#fff', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
            Add NEXT_PUBLIC_MAPBOX_TOKEN to use the picker map.
          </div>
        )}

        <div style={{
          position: 'absolute',
          left: 18,
          right: 18,
          bottom: 18,
          zIndex: 10,
          padding: 14,
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.16)',
          background: 'rgba(15, 17, 23, 0.92)',
          color: '#fff',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}>
          <div style={{ fontSize: 12, color: 'rgba(210,220,238,0.7)', marginBottom: 8 }}>Click the map to choose a precise Street View point.</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
            <span>{selectedPoint.lat.toFixed(6)}</span>
            <span>{selectedPoint.lng.toFixed(6)}</span>
          </div>
          {matchedPoint && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(210,220,238,0.7)' }}>
              Matched pano: {matchedPoint.lat.toFixed(6)}, {matchedPoint.lng.toFixed(6)}
            </div>
          )}
        </div>
      </section>

      <section style={{ position: 'relative', minWidth: 0 }}>
        <div ref={panoRef} style={{ position: 'absolute', inset: 0 }} />
        <div style={{
          position: 'absolute',
          left: 18,
          top: 18,
          zIndex: 10,
          maxWidth: 340,
          padding: '10px 12px',
          borderRadius: 8,
          background: 'rgba(15, 17, 23, 0.86)',
          color: '#fff',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontSize: 13,
        }}>
          {status}
        </div>
      </section>
    </main>
  )
}
