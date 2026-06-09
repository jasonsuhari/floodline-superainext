'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Map, { Source, Layer } from 'react-map-gl/mapbox'
import type { LayerProps, MapRef, MapMouseEvent } from 'react-map-gl/mapbox'
import type { ExpressionSpecification, Map as MapboxMap } from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { makeCircleGeoJSON } from '@/lib/geoUtils'

type Point = [string, number, number, string, number, number, number, number]

// Static layers (glow is animated in rAF loop, so initial values don't matter much)
const oohGlowLayer: LayerProps = {
  id: 'ooh-glow',
  type: 'circle',
  paint: {
    'circle-radius': 8,
    'circle-blur': 0.85,
    'circle-color': '#F0C020',
    'circle-opacity': 0.25,
  },
}

const oohDotLayer: LayerProps = {
  id: 'ooh-dot',
  type: 'circle',
  paint: {
    'circle-color': [
      'match', ['get', 'mt'],
      'bb', '#D02020', 'bs', '#1040C0', 'db', '#F0C020',
      'ds', '#D02020', 'mu', '#1040C0', 'sf', '#121212', 'tr', '#F0C020',
      '#D02020',
    ],
    'circle-radius': 3,
    'circle-stroke-width': 0.5,
    'circle-stroke-color': '#121212',
    'circle-opacity': 0.95,
  },
}

const focusFillLayer: LayerProps = {
  id: 'focus-fill',
  type: 'fill',
  paint: { 'fill-color': '#D02020', 'fill-opacity': 0.15 },
}

const focusLineLayer: LayerProps = {
  id: 'focus-line',
  type: 'line',
  paint: { 'line-color': '#D02020', 'line-width': 2.5, 'line-dasharray': [4, 2] },
}

interface Props {
  externalZoom?: number
  onSelect?: (lat: number, lng: number, countryName: string | null, countryIso: string | null, countryCount: number | null) => void
  focusPoint?: { lat: number; lng: number } | null
  selectedCountryIso?: string | null
  countryCounts?: Record<string, number>
  onReady?: () => void
}

export default function LandingMapPreview({
  externalZoom,
  onSelect,
  focusPoint,
  selectedCountryIso,
  countryCounts = {},
  onReady,
}: Props) {
  const [geojson, setGeojson] = useState<GeoJSON.FeatureCollection | null>(null)
  const [hoveredCode, setHoveredCode] = useState<string | null>(null)
  const [hoveredName, setHoveredName] = useState<string | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const mapRef = useRef<MapRef>(null)
  const hoverFrameRef = useRef<number | null>(null)
  const pendingHoverRef = useRef<MapMouseEvent | null>(null)
  const readyNotifiedRef = useRef(false)

  useEffect(() => {
    return () => {
      if (hoverFrameRef.current !== null) {
        window.cancelAnimationFrame(hoverFrameRef.current)
      }
    }
  }, [])

  // Load billboard points
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/map-preview', { signal: controller.signal })
      .then(r => r.json())
      .then((data: { points: Point[] }) => {
        setGeojson({
          type: 'FeatureCollection',
          features: data.points.map(p => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [p[1], p[2]] },
            properties: { mt: p[3] },
          })),
        })
      })
      .catch(() => {
        setGeojson({ type: 'FeatureCollection', features: [] })
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!mapLoaded || !geojson || readyNotifiedRef.current) return
    readyNotifiedRef.current = true
    onReady?.()
  }, [geojson, mapLoaded, onReady])

  // Sync external zoom from positioner
  useEffect(() => {
    if (externalZoom == null) return
    const map = mapRef.current?.getMap() as MapboxMap | undefined
    if (map) map.setZoom(externalZoom)
  }, [externalZoom])

  // Fly to focusPoint when it changes (from globe click or country search)
  useEffect(() => {
    if (!focusPoint || !mapLoaded) return
    mapRef.current?.getMap()?.flyTo({ center: [focusPoint.lng, focusPoint.lat], duration: 1200 })
  }, [focusPoint, mapLoaded])

  useEffect(() => {
    if (!mapLoaded) return
    const map = mapRef.current?.getMap() as MapboxMap | undefined
    if (!map) return

    const setLabelVisibility = () => {
      const layers = map.getStyle()?.layers ?? []
      for (const layer of layers) {
        if (layer.type !== 'symbol') continue
        try {
          map.setLayoutProperty(layer.id, 'visibility', selectedCountryIso ? 'none' : 'visible')
        } catch {}
      }
    }

    setLabelVisibility()
    map.on('styledata', setLabelVisibility)
    return () => {
      map.off('styledata', setLabelVisibility)
    }
  }, [mapLoaded, selectedCountryIso])

  const handleLoad = useCallback((e: { target: unknown }) => {
    const map = e.target as MapboxMap
    try { map.setProjection({ name: 'globe' }) } catch {}
    try { map.setFog(null) } catch {}

    const applyTransparency = () => {
      try {
        const layers = map.getStyle()?.layers ?? []
        if (layers.some((l: { id: string }) => l.id === 'background')) {
          map.setPaintProperty('background', 'background-opacity', 0)
        }
      } catch {}
    }
    if (map.isStyleLoaded()) applyTransparency()
    else map.once('style.load', applyTransparency)

    setMapLoaded(true)
  }, [])

  // Pulse the glow at a low rate; per-frame Mapbox paint writes are costly on load.
  useEffect(() => {
    if (!mapLoaded || !geojson) return
    const map = mapRef.current?.getMap() as MapboxMap | undefined
    if (!map) return

    let timeout: number | undefined
    let cancelled = false
    const animate = () => {
      if (cancelled) return
      const t = (Date.now() % 2400) / 2400 // 2.4s cycle
      const phase = Math.sin(t * Math.PI * 2)
      try {
        if (map.getLayer('ooh-glow')) {
          map.setPaintProperty('ooh-glow', 'circle-radius', 6 + phase * 4)
          map.setPaintProperty('ooh-glow', 'circle-opacity', 0.22 + phase * 0.1)
        }
      } catch {}
      timeout = window.setTimeout(animate, 100)
    }
    animate()
    return () => {
      cancelled = true
      if (timeout !== undefined) window.clearTimeout(timeout)
    }
  }, [mapLoaded, geojson])

  // Country hover via queryRenderedFeatures
  const handleMouseMove = useCallback((e: MapMouseEvent) => {
    pendingHoverRef.current = e
    if (hoverFrameRef.current !== null) return

    hoverFrameRef.current = window.requestAnimationFrame(() => {
      hoverFrameRef.current = null
      const event = pendingHoverRef.current
      const map = mapRef.current?.getMap() as MapboxMap | undefined
      if (!event || !map) return

      const features = map.queryRenderedFeatures([event.point.x, event.point.y], { layers: ['country-hover-fill'] })
      const props = features[0]?.properties ?? {}
      const nextCode = typeof props.iso_3166_1 === 'string' ? props.iso_3166_1 : null
      const nextName = typeof props.name_en === 'string' ? props.name_en : null

      setHoveredCode(current => current === nextCode ? current : nextCode)
      setHoveredName(current => current === nextName ? current : nextName)
    })
  }, [])

  const handleMouseLeave = useCallback(() => {
    pendingHoverRef.current = null
    if (hoverFrameRef.current !== null) {
      window.cancelAnimationFrame(hoverFrameRef.current)
      hoverFrameRef.current = null
    }
    setHoveredCode(null)
    setHoveredName(null)
  }, [])

  const handleClick = useCallback((e: MapMouseEvent) => {
    const count = hoveredCode ? (countryCounts[hoveredCode] ?? null) : null
    onSelect?.(e.lngLat.lat, e.lngLat.lng, hoveredName, hoveredCode, count)
  }, [onSelect, hoveredName, hoveredCode, countryCounts])

  const countryFillOpacity: ExpressionSpecification = [
    'case',
    ['==', ['get', 'iso_3166_1'], selectedCountryIso ?? ''],
    1,
    hoveredCode ? ['==', ['get', 'iso_3166_1'], hoveredCode] : false,
    0.35,
    0,
  ]

  const countryFillLayer: LayerProps = {
    id: 'country-hover-fill',
    type: 'fill',
    'source-layer': 'country_boundaries',
    paint: {
      'fill-color': '#D02020',
      'fill-opacity': countryFillOpacity,
    },
  }

  const focusGeoJSON = focusPoint ? makeCircleGeoJSON([focusPoint.lng, focusPoint.lat], 2) : null

  return (
    <Map
      ref={mapRef}
      mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
      initialViewState={{ longitude: -98, latitude: 38, zoom: externalZoom ?? 3 }}
      style={{ width: '100%', height: '100%' }}
      mapStyle="mapbox://styles/mapbox/light-v11"
      scrollZoom={false}
      doubleClickZoom={false}
      dragPan={false}
      dragRotate={false}
      pitchWithRotate={false}
      boxZoom={false}
      touchZoomRotate={false}
      keyboard={false}
      cursor={onSelect ? 'crosshair' : 'grab'}
      attributionControl={false}
      reuseMaps
      onLoad={handleLoad}
      onMouseMove={onSelect ? handleMouseMove : undefined}
      onMouseLeave={onSelect ? handleMouseLeave : undefined}
      onClick={onSelect ? handleClick : undefined}
    >
      {/* Country fill highlight */}
      <Source id="country-src" type="vector" url="mapbox://mapbox.country-boundaries-v1">
        <Layer {...countryFillLayer} />
      </Source>

      {/* OOH billboard pins: glow ring + sharp dot */}
      {geojson && (
        <Source type="geojson" data={geojson}>
          <Layer {...oohGlowLayer} />
          <Layer {...oohDotLayer} />
        </Source>
      )}

      {/* 2 km focus circle */}
      {focusGeoJSON && (
        <Source id="focus-area" type="geojson" data={focusGeoJSON}>
          <Layer {...focusFillLayer} />
          <Layer {...focusLineLayer} />
        </Source>
      )}
    </Map>
  )
}
