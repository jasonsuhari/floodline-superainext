'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import DeckGL from '@deck.gl/react'
import type { DeckGLRef } from '@deck.gl/react'
import type { PickingInfo } from '@deck.gl/core'
import { ColumnLayer, PathLayer, ScatterplotLayer, SolidPolygonLayer, TextLayer } from '@deck.gl/layers'
import { Map as MapboxMap } from 'react-map-gl/mapbox'
import type { MapRef } from 'react-map-gl/mapbox'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import AgencyDemoPanel from '@/components/AgencyDemoPanel'
import BillboardListingPanel from '@/components/BillboardListingPanel'
import AreaConfirmDialog from '@/components/AreaConfirmDialog'
import BillboardStudioPanel from '@/components/BillboardStudioPanel'
import DashboardOverlay from '@/components/DashboardOverlay'
import FloodPlannerPanel from '@/components/FloodPlannerPanel'
import FloodActionBar from '@/components/FloodActionBar'
import MapLoadingScreen from '@/components/MapLoadingScreen'
import MapToolbar, { type MapTool } from '@/components/MapToolbar'
import PhotorealTestPanel from '@/components/PhotorealTestPanel'
import StreetViewPanel from '@/components/StreetViewPanel'
import StreetViewCursor from '@/components/StreetViewCursor'
import { makeBillboardLayers } from '@/layers/BillboardLayer'
import { makeBuildingLayers } from '@/layers/BuildingLayer'
import { makeSingaporeOohLayers, SG_OOH_TYPE_LABELS } from '@/layers/SingaporeOohLayer'
import CrowdLayer from '@/components/CrowdLayer'
import RainOverlay from '@/components/RainOverlay'
import { makeLassoSelectionLayer, makeLassoSelectionMaskLayer, makeLassoHandlesLayer } from '@/layers/SelectionLayer'
import { makeStreetFixtureLayers } from '@/layers/StreetFixtureLayer'
import { makeTrafficFlowLayers } from '@/layers/TrafficFlowLayer'
import { makeFloodScenarioLayers } from '@/layers/FloodScenarioLayer'
import { makeSimulationSuggestionLayers } from '@/layers/SimulationSuggestionLayer'
import MetricsDock from '@/components/MetricsDock'
import FloodMetricsBar from '@/components/FloodMetricsBar'
import { makeCircleCoords, haversineKm, isPointInPolygon, getPolygonCentroid } from '@/lib/geoUtils'
import { createBehavior, tickAgents } from '@/lib/agentBehaviors'
import { spawnAgentsOnRoads } from '@/lib/spawnAgents'
import { getAgentModel, pickAgentName, pickRandomPedestrianKind } from '@/lib/agentIdentity'
import { buildFloodScenario, createPlannerIntervention, spawnFloodInterventions } from '@/lib/floodSimulation'
import { FLOOD_REPORTS, FLOOD_REPORT_COUNTS } from '@/lib/floodHotspots'
import { computeSimulationSuggestions } from '@/lib/simulationSuggestions'
import type { SimulationSuggestion } from '@/lib/simulationSuggestions'
import type {
  AgentBehavior,
  AgentKind,
  AgentCapture,
  Building,
  BillboardPlacement,
  CapturedSceneImage,
  CityEnrichmentResponse,
  CityWeatherContext,
  FloodDepthCell,
  FloodInterventionKind,
  FloodReport,
  FloodScenarioResult,
  LatLng,
  OohMapApiResponse,
  OohMapPoint,
  OohMapPointTuple,
  PedestrianAgent,
  PedestrianInterviewSession,
  PhotorealSceneApiResponse,
  SceneResponseApiResponse,
  RoadKind,
  RoadSegment,
  SingaporeOohAsset,
  StreetFixture,
  TrafficPoint,
  WaterBody,
  PlannerIntervention,
} from '@/types'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
const OOH_POINT_LIMIT = 6000
const ENRICHMENT_RADIUS_KM = 1.5

const INITIAL_VIEW_STATE = {
  longitude: 103.851,
  latitude: 1.303,
  zoom: 11.65,
  pitch: 58,
  bearing: -20,
}
const MAP_MAX_ZOOM = 24
const PEDESTRIAN_ICON_MIN_ZOOM = 12.8
const PEDESTRIAN_MODEL_MIN_ZOOM = 15.6
const ENABLE_PHOTOREAL_RENDER = false
let streetViewStaticApiAvailable = true

const FALLBACK_AREA = {
  lat: INITIAL_VIEW_STATE.latitude,
  lng: INITIAL_VIEW_STATE.longitude,
}

const INITIAL_BILLBOARDS: BillboardPlacement[] = [
]

// --- Billboard sighting detection ---

const SIGHTING_LAT_SCALE = 110540
const SIGHTING_LNG_SCALE = 111320
const SIGHTING_COOLDOWN_MS = 25000  // ms before same agent-billboard pair can trigger again
const SIGHTING_DISPLAY_MS = 4500    // ms toast stays visible
const CAPTURE_FOV_DEG = 80

const DUPLICATE_THOUGHT_REPLACEMENTS = [
  "I caught it in passing, but nothing about it made me slow down.",
  "The visual registered first, then the message kind of slipped away.",
  "I noticed the ad, but I was already thinking about where I was going.",
  "It was readable enough, just not memorable enough for me.",
  "I understood the general idea, but not why it mattered right then.",
  "The design stood out more than the actual offer.",
  "I glanced at it, got the vibe, and kept moving.",
  "It needed one clearer hook for someone walking at my pace.",
]

interface BillboardSighting {
  id: string
  agentId: string
  agentName: string
  billboardName: string
  agentPosition: LatLng
  billboardPosition: LatLng
  timestamp: number
}

function metersBetween(from: LatLng, to: LatLng): number {
  const lngScale = SIGHTING_LNG_SCALE * Math.cos(from.lat * Math.PI / 180)
  const dx = (to.lng - from.lng) * lngScale
  const dy = (to.lat - from.lat) * SIGHTING_LAT_SCALE
  return Math.sqrt(dx * dx + dy * dy)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normaliseThoughtText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function uniqueThoughtForState(thought: string, captures: AgentCapture[], captureId: string): string {
  const used = new Set(
    captures
      .filter(capture => capture.id !== captureId && capture.thought)
      .map(capture => normaliseThoughtText(capture.thought as string))
  )
  if (!used.has(normaliseThoughtText(thought))) return thought
  for (const replacement of DUPLICATE_THOUGHT_REPLACEMENTS) {
    if (!used.has(normaliseThoughtText(replacement))) return replacement
  }
  return `${thought} (${captures.length + 1})`
}

// SVG path data for each demographic icon (20×26 viewBox, filled #121212 on colored bg)
const DEMOGRAPHIC_DEFS = [
  {
    label: 'Commuter',
    color: '#F0C020',
    // circle head + upright rectangle body
    icon: <>
      <circle cx="10" cy="5" r="4" />
      <rect x="7" y="11" width="6" height="11" />
      <rect x="5" y="15" width="4" height="8" transform="rotate(-15 5 15)" />
      <rect x="11" y="15" width="4" height="8" transform="rotate(15 15 15)" />
    </>,
  },
  {
    label: 'Professional',
    color: '#4991FF',
    // circle head + body + small briefcase bottom
    icon: <>
      <circle cx="10" cy="5" r="4" />
      <rect x="7" y="11" width="6" height="9" />
      <rect x="5" y="15" width="4" height="7" transform="rotate(-12 5 15)" />
      <rect x="11" y="15" width="4" height="7" transform="rotate(12 15 15)" />
      <rect x="6" y="21" width="8" height="5" rx="1" />
      <rect x="8" y="20" width="4" height="2" />
    </>,
  },
  {
    label: 'Student',
    color: '#56B4E9',
    // circle head + body + backpack rectangle behind
    icon: <>
      <circle cx="9" cy="5" r="4" />
      <rect x="6" y="11" width="6" height="10" />
      <rect x="4" y="14" width="4" height="7" transform="rotate(-12 4 14)" />
      <rect x="10" y="14" width="4" height="7" transform="rotate(12 14 14)" />
      <rect x="13" y="9" width="5" height="9" rx="1" />
    </>,
  },
  {
    label: 'Senior',
    color: '#D02020',
    // slightly shorter head, hunched body, cane line
    icon: <>
      <circle cx="10" cy="5" r="3.5" />
      <rect x="7.5" y="10" width="5" height="9" transform="rotate(5 10 14)" />
      <rect x="5" y="14" width="4" height="6" transform="rotate(-20 5 14)" />
      <rect x="11" y="14" width="4" height="6" transform="rotate(8 15 14)" />
      <line x1="15" y1="14" x2="18" y2="25" strokeWidth="2" stroke="#121212" />
    </>,
  },
  {
    label: 'Tourist',
    color: '#009E73',
    // circle head + body + camera rect on chest
    icon: <>
      <circle cx="10" cy="5" r="4" />
      <rect x="7" y="11" width="6" height="10" />
      <rect x="5" y="15" width="4" height="7" transform="rotate(-12 5 15)" />
      <rect x="11" y="15" width="4" height="7" transform="rotate(12 15 15)" />
      <rect x="6.5" y="12" width="7" height="5" rx="1" />
      <circle cx="10" cy="14.5" r="1.5" fill="#F0F0F0" />
    </>,
  },
]

function detectBillboardSightings(
  agents: PedestrianAgent[],
  billboards: BillboardPlacement[],
  oohPoints: OohMapPoint[],
  activeCooldowns: Set<string>,
): Array<{ agentId: string; agentName: string; billboardId: string; billboardName: string }> {
  const results: Array<{ agentId: string; agentName: string; billboardId: string; billboardName: string }> = []

  for (const agent of agents) {
    const lngScale = SIGHTING_LNG_SCALE * Math.cos(agent.position.lat * Math.PI / 180)

    for (const billboard of billboards) {
      const pairKey = `${agent.id}:${billboard.id}`
      if (activeCooldowns.has(pairKey)) continue

      const dx = (billboard.position.lng - agent.position.lng) * lngScale
      const dy = (billboard.position.lat - agent.position.lat) * SIGHTING_LAT_SCALE
      const distM = Math.sqrt(dx * dx + dy * dy)

      const maxRangeM = Math.min(Math.max(billboard.widthM * 5, 50), 90)
      if (distM > maxRangeM) continue

      const bearingToBoard = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360

      let agentAngleDiff = Math.abs(bearingToBoard - agent.heading)
      if (agentAngleDiff > 180) agentAngleDiff = 360 - agentAngleDiff
      if (agentAngleDiff > 60) continue

      const bearingFromBoard = (bearingToBoard + 180) % 360
      let boardAngleDiff = Math.abs(bearingFromBoard - billboard.heading)
      if (boardAngleDiff > 180) boardAngleDiff = 360 - boardAngleDiff
      if (boardAngleDiff > 90) continue

      results.push({ agentId: agent.id, agentName: agent.name, billboardId: billboard.id, billboardName: billboard.name })
    }

    // OOH inventory points — no facing direction known, so only apply agent FOV + distance checks
    for (const pt of oohPoints) {
      const pairKey = `${agent.id}:${pt.id}`
      if (activeCooldowns.has(pairKey)) continue

      const dx = (pt.position.lng - agent.position.lng) * lngScale
      const dy = (pt.position.lat - agent.position.lat) * SIGHTING_LAT_SCALE
      const distM = Math.sqrt(dx * dx + dy * dy)

      if (distM > 60) continue

      const bearingToBoard = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360
      let agentAngleDiff = Math.abs(bearingToBoard - agent.heading)
      if (agentAngleDiff > 180) agentAngleDiff = 360 - agentAngleDiff
      if (agentAngleDiff > 60) continue

      results.push({ agentId: agent.id, agentName: agent.name, billboardId: pt.id, billboardName: pt.mediaTypeLabel })
    }
  }

  return results
}

function bearingBetween(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
  const dLng = (to.lng - from.lng) * (Math.PI / 180)
  const lat1 = from.lat * (Math.PI / 180)
  const lat2 = to.lat * (Math.PI / 180)
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360
}

function normalizeHeading(degrees: number): number {
  return (degrees + 360) % 360
}

function offsetLngLatMeters(position: LatLng, eastM: number, northM: number): [number, number] {
  const lngScale = SIGHTING_LNG_SCALE * Math.cos(position.lat * Math.PI / 180)
  return [
    position.lng + eastM / lngScale,
    position.lat + northM / SIGHTING_LAT_SCALE,
  ]
}

function offsetAgentPosition(agent: PedestrianAgent, rightM: number, forwardM: number, baseZ = 0): [number, number, number] {
  const headingRad = agent.heading * Math.PI / 180
  const rightRad = (agent.heading + 90) * Math.PI / 180
  const east = Math.sin(rightRad) * rightM + Math.sin(headingRad) * forwardM
  const north = Math.cos(rightRad) * rightM + Math.cos(headingRad) * forwardM
  const [lng, lat] = offsetLngLatMeters(agent.position, east, north)
  return [lng, lat, baseZ]
}

function captureHeadingOffset(seed: string): number {
  const offsets = [-24, -16, -9, 8, 15, 23]
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0
  }
  return offsets[Math.abs(hash) % offsets.length]
}

function pedestrianStreetViewCaptureUrl(
  pedestrianPosition: LatLng,
  billboardPosition: LatLng | undefined,
  fallbackHeading: number,
  headingOffsetDeg = 0,
): string {
  const baseHeading = billboardPosition
    ? Math.round(bearingBetween(pedestrianPosition, billboardPosition))
    : Math.round(fallbackHeading)
  const heading = normalizeHeading(baseHeading + headingOffsetDeg)

  if (GOOGLE_MAPS_KEY) {
    const params = new URLSearchParams({
      size: '400x312',
      location: `${pedestrianPosition.lat.toFixed(6)},${pedestrianPosition.lng.toFixed(6)}`,
      heading: String(heading),
      fov: '80',
      pitch: '0',
      // Wider radius to find a real pano even when the agent is mid-block or on
      // a synthetic road segment. Default `source` (not `outdoor`) so indoor or
      // mixed panos still count rather than 404ing.
      radius: '500',
      return_error_code: 'true',
      key: GOOGLE_MAPS_KEY,
    })
    return `https://maps.googleapis.com/maps/api/streetview?${params.toString()}`
  }

  if (!MAPBOX_TOKEN) return ''

  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${pedestrianPosition.lng.toFixed(6)},${pedestrianPosition.lat.toFixed(6)},18,${heading},60/400x312@2x?access_token=${MAPBOX_TOKEN}`
}

function pedestrianStreetViewEmbedUrl(
  pedestrianPosition: LatLng,
  billboardPosition: LatLng | undefined,
  fallbackHeading: number,
  headingOffsetDeg = 0,
): string | undefined {
  if (!GOOGLE_MAPS_KEY) return undefined
  const baseHeading = billboardPosition
    ? Math.round(bearingBetween(pedestrianPosition, billboardPosition))
    : Math.round(fallbackHeading)
  const heading = normalizeHeading(baseHeading + headingOffsetDeg)
  const params = new URLSearchParams({
    key: GOOGLE_MAPS_KEY,
    location: `${pedestrianPosition.lat.toFixed(6)},${pedestrianPosition.lng.toFixed(6)}`,
    heading: String(heading),
    pitch: '0',
    fov: String(CAPTURE_FOV_DEG),
  })
  return `https://www.google.com/maps/embed/v1/streetview?${params.toString()}`
}

/**
 * Resolve the actual pano coordinates near a given position using the Street
 * View metadata endpoint, then build a static-image URL anchored on that pano.
 * Returns null if there is no panorama within the search radius.
 */
async function resolveStreetViewCaptureUrl(
  pedestrianPosition: LatLng,
  billboardPosition: LatLng | undefined,
  fallbackHeading: number,
  headingOffsetDeg = 0,
): Promise<string | null> {
  if (!GOOGLE_MAPS_KEY || !streetViewStaticApiAvailable) return null

  const metaParams = new URLSearchParams({
    location: `${pedestrianPosition.lat.toFixed(6)},${pedestrianPosition.lng.toFixed(6)}`,
    radius: '500',
    key: GOOGLE_MAPS_KEY,
  })
  const metaUrl = `https://maps.googleapis.com/maps/api/streetview/metadata?${metaParams.toString()}`

  try {
    const res = await fetch(metaUrl)
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.warn('[street-view] metadata HTTP', res.status, body.slice(0, 240))
      return null
    }
    const meta = await res.json() as { status?: string; location?: { lat: number; lng: number }; error_message?: string }
    if (meta.status !== 'OK' || !meta.location) {
      if (meta.status === 'REQUEST_DENIED') {
        streetViewStaticApiAvailable = false
        console.warn('[street-view] Street View Static API is unavailable; using Mapbox fallback images.')
      } else {
        console.warn('[street-view] metadata not OK:', meta.status, meta.error_message ?? '', 'at', pedestrianPosition)
      }
      return null
    }

    const panoPosition = { lat: meta.location.lat, lng: meta.location.lng }
    const baseHeading = billboardPosition
      ? Math.round(bearingBetween(panoPosition, billboardPosition))
      : Math.round(fallbackHeading)
    const heading = normalizeHeading(baseHeading + headingOffsetDeg)

    const params = new URLSearchParams({
      size: '400x312',
      // Anchor on the actual pano lat/lng — guarantees the static endpoint
      // returns the same pano the metadata call confirmed.
      location: `${panoPosition.lat.toFixed(6)},${panoPosition.lng.toFixed(6)}`,
      heading: String(heading),
      fov: '80',
      pitch: '0',
      return_error_code: 'true',
      key: GOOGLE_MAPS_KEY,
    })
    return `https://maps.googleapis.com/maps/api/streetview?${params.toString()}`
  } catch {
    return null
  }
}

function pedestrianMapboxCaptureUrl(
  pedestrianPosition: LatLng,
  billboardPosition: LatLng | undefined,
  fallbackHeading: number,
  headingOffsetDeg = 0,
): string {
  const baseHeading = billboardPosition
    ? Math.round(bearingBetween(pedestrianPosition, billboardPosition))
    : Math.round(fallbackHeading)
  const heading = normalizeHeading(baseHeading + headingOffsetDeg)

  if (!MAPBOX_TOKEN) return ''
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${pedestrianPosition.lng.toFixed(6)},${pedestrianPosition.lat.toFixed(6)},18,${heading},60/400x312@2x?access_token=${MAPBOX_TOKEN}`
}

function makeCaptureBillboardOverlay(
  viewerPosition: LatLng,
  billboard: BillboardPlacement | undefined,
  oohPoint: OohMapPoint | undefined,
  viewHeading: number,
): AgentCapture['billboardOverlay'] {
  const targetPosition = billboard?.position ?? oohPoint?.position
  if (!targetPosition) return undefined

  const distanceM = Math.max(metersBetween(viewerPosition, targetPosition), 6)
  const bearing = bearingBetween(viewerPosition, targetPosition)
  const headingDelta = ((bearing - viewHeading) + 540) % 360 - 180
  const widthM = billboard?.widthM ?? (oohPoint?.mediaTypeCode === 'bb' ? 12 : 4)
  const heightM = billboard?.heightM ?? (oohPoint?.mediaTypeCode === 'bb' ? 5 : 2)
  const projectedWidth = widthM / (2 * distanceM * Math.tan((CAPTURE_FOV_DEG * Math.PI) / 360))
  const width = clamp(projectedWidth, 0.18, 0.58)
  const height = clamp(width * (heightM / widthM), 0.12, 0.42)

  return {
    mediaUrl: billboard?.mediaUrl,
    creativeText: billboard?.creativeText || billboard?.name || oohPoint?.mediaTypeLabel || 'YOUR AD HERE',
    primaryColor: billboard?.primaryColor ?? OOH_MT_COLOR[oohPoint?.mediaTypeCode ?? ''] ?? '#ffcf5c',
    secondaryColor: billboard?.secondaryColor ?? '#151922',
    x: clamp(0.5 + headingDelta / CAPTURE_FOV_DEG, 0.18, 0.82),
    y: clamp(0.54 - Math.min(distanceM, 90) / 900, 0.34, 0.62),
    width,
    height,
    rotate: clamp(headingDelta * 0.18, -8, 8),
    skew: clamp(headingDelta * -0.22, -10, 10),
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

async function fetchImageAsDataUrl(url: string): Promise<string> {
  const res = await fetch(`/api/proxy-image?url=${encodeURIComponent(url)}`)
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string; detail?: string } | null
    const detail = body?.detail ? `: ${body.detail}` : ''
    throw new Error(`${body?.error ?? `image proxy failed with status ${res.status}`}${detail}`)
  }
  const contentType = res.headers.get('content-type') ?? 'image/jpeg'
  const mime = contentType.split(';')[0].trim()
  const buf = await res.arrayBuffer()
  return `data:${mime};base64,${arrayBufferToBase64(buf)}`
}

async function fetchCaptureWithFallback(primaryUrl: string, fallbackUrl: string): Promise<{ dataUrl: string; imageUrl: string; usedFallback: boolean }> {
  try {
    return {
      dataUrl: await fetchImageAsDataUrl(primaryUrl),
      imageUrl: primaryUrl,
      usedFallback: false,
    }
  } catch (primaryError) {
    if (!fallbackUrl || fallbackUrl === primaryUrl) throw primaryError
    return {
      dataUrl: await fetchImageAsDataUrl(fallbackUrl),
      imageUrl: fallbackUrl,
      usedFallback: true,
    }
  }
}

function createGeneratedCreativeDataUrl(billboard: BillboardPlacement): string {
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = Math.max(420, Math.round(canvas.width * billboard.heightM / billboard.widthM))
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  ctx.fillStyle = billboard.secondaryColor || '#111318'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = billboard.primaryColor || '#ffcf5c'
  ctx.fillRect(0, 0, canvas.width, Math.round(canvas.height * 0.16))
  ctx.fillRect(0, Math.round(canvas.height * 0.84), canvas.width, Math.round(canvas.height * 0.16))

  const text = billboard.creativeText || billboard.name || 'NEW LAUNCH'
  ctx.fillStyle = '#f7f7f2'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '900 96px Arial, sans-serif'
  const maxWidth = canvas.width * 0.82
  while (ctx.measureText(text).width > maxWidth) {
    const size = Number(ctx.font.match(/\d+/)?.[0] ?? 96)
    if (size <= 38) break
    ctx.font = `900 ${size - 6}px Arial, sans-serif`
  }
  ctx.fillText(text.toUpperCase(), canvas.width / 2, canvas.height / 2)

  ctx.font = '700 34px Arial, sans-serif'
  ctx.fillStyle = billboard.primaryColor || '#ffcf5c'
  ctx.fillText(billboard.name.toUpperCase(), canvas.width / 2, canvas.height * 0.72)

  return canvas.toDataURL('image/png')
}

const STANDARD_STYLE_CONFIG: Array<[string, unknown]> = [
  ['show3dObjects', true],
  ['show3dLandmarks', true],
  ['show3dTrees', true],
  ['showPointOfInterestLabels', false],
  ['showPointOfInterestIcons', false],
  ['densityPointOfInterestLabels', 0],
  ['lightPreset', 'dusk'],
  ['colorLand', '#a8a39a'],
  ['colorRoads', '#9e9890'],
  ['colorWater', '#3d6e8c'],
]

function applyStandardStyleConfig(map: mapboxgl.Map) {
  for (const [property, value] of STANDARD_STYLE_CONFIG) {
    try {
      map.setConfigProperty('basemap', property, value)
    } catch {
      // Some Mapbox Standard config options depend on the active GL/style version.
    }
  }
  // Belt-and-suspenders: hide any POI symbol layers directly (Standard style
  // separates icon layers from label layers in some versions).
  const ROAD_SOURCES = new Set(['road', 'road_label', 'motorway_label', 'road-label', 'street_label', 'ferry'])
  try {
    for (const layer of map.getStyle()?.layers ?? []) {
      if (layer.type !== 'symbol') continue
      const src = (layer as mapboxgl.SymbolLayer)['source-layer'] ?? ''
      const id = layer.id
      const isRoadLabel = ROAD_SOURCES.has(src) || src.startsWith('road') || id.startsWith('road') || id.includes('road-label') || id.includes('motorway')
      if (!isRoadLabel) {
        map.setLayoutProperty(id, 'visibility', 'none')
      }
    }
  } catch {
    // Standard style may restrict direct layer access; config path above is sufficient.
  }

  for (const [property, value] of [
    ['show3dBuildings', true],
    ['show3dFacades', true],
  ] as Array<[string, unknown]>) {
    try {
      map.setConfigProperty('basemap', property, value)
    } catch {
      // Keep the map usable if a style version does not expose this option.
    }
  }
}

function getMapBbox(map: mapboxgl.Map) {
  const bounds = map.getBounds()
  if (!bounds) return null

  return [
    bounds.getWest(),
    bounds.getSouth(),
    bounds.getEast(),
    bounds.getNorth(),
  ].map(value => value.toFixed(6)).join(',')
}

function formatMediaTypeName(value: string) {
  return value
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function getMediaTypeLabels(mediaTypeCodes: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(mediaTypeCodes).map(([label, code]) => [code, formatMediaTypeName(label)])
  )
}

function toOohMapPoint(point: OohMapPointTuple, mediaTypeLabels: Record<string, string>): OohMapPoint {
  const [id, lng, lat, mediaTypeCode, priceAmount, weeklyImpressions, visibilityScore, sourceUrlIndex] = point
  return {
    id,
    position: { lat, lng },
    mediaTypeCode,
    mediaTypeLabel: mediaTypeLabels[mediaTypeCode] ?? mediaTypeCode.toUpperCase(),
    priceAmount,
    weeklyImpressions,
    visibilityScore,
    sourceUrlIndex,
  }
}

// --- OOH → BillboardPlacement conversion ---

const OOH_MT_SPEC: Record<string, { w: number; h: number; cl: number }> = {
  bb: { w: 12,  h: 5,   cl: 4 },
  db: { w: 14,  h: 7,   cl: 5 },
  bs: { w: 1.5, h: 2,   cl: 0 },
  ds: { w: 2,   h: 1.5, cl: 2 },
  mu: { w: 8,   h: 6,   cl: 0 },
  sf: { w: 1.2, h: 1.8, cl: 1 },
  tr: { w: 1.5, h: 1.2, cl: 1 },
}
const OOH_MT_COLOR: Record<string, string> = {
  bb: '#ffcf5c',
  db: '#4991ff',
  bs: '#91d6c5',
  ds: '#78dcff',
  mu: '#ff74a0',
  sf: '#c2a0ff',
  tr: '#ff9753',
}
const OOH_MT_FORMAT: Record<string, BillboardPlacement['format']> = {
  bb: 'static',
  db: 'digital',
  bs: 'poster',
  ds: 'digital',
  mu: 'wallscape',
  sf: 'poster',
  tr: 'poster',
}
const OOH_MT_MATERIAL: Record<string, BillboardPlacement['material']> = {
  bb: 'printed-vinyl',
  db: 'digital-day',
  bs: 'printed-vinyl',
  ds: 'digital-day',
  mu: 'printed-vinyl',
  sf: 'printed-vinyl',
  tr: 'printed-vinyl',
}

function idToHeadingOoh(id: string): number {
  let h = 5381
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h) ^ id.charCodeAt(i)
  return ((h >>> 0) / 0xffffffff) * 360
}

function oohPointToBillboardPlacement(pt: OohMapPoint): BillboardPlacement {
  const spec = OOH_MT_SPEC[pt.mediaTypeCode] ?? { w: 4, h: 2, cl: 2 }
  return {
    id: pt.id,
    name: pt.mediaTypeLabel,
    position: pt.position,
    widthM: spec.w,
    heightM: spec.h,
    clearanceM: spec.cl,
    heading: idToHeadingOoh(pt.id),
    format: OOH_MT_FORMAT[pt.mediaTypeCode] ?? 'static',
    material: OOH_MT_MATERIAL[pt.mediaTypeCode] ?? 'printed-vinyl',
    creativeText: '',
    primaryColor: OOH_MT_COLOR[pt.mediaTypeCode] ?? '#c8d4e8',
    secondaryColor: '#1d252b',
    brightness: 60,
    weeklyReach: pt.weeklyImpressions,
  }
}

function generateSyntheticTraffic(center: LatLng, radiusKm: number): TrafficPoint[] {
  const points: TrafficPoint[] = []
  const categories: Array<TrafficPoint['category']> = ['restaurant', 'retail', 'transit', 'cafe', 'office', 'transit-hub']
  const weights = [0.8, 0.6, 0.9, 0.75, 0.5, 1.0]
  const lngScale = Math.cos((center.lat * Math.PI) / 180)
  const seed = (center.lat * 1000 + center.lng * 1000) | 0

  let n = seed
  const rand = () => { n = (n * 1664525 + 1013904223) & 0xffffffff; return (n >>> 0) / 0xffffffff }

  for (let i = 0; i < 60; i++) {
    const angle = rand() * Math.PI * 2
    const dist = rand() * radiusKm * 0.9
    const lat = center.lat + (dist / 110.574) * Math.sin(angle)
    const lng = center.lng + (dist / (111.32 * lngScale)) * Math.cos(angle)
    const ci = i % categories.length
    points.push({
      id: `syn-${i}`,
      position: { lat, lng },
      weight: weights[ci] * (0.7 + rand() * 0.3),
      category: categories[ci],
    })
  }

  return points
}

function roadsFromMapboxTiles(map: mapboxgl.Map, center?: LatLng | null, radiusKm = ENRICHMENT_RADIUS_KM): RoadSegment[] {
  const classWeight: Record<string, number> = {
    motorway: 0.18, motorway_link: 0.18, trunk: 0.25, trunk_link: 0.25,
    primary: 0.42, primary_link: 0.38, secondary: 0.4, secondary_link: 0.36,
    tertiary: 0.38, tertiary_link: 0.34, street: 0.32, street_limited: 0.36,
    service: 0.28, pedestrian: 0.74, path: 0.56, track: 0.24,
  }
  const classKind: Record<string, RoadKind> = {
    pedestrian: 'pedestrian', path: 'path', primary: 'primary', primary_link: 'primary',
    trunk: 'primary', trunk_link: 'primary', motorway: 'primary', motorway_link: 'primary',
    secondary: 'secondary', secondary_link: 'secondary', tertiary: 'secondary',
    tertiary_link: 'secondary',
  }
  const pedestrianTypes = new Set(['footway', 'steps', 'crossing', 'sidewalk'])
  const pathTypes = new Set(['path', 'cycleway', 'hiking', 'trail', 'bridleway'])

  const roadKind = (cls: string, type: string): RoadKind => {
    if (pedestrianTypes.has(type)) return 'footway'
    if (pathTypes.has(type)) return 'path'
    return classKind[cls] ?? 'residential'
  }

  const roadWeight = (cls: string, type: string) => {
    if (pedestrianTypes.has(type)) return 0.66
    if (pathTypes.has(type)) return 0.54
    return classWeight[cls] ?? 0.3
  }

  const featureLineStrings = (feature: mapboxgl.MapboxGeoJSONFeature): GeoJSON.Position[][] => {
    if (feature.geometry?.type === 'LineString') {
      return [(feature.geometry as GeoJSON.LineString).coordinates]
    }
    if (feature.geometry?.type === 'MultiLineString') {
      return (feature.geometry as GeoJSON.MultiLineString).coordinates
    }
    return []
  }

  const featureSignature = (feature: mapboxgl.MapboxGeoJSONFeature, coords: GeoJSON.Position[]) => {
    const properties = feature.properties ?? {}
    const ends = [coords[0], coords[coords.length - 1]]
      .map(([lng, lat]) => `${lng.toFixed(5)},${lat.toFixed(5)}`)
      .join('|')
    return [
      feature.id ?? '',
      properties.class ?? '',
      properties.type ?? '',
      properties.name ?? '',
      ends,
    ].join(':')
  }

  try {
    const bounds = map.getBounds()
    if (!bounds) return []
    const w = bounds.getWest(), e = bounds.getEast()
    const s = bounds.getSouth(), n = bounds.getNorth()
    const inCircle = (point: LatLng) => !center || haversineKm(center, point) <= radiusKm

    const inView = (f: mapboxgl.MapboxGeoJSONFeature) => {
      const lines = featureLineStrings(f)
      if (lines.length === 0) return false
      return lines.some(coords => coords.some(
        ([lng, lat]) => (!center || (lng >= w && lng <= e && lat >= s && lat <= n)) && inCircle({ lat, lng })
      )
      )
    }

    const style = map.getStyle()
    const sourceIds = Object.keys(style?.sources ?? {})
    let features = sourceIds.flatMap(sourceId => {
      try {
        return map.querySourceFeatures(sourceId, { sourceLayer: 'road' }).filter(inView)
      } catch {
        return []
      }
    })

    // Fallback: query rendered road/path-like layers around the selected circle.
    if (features.length === 0) {
      const roadLayerIds = (style?.layers ?? [])
        .filter(l => {
          if (l.type !== 'line') return false
          const sourceLayer = (l as { 'source-layer'?: string })['source-layer'] ?? ''
          const id = l.id.toLowerCase()
          return sourceLayer === 'road' || /road|street|path|pedestrian|bridge|tunnel/.test(id)
        })
        .map(l => l.id)
      if (roadLayerIds.length > 0) {
        const queryGeometry = center
          ? (() => {
              const p = map.project([center.lng, center.lat])
              const metersPerPixel = 156543.03392 * Math.cos(center.lat * Math.PI / 180) / Math.pow(2, map.getZoom())
              const pxRadius = Math.max(80, Math.min(900, (radiusKm * 1000) / Math.max(1, metersPerPixel)))
              return [
                [p.x - pxRadius, p.y - pxRadius],
                [p.x + pxRadius, p.y + pxRadius],
              ] as [[number, number], [number, number]]
            })()
          : undefined
        features = (queryGeometry
          ? map.queryRenderedFeatures(queryGeometry, { layers: roadLayerIds })
          : map.queryRenderedFeatures({ layers: roadLayerIds })
        ).filter(inView)
      }
    }

    const seen = new Set<string>()

    return features
      .flatMap((f, idx) => {
        const cls = String(f.properties?.class ?? '').toLowerCase()
        const type = String(f.properties?.type ?? '').toLowerCase()
        return featureLineStrings(f).flatMap((coords, lineIdx) => {
          if (coords.length < 2) return []
          const signature = featureSignature(f, coords)
          if (seen.has(signature)) return []
          seen.add(signature)
          return [{
            id: `mb-${f.id ?? idx}-${lineIdx}`,
            path: coords.map(([lng, lat]) => ({ lat, lng })),
            kind: roadKind(cls, type),
            weight: roadWeight(cls, type),
          }]
        })
      })
      .filter(r => r.path.length >= 2)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 1400)
  } catch { return [] }
}

function abortQuietly(controller: AbortController, reason: string) {
  if (!controller.signal.aborted) controller.abort(reason)
}

const roadFallbackCache = new Map<string, RoadSegment[]>()

function roadFallbackCacheKey(center: LatLng, radiusKm: number) {
  return `v4:${center.lat.toFixed(4)},${center.lng.toFixed(4)},${radiusKm.toFixed(2)}`
}

async function fetchFallbackRoadsInRadius(center: LatLng, radiusKm: number, signal: AbortSignal): Promise<RoadSegment[]> {
  const key = roadFallbackCacheKey(center, radiusKm)
  const cached = roadFallbackCache.get(key)
  if (cached) return cached

  try {
    const res = await fetch('/api/roads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: center.lat, lng: center.lng, radiusKm }),
      signal,
    })
    if (!res.ok) return []
    const data = await res.json() as { roads?: RoadSegment[] }
    const roads = Array.isArray(data.roads) ? data.roads : []
    roadFallbackCache.set(key, roads)
    return roads
  } catch {
    return []
  }
}

function trafficFromMapboxTiles(map: mapboxgl.Map): TrafficPoint[] {
  try {
    const style = map.getStyle()
    if (!style?.layers) return []
    const poiLayerIds = style.layers
      .filter(l => {
        const sl = (l as { 'source-layer'?: string })['source-layer']
        return sl === 'poi_label' || sl === 'landmark_label'
      })
      .map(l => l.id)
    if (poiLayerIds.length === 0) return []
    const catWeight = (cat: string): number => {
      if (/transit|station|subway|bus/.test(cat)) return 1.0
      if (/food|restaurant|cafe|bar/.test(cat)) return 0.85
      if (/shop|retail|store/.test(cat)) return 0.75
      if (/hotel/.test(cat)) return 0.65
      return 0.5
    }
    return map.queryRenderedFeatures({ layers: poiLayerIds })
      .filter(f => f.geometry.type === 'Point')
      .map((f, idx) => {
        const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates
        const cat = ((f.properties?.category_en ?? f.properties?.type ?? '') as string).toLowerCase()
        return { id: `mb-poi-${f.id ?? idx}`, position: { lat, lng }, weight: catWeight(cat), category: 'transit' as TrafficPoint['category'] }
      })
  } catch { return [] }
}

function distanceToSegmentMeters(point: LatLng, a: LatLng, b: LatLng) {
  const cosLat = Math.cos((point.lat * Math.PI) / 180)
  const ax = (a.lng - point.lng) * 111_320 * cosLat
  const ay = (a.lat - point.lat) * 110_574
  const bx = (b.lng - point.lng) * 111_320 * cosLat
  const by = (b.lat - point.lat) * 110_574
  const vx = bx - ax
  const vy = by - ay
  const lenSq = vx * vx + vy * vy
  const t = lenSq > 0 ? Math.max(0, Math.min(1, -(ax * vx + ay * vy) / lenSq)) : 0
  const x = ax + vx * t
  const y = ay + vy * t
  return Math.sqrt(x * x + y * y)
}

function boostRoadsWithTrafficPoints(roads: RoadSegment[], points: TrafficPoint[]) {
  if (roads.length === 0 || points.length === 0) return roads

  return roads.map(road => {
    let boost = 0
    for (const point of points) {
      let nearest = Infinity
      for (let i = 1; i < road.path.length; i++) {
        nearest = Math.min(nearest, distanceToSegmentMeters(point.position, road.path[i - 1], road.path[i]))
      }
      if (nearest > 260) continue
      boost = Math.max(boost, point.weight * Math.exp(-nearest / 150) * 0.95)
    }

    return {
      ...road,
      weight: Math.max(road.weight, Math.min(1, road.weight * 0.35 + boost)),
    }
  })
}

function roadLengthApproxMeters(road: RoadSegment): number {
  let total = 0
  for (let i = 1; i < road.path.length; i++) {
    const a = road.path[i - 1]
    const b = road.path[i]
    const cosLat = Math.cos((a.lat * Math.PI) / 180)
    const dx = (b.lng - a.lng) * 111_320 * cosLat
    const dy = (b.lat - a.lat) * 110_574
    total += Math.hypot(dx, dy)
  }
  return total
}

function roadBuildingDensity(road: RoadSegment, buildings: Building[]) {
  if (buildings.length === 0 || road.path.length < 2) return 0
  const sampleBuildings = buildings.slice(0, 350)
  const roadLength = Math.max(1, roadLengthApproxMeters(road))
  let score = 0

  for (const building of sampleBuildings) {
    let nearest = Infinity
    for (let i = 1; i < road.path.length; i++) {
      nearest = Math.min(nearest, distanceToSegmentMeters(building.centroid, road.path[i - 1], road.path[i]))
      if (nearest < 18) break
    }
    if (nearest > 90) continue

    const poiBoost = building.poiCategory ? 1.8 : 1
    const heightBoost = Math.min(1.8, 0.75 + (building.heightM || 12) / 45)
    score += poiBoost * heightBoost * Math.exp(-nearest / 45)
  }

  return Math.min(1, score / Math.max(5, roadLength / 28))
}

function diversifyRoadTraffic(roads: RoadSegment[], buildings: Building[], fixtures: StreetFixture[]) {
  if (roads.length === 0) return roads

  const scored = roads.map((road, index) => {
    const buildingDensity = roadBuildingDensity(road, buildings)
    const fixtureDensity = fixtures.reduce((score, fixture) => {
      let nearest = Infinity
      for (let i = 1; i < road.path.length; i++) {
        nearest = Math.min(nearest, distanceToSegmentMeters(fixture.position, road.path[i - 1], road.path[i]))
      }
      return nearest < 80 ? score + Math.exp(-nearest / 35) : score
    }, 0)
    const kindBase = road.kind === 'footway' || road.kind === 'pedestrian' || road.kind === 'path'
      ? 0.38
      : road.kind === 'primary'
        ? 0.5
        : road.kind === 'secondary'
          ? 0.44
          : 0.28
    const deterministicNoise = 0.12 * (0.5 + 0.5 * Math.sin(index * 12.9898 + road.path.length * 78.233))
    const mixed = kindBase + buildingDensity * 0.7 + Math.min(0.3, fixtureDensity * 0.11) + deterministicNoise
    return { road, mixed }
  })

  const values = scored.map(item => item.mixed)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = Math.max(0.001, max - min)

  return scored.map(({ road, mixed }, index) => {
    const normalized = (mixed - min) / range
    const shaped = Math.pow(normalized, 0.72)
    const stripe = 0.5 + 0.5 * Math.sin(index * 2.17)
    const weight = Math.max(0.06, Math.min(1, 0.12 + shaped * 0.86 + stripe * 0.08))
    return {
      ...road,
      weight,
    }
  })
}

function isOohMapPoint(value: unknown): value is OohMapPoint {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'mediaTypeCode' in value &&
    'weeklyImpressions' in value &&
    'visibilityScore' in value
  )
}

function getOohScoreLabel(point: OohMapPoint) {
  const normalized = point.visibilityScore <= 1
    ? point.visibilityScore * 10
    : point.visibilityScore / 10
  return Math.min(10, Math.max(0, normalized)).toFixed(1)
}

export default function MapCanvas({ focusArea, countryIso }: { focusArea?: { lat: number; lng: number } | null; countryIso?: string | null } = {}) {
  const [mapStyleReady, setMapStyleReady] = useState(false)
  const [oohDataReady, setOohDataReady] = useState(false)
  const [buildingsDataReady, setBuildingsDataReady] = useState(false)
  const [fixturesDataReady, setFixturesDataReady] = useState(false)
  const [activeTool, setActiveTool] = useState<MapTool>(null)
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null)
  const [selectedArea, setSelectedArea] = useState<LatLng | null>(null)
  const [lassoPoints, setLassoPoints] = useState<[number, number][]>([])
  const [isLassoModeActive, setIsLassoModeActive] = useState(false)
  const [hasFinishedLasso, setHasFinishedLasso] = useState(false)
  const [isDrawingLasso, setIsDrawingLasso] = useState(false)
  const [isSelectionLocked, setIsSelectionLocked] = useState(false)
  const [oohBbox, setOohBbox] = useState<string | null>(null)
  const [oohPoints, setOohPoints] = useState<OohMapPoint[]>([])
  const [oohSourceUrls, setOohSourceUrls] = useState<string[]>([])
  const [oohTotalPoints, setOohTotalPoints] = useState(0)
  const [oohStatus, setOohStatus] = useState('Loading OOH inventory...')
  const [selectedOohPointId, setSelectedOohPointId] = useState<string | null>(null)
  const [oohClickPos, setOohClickPos] = useState<{ x: number; y: number } | null>(null)
  const [buildingStatus, setBuildingStatus] = useState('Loading building context...')
  const [buildings, setBuildings] = useState<Building[]>([])
  const [billboards, setBillboards] = useState<BillboardPlacement[]>(INITIAL_BILLBOARDS)
  const [selectedBillboardId, setSelectedBillboardId] = useState<string | null>(INITIAL_BILLBOARDS[0]?.id ?? null)
  const [appliedCreative, setAppliedCreative] = useState<string>('/mock.png')
  const [sceneCapture, setSceneCapture] = useState<CapturedSceneImage | null>(null)
  const [captureStatus, setCaptureStatus] = useState('No scene captured yet.')
  const [quickResponse, setQuickResponse] = useState<SceneResponseApiResponse | null>(null)
  const [quickResponseError, setQuickResponseError] = useState<string | null>(null)
  const [isQuickAnalyzing, setIsQuickAnalyzing] = useState(false)
  const [animationTime, setAnimationTime] = useState(0)
  const [floodAnimStartTime, setFloodAnimStartTime] = useState<number | null>(null)
  const [agentsSnapshot, setAgentsSnapshot] = useState<PedestrianAgent[]>([])
  const agentsRef = useRef<PedestrianAgent[]>([])
  const behaviorsRef = useRef<AgentBehavior[]>([])
  const preFloodAgentsRef = useRef<PedestrianAgent[]>([])
  const preFloodBehaviorsRef = useRef<AgentBehavior[]>([])
  const floodCellsRef = useRef<FloodDepthCell[]>([])
  const billboardRotateRef = useRef<{ id: string; startX: number } | null>(null)
  const roadsRef = useRef<RoadSegment[]>([])
  const trafficPointsRef = useRef<TrafficPoint[]>([])
  const buildingsRef = useRef<Building[]>([])
  const billboardsRef = useRef<BillboardPlacement[]>(INITIAL_BILLBOARDS)
  const oohPointsRef = useRef<OohMapPoint[]>([])
  const sightingCooldownRef = useRef<Record<string, number>>({})
  const [sightingNotifications, setSightingNotifications] = useState<BillboardSighting[]>([])
  const pendingInterviewsRef = useRef<Array<{ agentId: string; agentName: string; billboardId: string; billboardName: string }>>([])
  const activeInterviewsRef = useRef<Map<string, PedestrianInterviewSession>>(new Map())
  const [interviewSessions, setInterviewSessions] = useState<PedestrianInterviewSession[]>([])
  const [agentCaptures, setAgentCaptures] = useState<AgentCapture[]>([])
  const agentCapturesRef = useRef<AgentCapture[]>([])
  const [streetFixtures, setStreetFixtures] = useState<StreetFixture[]>([])
  const [waterBodies, setWaterBodies] = useState<WaterBody[]>([])
  const [cityTrafficPoints, setCityTrafficPoints] = useState<TrafficPoint[]>([])
  const [cityRoads, setCityRoads] = useState<RoadSegment[]>([])
  const [weatherContext, setWeatherContext] = useState<CityWeatherContext | null>(null)
  const [trafficPoints, setTrafficPoints] = useState<TrafficPoint[]>([])
  const [roads, setRoads] = useState<RoadSegment[]>([])
  agentCapturesRef.current = agentCaptures
  roadsRef.current = roads
  trafficPointsRef.current = trafficPoints
  buildingsRef.current = buildings
  const [trafficStatus, setTrafficStatus] = useState('Select an area to see traffic flow.')
  const [streetFixtureStatus, setStreetFixtureStatus] = useState('Loading street fixtures...')
  const [cityEnrichmentStatus, setCityEnrichmentStatus] = useState('Loading global city context...')
  const [trafficPhaseTime, setTrafficPhaseTime] = useState(() => Math.floor(Date.now() / 1000))
  const [streetViewLocation, setStreetViewLocation] = useState<LatLng | null>(null)
  const [streetViewHover, setStreetViewHover] = useState<{ x: number; y: number } | null>(null)
  const [agentShotStatus, setAgentShotStatus] = useState<string | null>(null)
  const [agentShotError, setAgentShotError] = useState(false)
  const [isAgentShotRunning, setIsAgentShotRunning] = useState(false)
  const [cursorCoord, setCursorCoord] = useState<LatLng | null>(null)
  const [fps, setFps] = useState(0)
  const [pedestrianCount, setPedestrianCount] = useState(0)
  const [showTrafficLines, setShowTrafficLines] = useState(true)
  const [sgOohAssets, setSgOohAssets] = useState<SingaporeOohAsset[]>([])
  const [showSgOoh] = useState(false)
  const [sgOohStatus, setSgOohStatus] = useState<string | null>(null)
  const [selectedSgOohId, setSelectedSgOohId] = useState<string | null>(null)
  const [mapZoom, setMapZoom] = useState(INITIAL_VIEW_STATE.zoom)
  const [isBillboardRotating, setIsBillboardRotating] = useState(false)
  const [floodElapsedMinute, setFloodElapsedMinute] = useState(0)
  const [floodRunning, setFloodRunning] = useState(false)
  const [floodScenario, setFloodScenario] = useState<FloodScenarioResult | null>(null)
  floodCellsRef.current = floodScenario?.improvedCells ?? floodScenario?.cells ?? []
  const floodAnimStartTimeRef = useRef<number | null>(null)
  floodAnimStartTimeRef.current = floodAnimStartTime
  const [plannerInterventions, setPlannerInterventions] = useState<PlannerIntervention[]>([])
  const [selectedFloodIntervention, setSelectedFloodIntervention] = useState<FloodInterventionKind>('flood-barrier')
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string | null>(null)
  const [suggestionPreloadArea, setSuggestionPreloadArea] = useState<LatLng | null>(null)
  const simulationSuggestions = useMemo(() => computeSimulationSuggestions(), [])

  const suppressNextMapClickRef = useRef(false)

  const contextArea = selectedArea ?? suggestionPreloadArea ?? FALLBACK_AREA
  const selectedBillboard = billboards.find(billboard => billboard.id === selectedBillboardId) ?? null

  const cursorBillboard = useMemo((): BillboardPlacement | null => {
    if (activeTool !== 'builder' || isBillboardRotating || !cursorCoord) return null
    return {
      id: '__cursor_preview__',
      name: 'Preview',
      position: cursorCoord,
      widthM: 12,
      heightM: 5,
      clearanceM: 6,
      heading: 90,
      format: 'digital',
      material: 'digital-day',
      creativeText: 'NEW LAUNCH',
      primaryColor: '#ffcf5c',
      secondaryColor: '#111318',
      brightness: 75,
      weeklyReach: 64000,
      mediaUrl: appliedCreative ?? undefined,
    }
  }, [activeTool, cursorCoord, appliedCreative, isBillboardRotating])

  const cursorBusStop = useMemo((): StreetFixture | null => {
    if (activeTool !== 'place-bus-stop' || !cursorCoord) return null
    return {
      id: '__cursor_bus_stop_preview__',
      kind: 'bus-stop',
      position: cursorCoord,
      name: 'Bus Stop Preview',
    }
  }, [activeTool, cursorCoord])

  const cursorPedestrian = useMemo((): PedestrianAgent | null => {
    if (activeTool !== 'place-pedestrian' || !cursorCoord) return null
    return {
      id: '__cursor_pedestrian_preview__',
      name: 'Preview',
      position: cursorCoord,
      heading: 0,
      speedMps: 0,
      phaseOffsetM: 0,
      visual: 'walker',
    }
  }, [activeTool, cursorCoord])

  const cursorAgentRef = useRef<PedestrianAgent[]>([])
  useEffect(() => {
    cursorAgentRef.current = cursorPedestrian ? [cursorPedestrian] : []
    mapInstance?.triggerRepaint()
  }, [cursorPedestrian, mapInstance])

  const loadingProgress = useMemo(() => {
    let p = 0
    if (mapStyleReady)      p += 40
    if (oohDataReady)       p += 20
    if (buildingsDataReady) p += 15
    if (fixturesDataReady)  p += 7
    return p
  }, [mapStyleReady, oohDataReady, buildingsDataReady, fixturesDataReady])

  const loadingLabel = !mapStyleReady        ? 'LOADING 3D SCENE'
    : !oohDataReady                          ? 'FETCHING OOH INVENTORY'
    : !buildingsDataReady                    ? 'LOADING BUILDINGS'
    : !fixturesDataReady                     ? 'MAPPING FIXTURES'
    : 'FINALIZING'
  const selectedOohPoint = selectedOohPointId
    ? oohPoints.find(point => point.id === selectedOohPointId) ?? null
    : null

  const floodScenarioVisible = activeTool === 'flood-planner' || floodScenario !== null || plannerInterventions.length > 0

  useEffect(() => {
    if (!selectedArea || floodElapsedMinute <= 0) {
      if (floodElapsedMinute <= 0 && plannerInterventions.length === 0) setFloodScenario(null)
      return
    }

    setFloodScenario(buildFloodScenario({
      center: selectedArea,
      buildings,
      roads,
      trafficPoints,
      waterBodies,
      streetFixtures,
      elapsedMinute: floodElapsedMinute,
      interventions: plannerInterventions,
    }))
  }, [buildings, floodElapsedMinute, plannerInterventions, roads, selectedArea, trafficPoints, waterBodies, streetFixtures])

  const startFloodSimulation = useCallback(() => {
    if (!selectedArea) return
    preFloodAgentsRef.current = [...agentsRef.current]
    preFloodBehaviorsRef.current = [...behaviorsRef.current]
    setActiveTool('flood-planner')
    setFloodElapsedMinute(48)
    setFloodRunning(false)
    setFloodAnimStartTime(animationTime)
  }, [selectedArea, animationTime])

  const resetFloodSimulation = useCallback(() => {
    setFloodElapsedMinute(0)
    setFloodRunning(false)
    setFloodScenario(null)
    setPlannerInterventions([])
    setFloodAnimStartTime(null)
    preFloodAgentsRef.current = []
    preFloodBehaviorsRef.current = []
  }, [])

  const placeFloodIntervention = useCallback((position: LatLng, kind = selectedFloodIntervention) => {
    if (!selectedArea) return
    if (isLassoModeActive && lassoPoints.length >= 3) {
      if (!isPointInPolygon(position, lassoPoints)) return
    }
    setPlannerInterventions(current => [
      ...current,
      createPlannerIntervention(kind, position, current.length + 1, floodCellsRef.current),
    ])
    if (floodElapsedMinute <= 0) setFloodElapsedMinute(48)
  }, [floodElapsedMinute, selectedArea, selectedFloodIntervention])

  const applyRecommendedFloodIntervention = useCallback(() => {
    const zone = floodScenario?.priorityZones[0]
    if (!zone) return
    setSelectedFloodIntervention(zone.recommendedIntervention)
    placeFloodIntervention(zone.position, zone.recommendedIntervention)
  }, [floodScenario, placeFloodIntervention])

  const spawnProceduralInterventions = useCallback((count = 8) => {
    if (!selectedArea || roads.length === 0) return
    setPlannerInterventions(current => {
      const updated = spawnFloodInterventions(
        selectedFloodIntervention,
        roads,
        trafficPoints,
        buildingsRef.current,
        count * 2,
        current,
        floodCellsRef.current,
      )
      const newOnes = updated.slice(current.length).filter(i =>
        isLassoModeActive && lassoPoints.length >= 3
          ? isPointInPolygon(i.position, lassoPoints)
          : true
      )
      return [...current, ...newOnes]
    })
    if (floodElapsedMinute <= 0) setFloodElapsedMinute(48)
  }, [selectedArea, roads, trafficPoints, selectedFloodIntervention, floodElapsedMinute, isLassoModeActive, lassoPoints])

  const deckRef = useRef<DeckGLRef | null>(null)
  const mapRef = useRef<MapRef | null>(null)
  const configuredMapRef = useRef<mapboxgl.Map | null>(null)
  const contextAreaRef = useRef(contextArea)
  const selectionBoundaryRef = useRef<((position: LatLng) => boolean) | null>(null)
  useEffect(() => { contextAreaRef.current = contextArea }, [contextArea])
  useEffect(() => {
    if (!selectedArea) {
      selectionBoundaryRef.current = null
      return
    }

    if (isLassoModeActive && lassoPoints.length >= 3) {
      const polygon = [...lassoPoints]
      selectionBoundaryRef.current = position => isPointInPolygon(position, polygon)
      return
    }

    selectionBoundaryRef.current = null
  }, [isLassoModeActive, lassoPoints, selectedArea])

  // Derive BillboardPlacement objects from pre-loaded OOH inventory so they render
  // through the exact same 3D billboard model pipeline as user-spawned billboards.
  // Kept separate from `billboards` state so they don't appear in the studio panel,
  // but merged in for the street-view AR overlay so the 2D projection draws over them.
  const oohBillboards = useMemo(
    () => oohPoints.map(point => ({
      ...oohPointToBillboardPlacement(point),
      mediaUrl: appliedCreative,
    })),
    [oohPoints, appliedCreative]
  )

  const streetViewBillboards = useMemo(
    () => [...billboards, ...oohBillboards],
    [billboards, oohBillboards]
  )

  const handlePickOohBillboard = useCallback((placementId: string) => {
    setSelectedOohPointId(placementId)
    setOohClickPos(null)
  }, [])

  const handleSelectFloodReport = useCallback((report: FloodReport, screen: { x: number; y: number }) => {
    setSelectedArea(report.position)
    setPlannerInterventions([])
    setFloodElapsedMinute(0)
    setFloodRunning(false)
    setFloodAnimStartTime(null)
    setActiveTool('flood-planner')

    mapInstance?.flyTo({
      center: [report.position.lng, report.position.lat],
      zoom: report.source === 'pub-risk-area' ? 16.4 : 9.5,
      pitch: INITIAL_VIEW_STATE.pitch,
      bearing: INITIAL_VIEW_STATE.bearing,
      duration: 1100,
    })
  }, [mapInstance])

  const handleSelectSuggestion = useCallback((suggestion: SimulationSuggestion) => {
    if (selectedSuggestionId !== suggestion.id) {
      // First click: highlight the shape, fly to it, and pre-fetch buildings for this area
      setSelectedSuggestionId(suggestion.id)
      setSuggestionPreloadArea(suggestion.centroid)
      mapInstance?.flyTo({
        center: [suggestion.centroid.lng, suggestion.centroid.lat],
        zoom: 14.5,
        pitch: INITIAL_VIEW_STATE.pitch,
        bearing: INITIAL_VIEW_STATE.bearing,
        duration: 900,
      })
      return
    }

    // Second click on the already-highlighted shape: confirm it using the irregular polygon
    setSuggestionPreloadArea(null)
    setPlannerInterventions([])
    setFloodElapsedMinute(0)
    setFloodRunning(false)
    setFloodAnimStartTime(null)
    setIsLassoModeActive(true)
    setHasFinishedLasso(true)
    setIsDrawingLasso(false)
    setLassoPoints(suggestion.polygon)
    setSelectedArea(suggestion.centroid)
    setActiveTool('flood-planner')

    mapInstance?.flyTo({
      center: [suggestion.centroid.lng, suggestion.centroid.lat],
      zoom: 16.4,
      pitch: INITIAL_VIEW_STATE.pitch,
      bearing: INITIAL_VIEW_STATE.bearing,
      duration: 1100,
    })
  }, [mapInstance, selectedSuggestionId])

  const layers = useMemo(
    () => {
      const visibleBuildings = (() => {
        if (isLassoModeActive && lassoPoints.length >= 3) {
          const withinPoly = buildings.filter(b => isPointInPolygon(b.centroid, lassoPoints))
          if (withinPoly.length > 0) return withinPoly
          // Buildings for this area still loading — fall back to radius until they arrive
        }
        if (selectedArea) {
          return buildings.filter(b => haversineKm(selectedArea, b.centroid) <= ENRICHMENT_RADIUS_KM)
        }
        return buildings
      })()

      const base = [
        ...(selectedArea && showTrafficLines ? makeTrafficFlowLayers(trafficPoints, roads) : []),
        ...(selectedArea ? makeBuildingLayers(visibleBuildings) : []),
        ...makeStreetFixtureLayers(cursorBusStop ? [...streetFixtures, cursorBusStop] : streetFixtures, trafficPhaseTime),
        new ScatterplotLayer<OohMapPoint>({
          id: 'ooh-inventory-ground-markers',
          data: oohPoints,
          getPosition: (p) => [p.position.lng, p.position.lat, 0.05],
          getRadius: (p) => selectedOohPointId === p.id ? 7 : 5,
          radiusUnits: 'meters',
          getFillColor: (p) => selectedOohPointId === p.id ? [255, 207, 92, 120] : [255, 207, 92, 72],
          getLineColor: (p) => selectedOohPointId === p.id ? [255, 255, 255, 235] : [255, 207, 92, 180],
          stroked: true,
          filled: true,
          getLineWidth: (p) => selectedOohPointId === p.id ? 3 : 2,
          lineWidthUnits: 'pixels',
          pickable: true,
          onClick: (info) => {
            if (info.object) {
              setSelectedOohPointId(info.object.id)
              setOohClickPos({ x: info.x ?? 0, y: info.y ?? 0 })
            }
          },
          updateTriggers: {
            getRadius: [selectedOohPointId],
            getFillColor: [selectedOohPointId],
            getLineColor: [selectedOohPointId],
            getLineWidth: [selectedOohPointId],
          },
        }),
        ...(!selectedArea ? makeSimulationSuggestionLayers({
          suggestions: simulationSuggestions,
          selectedId: selectedSuggestionId,
          onSelect: handleSelectSuggestion,
          time: animationTime,
        }) : []),
        ...makeBillboardLayers(oohBillboards, selectedOohPointId, handlePickOohBillboard, 1, 'ooh-', false),
        ...makeBillboardLayers(billboards, selectedBillboardId, setSelectedBillboardId),
        ...(cursorBillboard ? makeBillboardLayers([cursorBillboard], null, () => {}, 0.5) : []),
        ...(isLassoModeActive && lassoPoints.length > 0
          ? [
              makeLassoSelectionLayer(lassoPoints, hasFinishedLasso),
              ...(!hasFinishedLasso ? makeLassoHandlesLayer(lassoPoints, (index, coord) => {
                setLassoPoints(current => {
                  const updated = [...current]
                  if (index >= 0 && index < updated.length) {
                    updated[index] = coord

                    // Snapping logic: if dragged node is within ~35 meters of any other node (except itself), snap and close
                    if (mapInstance) {
                      const projDragged = mapInstance.project({ lng: coord[0], lat: coord[1] })
                      for (let i = 0; i < updated.length; i++) {
                        if (i === index) continue
                        const otherCoord = updated[i]
                        const projOther = mapInstance.project({ lng: otherCoord[0], lat: otherCoord[1] })
                        const dx = projDragged.x - projOther.x
                        const dy = projDragged.y - projOther.y
                        const distPx = Math.sqrt(dx * dx + dy * dy)
                        // If proximity in screen space is less than 24 pixels (approx distance gap), snap together and trigger completion
                        if (distPx < 24) {
                          updated[index] = [...otherCoord] as [number, number]
                          // Shorten path to close it smoothly and trigger confirm
                          setTimeout(() => {
                            const centroid = getPolygonCentroid(updated)
                            setSelectedArea(centroid)
                            setHasFinishedLasso(true)
                            setActiveTool('flood-planner')
                          }, 10)
                          break
                        }
                      }
                    }
                  }
                  return updated
                })
              }) : [])
            ]
          : []),
        ...(floodScenarioVisible && floodScenario ? makeFloodScenarioLayers({
          cells: plannerInterventions.length > 0 ? floodScenario.improvedCells : floodScenario.cells,
          baselineCells: plannerInterventions.length > 0 ? floodScenario.cells : undefined,
          indoorAgents: floodScenario.indoorAgents,
          priorityZones: floodScenario.priorityZones,
          interventions: plannerInterventions,
          time: animationTime,
          elapsedMinute: floodScenario.elapsedMinute,
          showHeatmap: floodAnimStartTime !== null && (animationTime - floodAnimStartTime) >= 16,
          occupancy: floodScenario.occupancy,
          buildings,
          lassoPolygon: isLassoModeActive && lassoPoints.length >= 3 ? lassoPoints : undefined,
          floodProgress: (() => {
            if (floodAnimStartTime === null) return 0
            const elapsed = animationTime - floodAnimStartTime
            if (elapsed >= 16) return 0
            return elapsed < 8 ? elapsed / 8 : (16 - elapsed) / 8
          })(),
        }) : []),
        // Re-render buildings above flood water so they visually protrude through the water surface.
        // depthCompare: 'always' forces these fragments to win regardless of what flood wrote to the depth buffer.
        ...(floodScenarioVisible && floodScenario && visibleBuildings.length > 0
          ? makeBuildingLayers(visibleBuildings, {
              idPrefix: 'above-flood-',
              parameters: { depthCompare: 'always', depthWriteEnabled: false },
            })
          : []),
      ]

      // Pedestrian agents: catalog-driven stylized block models with lightweight props.
      if (agentsSnapshot.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sl = base as any[]

        const floodedAgents = agentsSnapshot.filter(a => (a.floodDepthM ?? 0) > 0.05)
        const floodedNonCar = floodedAgents.filter(a => a.kind !== 'car')

        // Pulsing panic rings around flood-affected agents (drawn beneath the body)
        if (floodedAgents.length > 0) {
          sl.push(new ScatterplotLayer<PedestrianAgent>({
            id: 'pedestrian-agents-panic-ring',
            data: floodedAgents,
            getPosition: (a) => [a.position.lng, a.position.lat, 0.02],
            getRadius: (a) => 0.85 + 0.4 * Math.abs(Math.sin(animationTime * 5 + a.phaseOffsetM)),
            radiusUnits: 'meters',
            getFillColor: [0, 0, 0, 0],
            getLineColor: (a) => {
              const t = Math.min((a.floodDepthM ?? 0) / 0.5, 1)
              const pulse = 0.5 + 0.5 * Math.sin(animationTime * 5 + a.phaseOffsetM)
              return [255, Math.round(180 - t * 150), 20, Math.round(110 + 120 * pulse)] as [number, number, number, number]
            },
            stroked: true,
            filled: false,
            getLineWidth: 2,
            lineWidthUnits: 'pixels',
            pickable: false,
            parameters: { depthCompare: 'always', depthWriteEnabled: false },
            updateTriggers: { getRadius: [animationTime], getLineColor: [animationTime] },
          }))

          sl.push(new TextLayer<PedestrianAgent>({
            id: 'pedestrian-agents-distress-label',
            data: floodedNonCar,
            getPosition: (a) => [a.position.lng, a.position.lat, 0],
            getText: () => '!',
            getColor: (a) => {
              const t = Math.min((a.floodDepthM ?? 0) / 0.5, 1)
              const pulse = 0.5 + 0.5 * Math.sin(animationTime * 5 + a.phaseOffsetM)
              return [255, Math.round(200 - t * 180), 0, Math.round(180 + 75 * pulse)] as [number, number, number, number]
            },
            getSize: 18,
            sizeUnits: 'pixels',
            getTextAnchor: 'middle',
            getAlignmentBaseline: 'bottom',
            getPixelOffset: [0, -14],
            fontWeight: 'bold',
            background: false,
            pickable: false,
            parameters: { depthCompare: 'always', depthWriteEnabled: false },
            updateTriggers: { getColor: [animationTime] },
          }))
        }

        // Vision cones: flat translucent wedge in front of each agent indicating
        // facing / field-of-view. Drawn before the body so the body sits on top.
        const CONE_RANGE_M = 7
        const CONE_HALF_ANGLE_DEG = 28
        const CONE_ARC_SEGMENTS = 10
        sl.push(new SolidPolygonLayer<PedestrianAgent>({
          id: 'pedestrian-agents-vision-cones',
          data: agentsSnapshot,
          getPolygon: (a) => {
            const latRad = (a.position.lat * Math.PI) / 180
            const metersPerDegLat = 111320
            const metersPerDegLng = 111320 * Math.cos(latRad)
            const ring: [number, number][] = [[a.position.lng, a.position.lat]]
            const startDeg = a.heading - CONE_HALF_ANGLE_DEG
            const stepDeg = (CONE_HALF_ANGLE_DEG * 2) / CONE_ARC_SEGMENTS
            for (let i = 0; i <= CONE_ARC_SEGMENTS; i++) {
              const bearingRad = ((startDeg + stepDeg * i) * Math.PI) / 180
              const east = Math.sin(bearingRad) * CONE_RANGE_M
              const north = Math.cos(bearingRad) * CONE_RANGE_M
              ring.push([
                a.position.lng + east / metersPerDegLng,
                a.position.lat + north / metersPerDegLat,
              ])
            }
            return ring
          },
          getFillColor: (a) => {
            const color = getAgentModel(a.kind).map.color
            return [color[0], color[1], color[2], 64]
          },
          filled: true,
          extruded: false,
          pickable: false,
          parameters: { depthCompare: 'always', depthWriteEnabled: false },
        }))

        sl.push(
          // ColumnLayer with diskResolution=4 produces square-prism block figures.
          ...(() => {
            const groups = new Map<string, PedestrianAgent[]>()
            for (const a of agentsSnapshot) {
              const k = a.kind ?? 'walker'
              const list = groups.get(k)
              if (list) list.push(a)
              else groups.set(k, [a])
            }
            const layers: ColumnLayer<PedestrianAgent>[] = []
            for (const [kind, list] of groups.entries()) {
              const model = getAgentModel(kind as AgentKind)
              const style = model.map

              layers.push(new ColumnLayer<PedestrianAgent>({
                id: `pedestrian-agents-${kind}-body`,
                data: list,
                diskResolution: 4,
                radius: style.radius,
                radiusUnits: 'meters',
                extruded: true,
                filled: true,
                stroked: false,
                material: { ambient: 0.55, diffuse: 0.7, shininess: 8 },
                getPosition: (a) => [a.position.lng, a.position.lat, -Math.min((a.floodDepthM ?? 0) * 0.9, style.elevation * 0.8)],
                getElevation: style.elevation,
                elevationScale: 1,
                getFillColor: (a) => {
                  const depth = a.floodDepthM ?? 0
                  if (depth < 0.05) return style.color
                  const t = Math.min(depth / 0.5, 1)
                  return [
                    Math.round(style.color[0] * (1 - t) + 55 * t),
                    Math.round(style.color[1] * (1 - t) + 110 * t),
                    Math.round(style.color[2] * (1 - t) + 240 * t),
                    style.color[3] ?? 240,
                  ] as [number, number, number, number]
                },
                getLineColor: [20, 24, 32, 220],
                angle: 45,
                pickable: false,
              }))

              if (kind !== 'car') {
                const headBase = style.elevation
                const headRadius = style.radius * 0.8
                const headHeight = style.radius * 1.2
                layers.push(new ColumnLayer<PedestrianAgent>({
                  id: `pedestrian-agents-${kind}-head`,
                  data: list,
                  diskResolution: 4,
                  radius: headRadius,
                  radiusUnits: 'meters',
                  extruded: true,
                  filled: true,
                  stroked: false,
                  material: { ambient: 0.6, diffuse: 0.65, shininess: 6 },
                  getPosition: (a) => {
                    const sink = Math.min((a.floodDepthM ?? 0) * 0.9, style.elevation * 0.8)
                    const base = headBase - sink
                    if ((a.floodDepthM ?? 0) < 0.05) return [a.position.lng, a.position.lat, base]
                    const perpRad = (a.heading + 90) * Math.PI / 180
                    const shakeM = Math.sin(animationTime * 11 + a.phaseOffsetM) * 0.1
                    const latRad = a.position.lat * Math.PI / 180
                    const mPerLng = 111320 * Math.cos(latRad)
                    return [
                      a.position.lng + Math.sin(perpRad) * shakeM / mPerLng,
                      a.position.lat + Math.cos(perpRad) * shakeM / 110540,
                      base,
                    ]
                  },
                  getElevation: headHeight,
                  elevationScale: 1,
                  getFillColor: style.headColor,
                  getLineColor: [40, 30, 20, 200],
                  angle: 45,
                  pickable: false,
                  updateTriggers: { getPosition: [animationTime] },
                }))

                if (style.accessory === 'backpack' || style.accessory === 'cargo-box') {
                  layers.push(new ColumnLayer<PedestrianAgent>({
                    id: `pedestrian-agents-${kind}-pack`,
                    data: list,
                    diskResolution: 4,
                    radius: style.radius * (style.accessory === 'cargo-box' ? 0.72 : 0.5),
                    radiusUnits: 'meters',
                    extruded: true,
                    filled: true,
                    stroked: false,
                    getPosition: (a) => offsetAgentPosition(a, 0, -0.62),
                    getElevation: style.accessory === 'cargo-box' ? 0.78 : 0.52,
                    elevationScale: 1,
                    getFillColor: style.accessory === 'cargo-box' ? [245, 245, 220, 245] : [35, 40, 48, 245],
                    angle: 45,
                    pickable: false,
                  }))
                }

                if (style.accessory === 'briefcase' || style.accessory === 'shopping-bag') {
                  layers.push(new ColumnLayer<PedestrianAgent>({
                    id: `pedestrian-agents-${kind}-bag`,
                    data: list,
                    diskResolution: 4,
                    radius: style.radius * 0.42,
                    radiusUnits: 'meters',
                    extruded: true,
                    filled: true,
                    stroked: false,
                    getPosition: (a) => offsetAgentPosition(a, 0.72, -0.08),
                    getElevation: style.accessory === 'shopping-bag' ? 0.48 : 0.38,
                    elevationScale: 1,
                    getFillColor: style.accessory === 'shopping-bag' ? [255, 230, 120, 245] : [24, 24, 28, 245],
                    angle: 45,
                    pickable: false,
                  }))
                }

                if (style.accessory === 'cane') {
                  layers.push(new ColumnLayer<PedestrianAgent>({
                    id: `pedestrian-agents-${kind}-cane`,
                    data: list,
                    diskResolution: 4,
                    radius: 0.11,
                    radiusUnits: 'meters',
                    extruded: true,
                    filled: true,
                    stroked: false,
                    getPosition: (a) => offsetAgentPosition(a, 0.78, 0.08),
                    getElevation: 1.0,
                    elevationScale: 1,
                    getFillColor: [95, 62, 36, 245],
                    angle: 45,
                    pickable: false,
                  }))
                }

                if (style.accessory === 'child-marker') {
                  layers.push(new ColumnLayer<PedestrianAgent>({
                    id: `pedestrian-agents-${kind}-child`,
                    data: list,
                    diskResolution: 4,
                    radius: 0.32,
                    radiusUnits: 'meters',
                    extruded: true,
                    filled: true,
                    stroked: false,
                    getPosition: (a) => offsetAgentPosition(a, -0.92, -0.22),
                    getElevation: 0.68,
                    elevationScale: 1,
                    getFillColor: [255, 150, 80, 245],
                    angle: 45,
                    pickable: false,
                  }))
                }

                if (style.accessory === 'helmet' || style.accessory === 'hard-hat' || style.accessory === 'cap') {
                  layers.push(new ColumnLayer<PedestrianAgent>({
                    id: `pedestrian-agents-${kind}-hat`,
                    data: list,
                    diskResolution: 4,
                    radius: style.radius * 0.72,
                    radiusUnits: 'meters',
                    extruded: true,
                    filled: true,
                    stroked: false,
                    getPosition: (a) => [a.position.lng, a.position.lat, style.elevation + headHeight],
                    getElevation: 0.18,
                    elevationScale: 1,
                    getFillColor: style.accessory === 'hard-hat' ? [255, 214, 64, 250] : style.accessory === 'cap' ? [10, 14, 24, 250] : [35, 40, 48, 250],
                    angle: 45,
                    pickable: false,
                  }))
                }

                if (style.accessory === 'apron' || style.accessory === 'glow') {
                  layers.push(new ColumnLayer<PedestrianAgent>({
                    id: `pedestrian-agents-${kind}-front`,
                    data: list,
                    diskResolution: 4,
                    radius: style.radius * 0.52,
                    radiusUnits: 'meters',
                    extruded: true,
                    filled: true,
                    stroked: false,
                    getPosition: (a) => offsetAgentPosition(a, 0, 0.42),
                    getElevation: 0.68,
                    elevationScale: 1,
                    getFillColor: style.accessory === 'glow' ? [255, 90, 220, 220] : [30, 30, 30, 240],
                    angle: 45,
                    pickable: false,
                  }))
                }
              } else if (kind === 'car') {
                // car has no flood panic arms
                const cabinBase = style.elevation
                layers.push(new ColumnLayer<PedestrianAgent>({
                  id: 'pedestrian-agents-car-cabin',
                  data: list,
                  diskResolution: 4,
                  radius: style.radius * 0.72,
                  radiusUnits: 'meters',
                  extruded: true,
                  filled: true,
                  stroked: false,
                  material: { ambient: 0.5, diffuse: 0.7, shininess: 30 },
                  getPosition: (a) => [a.position.lng, a.position.lat, cabinBase],
                  getElevation: 0.85,
                  elevationScale: 1,
                  getFillColor: style.headColor,
                  getLineColor: [10, 12, 18, 220],
                  angle: 45,
                  pickable: false,
                }))
                const roofBase = cabinBase + 0.85
                layers.push(new ColumnLayer<PedestrianAgent>({
                  id: 'pedestrian-agents-car-roof',
                  data: list,
                  diskResolution: 4,
                  radius: style.radius * 0.6,
                  radiusUnits: 'meters',
                  extruded: true,
                  filled: true,
                  stroked: false,
                  material: { ambient: 0.55, diffuse: 0.7, shininess: 12 },
                  getPosition: (a) => [a.position.lng, a.position.lat, roofBase],
                  getElevation: 0.18,
                  elevationScale: 1,
                  getFillColor: [240, 220, 188, 245],
                  getLineColor: [40, 30, 20, 200],
                  angle: 45,
                  pickable: false,
                }))
              }
            }
            return layers
          })(),
        )

        // Raised panic arms for flood-distressed pedestrians (drawn on top of body layers)
        if (floodedNonCar.length > 0) {
          sl.push(new ColumnLayer<PedestrianAgent>({
            id: 'pedestrian-agents-panic-arm-r',
            data: floodedNonCar,
            diskResolution: 4,
            radius: 0.11,
            radiusUnits: 'meters',
            extruded: true,
            filled: true,
            stroked: false,
            getPosition: (a) => {
              const sink = Math.min((a.floodDepthM ?? 0) * 0.9, 0.65)
              const wave = Math.sin(animationTime * 7 + a.phaseOffsetM) * 0.12
              return offsetAgentPosition(a, 0.5 + wave, 0, 0.52 - sink)
            },
            getElevation: (a) => 0.38 + 0.22 * Math.abs(Math.sin(animationTime * 7 + a.phaseOffsetM)),
            elevationScale: 1,
            getFillColor: (a) => getAgentModel((a.kind ?? 'walker') as AgentKind).map.headColor,
            angle: 45,
            pickable: false,
            updateTriggers: { getPosition: [animationTime], getElevation: [animationTime] },
          }))
          sl.push(new ColumnLayer<PedestrianAgent>({
            id: 'pedestrian-agents-panic-arm-l',
            data: floodedNonCar,
            diskResolution: 4,
            radius: 0.11,
            radiusUnits: 'meters',
            extruded: true,
            filled: true,
            stroked: false,
            getPosition: (a) => {
              const sink = Math.min((a.floodDepthM ?? 0) * 0.9, 0.65)
              const wave = Math.sin(animationTime * 7 + a.phaseOffsetM + Math.PI) * 0.12
              return offsetAgentPosition(a, -0.5 - wave, 0, 0.52 - sink)
            },
            getElevation: (a) => 0.38 + 0.22 * Math.abs(Math.sin(animationTime * 7 + a.phaseOffsetM + Math.PI)),
            elevationScale: 1,
            getFillColor: (a) => getAgentModel((a.kind ?? 'walker') as AgentKind).map.headColor,
            angle: 45,
            pickable: false,
            updateTriggers: { getPosition: [animationTime], getElevation: [animationTime] },
          }))
        }
      }

      // Singapore live OOH inventory
      if (showSgOoh && sgOohAssets.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sl = base as any[]
        sl.push(...makeSingaporeOohLayers(sgOohAssets, selectedSgOohId, setSelectedSgOohId))
      }

      // Sighting highlight: animated beam + agent ring + billboard ring
      if (sightingNotifications.length > 0) {
        const pulse = 0.5 + 0.5 * Math.sin(animationTime * 5)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sl = base as any[]
        sl.push(
          new PathLayer<BillboardSighting>({
            id: 'sighting-beams',
            data: sightingNotifications,
            getPath: (n) => [
              [n.agentPosition.lng, n.agentPosition.lat, 0],
              [n.billboardPosition.lng, n.billboardPosition.lat, 0],
            ],
            getColor: () => [73, 145, 255, Math.round(100 + 120 * pulse)],
            getWidth: 2,
            widthUnits: 'pixels',
          }),
          new ScatterplotLayer<BillboardSighting>({
            id: 'sighting-agent-rings',
            data: sightingNotifications,
            getPosition: (n) => [n.agentPosition.lng, n.agentPosition.lat, 0],
            getRadius: 3 + 2 * pulse,
            radiusUnits: 'meters',
            getFillColor: [0, 0, 0, 0],
            getLineColor: () => [73, 145, 255, Math.round(180 + 75 * pulse)],
            stroked: true,
            filled: false,
            getLineWidth: 2,
            lineWidthUnits: 'pixels',
          }),
          new ScatterplotLayer<BillboardSighting>({
            id: 'sighting-billboard-rings',
            data: sightingNotifications,
            getPosition: (n) => [n.billboardPosition.lng, n.billboardPosition.lat, 0],
            getRadius: 5 + 3 * pulse,
            radiusUnits: 'meters',
            getFillColor: () => [73, 145, 255, Math.round(30 + 40 * pulse)],
            getLineColor: () => [73, 200, 255, Math.round(200 + 55 * pulse)],
            stroked: true,
            filled: true,
            getLineWidth: 2,
            lineWidthUnits: 'pixels',
          }),
        )
      }

      // 3D void mask — rendered last so it covers all Deck.gl layers outside the selection
      const withMask = isLassoModeActive && lassoPoints.length > 0 && hasFinishedLasso
        ? [...base, makeLassoSelectionMaskLayer(lassoPoints)]
        : base

      // When a country ISO is set the Mapbox country layer handles the selected-country highlight.
      if (!focusArea || countryIso) return withMask

      const center: [number, number] = [focusArea.lng, focusArea.lat]
      const ring = new PathLayer({
        id: 'focus-ring',
        data: [{ path: makeCircleCoords(center, 2) }],
        getPath: (d: { path: [number, number][] }) => d.path,
        getColor: [208, 32, 32, 220],
        getWidth: 3,
        widthUnits: 'pixels',
      })

      return [...withMask, ring]
    },
    [
      agentsSnapshot,
      animationTime,
      billboards,
      buildings,
      countryIso,
      cursorBillboard,
      cursorBusStop,
      focusArea,
      floodScenario,
      floodScenarioVisible,
      handlePickOohBillboard,
      handleSelectFloodReport,
      handleSelectSuggestion,
      selectedSuggestionId,
      simulationSuggestions,
      mapZoom,
      oohBillboards,
      oohPoints,
      plannerInterventions,
      selectedArea,
      selectedBillboardId,
      selectedOohPointId,
      selectedSgOohId,
      sgOohAssets,
      showSgOoh,
      showTrafficLines,
      sightingNotifications,
      streetFixtures,
      trafficPhaseTime,
      trafficPoints,
      roads,
      isLassoModeActive,
      lassoPoints,
    ]
  )

  useEffect(() => {
    let animationFrame = 0
    let prevTime = performance.now()
    const startedAt = prevTime

    const tick = () => {
      const now = performance.now()
      const dt = Math.min((now - prevTime) / 1000, 0.05)
      prevTime = now

      if (agentsRef.current.length > 0) {
        const floodStart = floodAnimStartTimeRef.current
        const currentAnimTime = (now - startedAt) / 1000
        if (floodStart !== null && (currentAnimTime - floodStart) >= 16) {
          agentsRef.current = preFloodAgentsRef.current.length > 0 ? preFloodAgentsRef.current : []
          behaviorsRef.current = preFloodBehaviorsRef.current.length > 0 ? preFloodBehaviorsRef.current : []
          preFloodAgentsRef.current = []
          preFloodBehaviorsRef.current = []
        } else {
          const center = contextAreaRef.current
          const result = tickAgents(agentsRef.current, behaviorsRef.current, dt, center, 80, roadsRef.current, floodCellsRef.current)
          const isInsideSelection = selectionBoundaryRef.current
          if (isInsideSelection) {
            const agents: PedestrianAgent[] = []
            const behaviors: AgentBehavior[] = []
            for (let i = 0; i < result.agents.length; i++) {
              const behavior = result.behaviors[i]
              if (!behavior || !isInsideSelection(result.agents[i].position)) continue
              agents.push(result.agents[i])
              behaviors.push(behavior)
            }
            agentsRef.current = agents
            behaviorsRef.current = behaviors
          } else {
            agentsRef.current = result.agents
            behaviorsRef.current = result.behaviors
          }
        }

        // Billboard sighting detection
        const activeCooldowns = new Set<string>()
        for (const [key, lastSeen] of Object.entries(sightingCooldownRef.current)) {
          if (now - lastSeen < SIGHTING_COOLDOWN_MS) activeCooldowns.add(key)
        }
        const newSightings = detectBillboardSightings(agentsRef.current, billboardsRef.current, oohPointsRef.current, activeCooldowns)
        if (newSightings.length > 0) {
          for (const s of newSightings) {
            sightingCooldownRef.current[`${s.agentId}:${s.billboardId}`] = now
          }
          setSightingNotifications(prev => [
            ...prev,
            ...newSightings.map(s => {
              const ag = agentsRef.current.find(a => a.id === s.agentId)
              const bb = billboardsRef.current.find(b => b.id === s.billboardId)
              return {
                id: `${s.agentId}-${s.billboardId}-${now}`,
                agentId: s.agentId,
                agentName: s.agentName,
                billboardName: s.billboardName,
                agentPosition: ag?.position ?? { lat: 0, lng: 0 },
                billboardPosition: bb?.position ?? { lat: 0, lng: 0 },
                timestamp: now,
              }
            }),
          ])

          // Queue managed-agent interviews for each new sighting
          for (const s of newSightings) {
            pendingInterviewsRef.current.push({
              agentId: s.agentId,
              agentName: s.agentName,
              billboardId: s.billboardId,
              billboardName: s.billboardName,
            })
          }

          // First-person captures: snapshot + AI thought + photoreal render for each new sighting
          for (const s of newSightings) {
            const agent = agentsRef.current.find(a => a.id === s.agentId)
            const billboard = billboardsRef.current.find(b => b.id === s.billboardId)
            const oohPt = oohPointsRef.current.find(p => p.id === s.billboardId)
            if (!agent || (!billboard && !oohPt) || (!GOOGLE_MAPS_KEY && !MAPBOX_TOKEN)) continue

            const captureId = `${s.agentId}-${s.billboardId}-${Math.floor(now)}`
            const bbPos = billboard?.position ?? oohPt?.position
            const headingOffset = captureHeadingOffset(captureId)
            const streetViewImageUrl = pedestrianStreetViewCaptureUrl(agent.position, bbPos, agent.heading, headingOffset)
            const streetViewEmbedUrl = pedestrianStreetViewEmbedUrl(agent.position, bbPos, agent.heading, headingOffset)
            const fallbackImageUrl = pedestrianMapboxCaptureUrl(agent.position, bbPos, agent.heading, headingOffset) || undefined
            const imageUrl = fallbackImageUrl ?? streetViewImageUrl
            if (!imageUrl) continue
            const agentPosForResolve = agent.position
            const headingForResolve = agent.heading
            const captureHeading = normalizeHeading((bbPos ? bearingBetween(agent.position, bbPos) : agent.heading) + headingOffset)
            const billboardOverlay = makeCaptureBillboardOverlay(agent.position, billboard, oohPt, captureHeading)

            // Start with the Mapbox fallback when available, then upgrade to a
            // confirmed Street View pano. This avoids browser 403s when the
            // Street View Static API is not enabled on the Google project.
            resolveStreetViewCaptureUrl(agentPosForResolve, bbPos, headingForResolve, headingOffset).then(resolved => {
              if (!resolved) return
              setAgentCaptures(prev => prev.map(c => c.id === captureId ? { ...c, imageUrl: resolved } : c))
            })

            // Add capture immediately so the photo appears right away
            // Mark photorealPending only when there is a billboard creative to render
            const hasBillboardCreative = ENABLE_PHOTOREAL_RENDER && !!(billboard?.mediaUrl || billboard?.creativeText)
            setAgentCaptures(prev => [
              {
                id: captureId,
                agentName: s.agentName,
                agentKind: agent.kind,
                billboardName: s.billboardName,
                imageUrl,
                streetViewEmbedUrl,
                fallbackImageUrl,
                billboardOverlay,
                thought: null,
                timestamp: now,
                photorealPending: hasBillboardCreative,
              },
              ...prev,
            ])

            // Fetch AI thought and patch it in when ready
            const billboardCreativeText = billboard?.creativeText ?? null
            const billboardFormat = billboard?.format ?? null
            const previousThoughts = agentCapturesRef.current
              .map(capture => capture.thought)
              .filter((thought): thought is string => typeof thought === 'string' && thought.trim().length > 0)
            fetch('/api/agent-reaction', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                agentName: s.agentName,
                agentKind: agent.kind,
                billboardName: s.billboardName,
                creativeText: billboardCreativeText,
                format: billboardFormat,
                previousThoughts,
              }),
            })
              .then(r => r.json())
              .then((data: Pick<AgentCapture, 'thought' | 'qualitativeInsight'>) => {
                const thought = data.thought ?? 'Interesting...'
                setAgentCaptures(prev => {
                  const uniqueThought = uniqueThoughtForState(thought, prev, captureId)
                  const qualitativeInsight = data.qualitativeInsight
                    ? { ...data.qualitativeInsight, quote: uniqueThought }
                    : undefined
                  return prev.map(c => c.id === captureId ? { ...c, thought: uniqueThought, qualitativeInsight } : c)
                })
              })
              .catch(() => {
                setAgentCaptures(prev => {
                  const uniqueThought = uniqueThoughtForState('I noticed it, but only for a second.', prev, captureId)
                  return prev.map(c => c.id === captureId ? { ...c, thought: uniqueThought } : c)
                })
              })

            // ── Photoreal render + analysis pipeline ────────────────────────────────────────
            // Only run when the sighting is for a user-placed billboard that has a creative.
            if (hasBillboardCreative && billboard) {
              // Step 1: Proxy the street-view image to a base64 data URL (server-side fetch
              //         avoids CORS issues with the Google Street View Static API).
              const fallbackImageUrl = pedestrianMapboxCaptureUrl(agent.position, bbPos, agent.heading, headingOffset)
              fetchCaptureWithFallback(streetViewImageUrl, fallbackImageUrl)
                .then(capture => {
                  if (capture.usedFallback) {
                    setAgentCaptures(prev => prev.map(c => c.id === captureId ? { ...c, imageUrl: capture.imageUrl } : c))
                  }
                  return capture.dataUrl
                })
                .then(async sceneDataUrl => {
                  // Step 2: Compute pedestrian-to-billboard distance for the prompt
                  const lngScale = 111320 * Math.cos(agent.position.lat * Math.PI / 180)
                  const dx = (billboard.position.lng - agent.position.lng) * lngScale
                  const dy = (billboard.position.lat - agent.position.lat) * 110540
                  const distanceM = Math.sqrt(dx * dx + dy * dy)

                  // Step 3: Call /api/photoreal-scene
                  const photorealRes = await fetch('/api/photoreal-scene', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                      sceneImage: { dataUrl: sceneDataUrl },
                      billboard: {
                        name: billboard.name,
                        widthM: billboard.widthM,
                        heightM: billboard.heightM,
                        clearanceM: billboard.clearanceM,
                        heading: billboard.heading,
                        distanceM,
                        creativeText: billboard.creativeText,
                        mediaUrl: billboard.mediaUrl,
                      },
                      brief: `Evaluate billboard "${billboard.name}" as seen by pedestrian ${s.agentName}.`,
                      viewerProfile: 'urban pedestrian with short dwell time and partial phone distraction',
                    }),
                  })

                  if (!photorealRes.ok) {
                    const errData = await photorealRes.json() as { error?: string }
                    throw new Error(errData.error ?? `photoreal-scene returned ${photorealRes.status}`)
                  }

                  const photorealData = await photorealRes.json() as PhotorealSceneApiResponse

                  // Patch the capture with the rendered image and analysis
                  setAgentCaptures(prev => prev.map(c =>
                    c.id === captureId
                      ? {
                          ...c,
                          photorealImageUrl: photorealData.photorealImageUrl,
                          photorealAnalysis: photorealData.analysis,
                          photorealPending: false,
                        }
                      : c
                  ))
                })
                .catch((err: unknown) => {
                  const message = err instanceof Error ? err.message : String(err)
                  setAgentCaptures(prev => prev.map(c =>
                    c.id === captureId
                      ? { ...c, photorealPending: false, photorealError: message }
                      : c
                  ))
                })
            }
          }
        }
      }

      setAnimationTime((now - startedAt) / 1000)
      setAgentsSnapshot(agentsRef.current.length > 0 ? [...agentsRef.current] : [])
      animationFrame = window.requestAnimationFrame(tick)
    }

    tick()

    return () => {
      window.cancelAnimationFrame(animationFrame)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { billboardsRef.current = billboards }, [billboards])
  useEffect(() => { oohPointsRef.current = oohPoints }, [oohPoints])

  // Apply any creative generated on the company-fetch page to existing + future billboards
  useEffect(() => {
    try {
      const pending = localStorage.getItem('faultline:pending-creative')
      if (pending) {
        setAppliedCreative(pending)
        setBillboards(current => current.map(b => ({ ...b, mediaUrl: pending })))
        localStorage.removeItem('faultline:pending-creative')
      }
    } catch { /* storage unavailable */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (sightingNotifications.length === 0) return
    const oldest = Math.min(...sightingNotifications.map(n => n.timestamp))
    const delay = Math.max(SIGHTING_DISPLAY_MS - (performance.now() - oldest), 0)
    const timer = setTimeout(() => {
      const cutoff = performance.now() - SIGHTING_DISPLAY_MS
      setSightingNotifications(prev => prev.filter(n => n.timestamp > cutoff))
    }, delay)
    return () => clearTimeout(timer)
  }, [sightingNotifications])

  useEffect(() => {
    if (!mapInstance) return

    const updateBbox = () => {
      setOohBbox(getMapBbox(mapInstance))
    }

    updateBbox()
    mapInstance.on('moveend', updateBbox)

    return () => {
      mapInstance.off('moveend', updateBbox)
    }
  }, [mapInstance])

  // Track zoom for Singapore OOH label visibility
  useEffect(() => {
    if (!mapInstance) return
    const onZoom = () => setMapZoom(mapInstance.getZoom())
    mapInstance.on('zoom', onZoom)
    return () => { mapInstance.off('zoom', onZoom) }
  }, [mapInstance])

  // Fetch Singapore live OOH inventory on demand (cached server-side for 1h)
  useEffect(() => {
    if (!showSgOoh || sgOohAssets.length > 0) return
    const controller = new AbortController()
    setSgOohStatus('Fetching Singapore OOH inventory...')
    fetch('/api/ooh-singapore', { signal: controller.signal })
      .then(async res => {
        if (!res.ok) throw new Error(`Singapore OOH API returned ${res.status}`)
        const data = await res.json() as { assets: SingaporeOohAsset[]; count: number; sources?: { osm: number; lta: number } }
        setSgOohAssets(data.assets)
        const src = data.sources ? ` (OSM: ${data.sources.osm}, LTA: ${data.sources.lta})` : ''
        setSgOohStatus(`${data.count.toLocaleString()} assets loaded${src}`)
      })
      .catch(err => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setSgOohStatus(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      })
    return () => abortQuietly(controller, 'singapore ooh layer changed')
  }, [showSgOoh, sgOohAssets.length])

  useEffect(() => {
    if (!oohBbox) return

    const controller = new AbortController()
    const params = new URLSearchParams({
      bbox: oohBbox,
      limit: String(OOH_POINT_LIMIT),
      includeSourceUrls: 'true',
    })

    setOohStatus('Loading OOH inventory in view...')

    fetch(`/api/ooh-map?${params.toString()}`, { signal: controller.signal })
      .then(async res => {
        if (!res.ok) throw new Error(`OOH inventory failed with status ${res.status}`)
        return await res.json() as OohMapApiResponse
      })
      .then(data => {
        const labels = getMediaTypeLabels(data.metadata.media_type_codes)
        const points = data.points.map(point => toOohMapPoint(point, labels))

        setOohPoints(points)
        setOohSourceUrls(data.source_urls ?? [])
        setOohTotalPoints(data.metadata.total_points)
        setOohDataReady(true)
        setSelectedOohPointId(current => current && points.some(point => point.id === current) ? current : null)
        setOohStatus(points.length > 0
          ? `${points.length.toLocaleString()} of ${data.metadata.total_points.toLocaleString()} OOH locations in view${data.metadata.limited ? ' (limited)' : ''}`
          : 'No OOH locations in this viewport')
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setOohPoints([])
        setSelectedOohPointId(null)
        setOohStatus(error instanceof Error ? error.message : 'OOH inventory unavailable')
      })

    return () => abortQuietly(controller, 'ooh bounds changed')
  }, [oohBbox])

  useEffect(() => {
    const controller = new AbortController()

    setBuildingStatus('Loading global city context...')
    setStreetFixtureStatus('Loading street fixtures...')
    setCityEnrichmentStatus('Loading global city context...')
    setBuildingsDataReady(false)
    setFixturesDataReady(false)

    fetch('/api/city-enrichment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat: contextArea.lat,
        lng: contextArea.lng,
        radiusKm: ENRICHMENT_RADIUS_KM,
        mode: 'auto',
      }),
      signal: controller.signal,
    })
      .then(async res => {
        if (!res.ok) throw new Error(`City enrichment failed with status ${res.status}`)
        return await res.json() as CityEnrichmentResponse
      })
      .then(data => {
        setBuildings(data.buildings)
        setStreetFixtures(data.streetFixtures)
        setWaterBodies(data.waterBodies)
        setCityTrafficPoints(data.trafficPoints)
        setCityRoads(data.roads)
        setWeatherContext(data.weather)
        setBuildingsDataReady(true)
        setFixturesDataReady(true)

        const styledBuildingCount = data.buildings.filter(building => building.poiCategory).length
        const sourceLabel = data.metadata.mode === 'overture' ? 'Overture' : 'OSM'
        const weatherLabel = data.weather ? `, ${data.weather.summary.toLowerCase()}` : ''
        setBuildingStatus(data.buildings.length > 0
          ? `${data.buildings.length} ${sourceLabel} buildings, ${styledBuildingCount} POI-tagged${weatherLabel}`
          : `No editable buildings nearby; using Mapbox buildings${weatherLabel}`)

        const counts = data.streetFixtures.reduce<Record<string, number>>((acc, f) => {
          acc[f.kind] = (acc[f.kind] ?? 0) + 1
          return acc
        }, {})
        const summary = Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([kind, n]) => `${n} ${kind}`)
          .join(', ')
        setStreetFixtureStatus(data.streetFixtures.length > 0 ? summary : 'No street fixtures found')
        setCityEnrichmentStatus(`${data.places.length} places, ${data.transitNodes.length} transit nodes, ${data.vegetation.length} green features`)
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setBuildings([])
        setStreetFixtures([])
        setWaterBodies([])
        setCityTrafficPoints([])
        setCityRoads([])
        setWeatherContext(null)
        setBuildingsDataReady(true)
        setFixturesDataReady(true)
        setBuildingStatus('City enrichment unavailable; using Mapbox buildings')
        setStreetFixtureStatus('Street fixture lookup unavailable')
        setCityEnrichmentStatus(error instanceof Error ? error.message : 'City enrichment unavailable')
      })

    return () => abortQuietly(controller, 'city context changed')
  }, [contextArea.lat, contextArea.lng])

  useEffect(() => {
    const id = setInterval(() => setTrafficPhaseTime(Math.floor(Date.now() / 1000)), 500)
    return () => clearInterval(id)
  }, [])

  const selectedAreaLat = selectedArea?.lat
  const selectedAreaLng = selectedArea?.lng

  useEffect(() => {
    const area = selectedAreaLat !== undefined && selectedAreaLng !== undefined
      ? { lat: selectedAreaLat, lng: selectedAreaLng }
      : mapStyleReady
        ? FALLBACK_AREA
        : null
    if (!area || !mapStyleReady) return
    const controller = new AbortController()
    setTrafficStatus(selectedAreaLat !== undefined && selectedAreaLng !== undefined
      ? 'Calculating Mapbox paths...'
      : 'Loading traffic context...')

    const loadTraffic = async () => {
      const selectionCenter = selectedAreaLat !== undefined && selectedAreaLng !== undefined ? area : null
      const mapboxMap = configuredMapRef.current
      const tileRoads = mapboxMap ? roadsFromMapboxTiles(mapboxMap, selectionCenter) : []
      if (selectionCenter && tileRoads.length === 0 && !controller.signal.aborted) {
        setTrafficStatus('Loading paths in selection...')
      }
      const fallbackRoads = tileRoads.length === 0
        ? (cityRoads.length > 0
            ? cityRoads
            : selectionCenter
              ? await fetchFallbackRoadsInRadius(selectionCenter, ENRICHMENT_RADIUS_KM, controller.signal)
              : [])
        : []
      const tilePois  = mapboxMap ? trafficFromMapboxTiles(mapboxMap) : []
      let ltaPois: TrafficPoint[] = []

      if (countryIso === 'SG' && !selectionCenter) {
        try {
          const bbox = mapboxMap ? getMapBbox(mapboxMap) : null
          const params = new URLSearchParams({ limit: '2500' })
          if (bbox) params.set('bbox', bbox)
          const res = await fetch(`/api/foot-traffic/singapore?${params.toString()}`, {
            signal: controller.signal,
          })
          if (res.ok) {
            const data = await res.json() as { points?: TrafficPoint[] }
            ltaPois = Array.isArray(data.points) ? data.points : []
          }
        } catch (error) {
          if (!(error instanceof DOMException && error.name === 'AbortError')) {
            ltaPois = []
          }
        }
      }

      if (controller.signal.aborted) return

      const finalPois = selectionCenter
        ? cityTrafficPoints
        : ltaPois.length > 0
        ? ltaPois
        : tilePois.length > 0
          ? tilePois
          : cityTrafficPoints
      const finalRoads = !selectionCenter && ltaPois.length > 0
        ? boostRoadsWithTrafficPoints(tileRoads, ltaPois)
        : tileRoads.length > 0
          ? tileRoads
          : fallbackRoads
      const diversifiedRoads = diversifyRoadTraffic(finalRoads, buildingsRef.current, streetFixtures)

      setRoads(diversifiedRoads)
      setTrafficPoints(finalPois)
      setTrafficStatus(selectionCenter
        ? tileRoads.length > 0
          ? `${diversifiedRoads.length} inferred activity paths in selection`
          : fallbackRoads.length > 0
            ? `${diversifiedRoads.length} OSM activity paths in selection`
            : 'No paths found in selection'
        : ltaPois.length > 0
        ? `${ltaPois.length} LTA bus footfall points`
        : cityTrafficPoints.length > 0
          ? `${cityTrafficPoints.length} inferred global activity points`
        : diversifiedRoads.length > 0
          ? `${diversifiedRoads.length} inferred activity roads`
          : 'No traffic roads available')
    }

    void loadTraffic()

    return () => abortQuietly(controller, 'traffic query changed')
  }, [cityRoads, cityTrafficPoints, countryIso, selectedAreaLat, selectedAreaLng, mapStyleReady, streetFixtures])

  // Spawn pedestrians along the selected area's foot-traffic lines.
  // spawnAgentsOnRoads weights each road by `road.weight^2`, so red (busy) lines
  // receive visibly more agents than green (quiet) ones.
  useEffect(() => {
    if (selectedAreaLat === undefined || selectedAreaLng === undefined) {
      agentsRef.current = []
      behaviorsRef.current = []
      setAgentsSnapshot([])
      return
    }
    if (roads.length === 0) return

    const isInsideSelection = selectionBoundaryRef.current
    if (!isInsideSelection) return

    const roadIntersectsSelection = (road: RoadSegment): boolean => {
      const { path } = road
      for (let i = 0; i < path.length; i++) {
        if (isInsideSelection(path[i])) return true
        if (i < path.length - 1) {
          const p1 = path[i], p2 = path[i + 1]
          for (const t of [0.25, 0.5, 0.75]) {
            if (isInsideSelection({ lat: p1.lat + (p2.lat - p1.lat) * t, lng: p1.lng + (p2.lng - p1.lng) * t })) return true
          }
        }
      }
      return false
    }
    const selectedRoads = roads.filter(roadIntersectsSelection)
    const selectedTrafficPoints = trafficPoints.filter(point => isInsideSelection(point.position))
    if (selectedRoads.length === 0) {
      agentsRef.current = []
      behaviorsRef.current = []
      setAgentsSnapshot([])
      return
    }

    const target = 2000
    const { agents, behaviors } = spawnAgentsOnRoads(
      selectedRoads,
      selectedTrafficPoints,
      target,
      buildingsRef.current,
      isInsideSelection,
    )
    agentsRef.current = agents
    behaviorsRef.current = behaviors
    setAgentsSnapshot([...agents])
  }, [selectedAreaLat, selectedAreaLng, roads, trafficPoints, isLassoModeActive, lassoPoints])

  useEffect(() => {
    let raf: number
    let frames = 0
    let last = performance.now()

    const tick = () => {
      frames++
      const now = performance.now()
      if (now - last >= 500) {
        setFps(Math.round((frames * 1000) / (now - last)))
        setPedestrianCount(prev => {
          const next = agentsRef.current.length
          return next === prev ? prev : next
        })
        frames = 0
        last = now
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const handleMapReady = useCallback((event: { target: mapboxgl.Map }) => {
    const map = event.target
    setMapInstance(map)
    if (configuredMapRef.current === map) return
    configuredMapRef.current = map

    let didMarkReady = false

    const markReady = () => {
      if (didMarkReady) return
      didMarkReady = true
      applyStandardStyleConfig(map)
      setMapStyleReady(true)
    }

    const setup = () => {
      applyStandardStyleConfig(map)

      map.once('idle', markReady)
      window.setTimeout(markReady, 2500)
    }

    if (map.isStyleLoaded()) setup()
    else map.once('style.load', setup)
    window.setTimeout(markReady, 3500)
  }, [])

  useEffect(() => {
    let raf = 0

    const configureWhenAvailable = () => {
      const map = mapRef.current?.getMap()
      if (map) {
        handleMapReady({ target: map })
        return
      }
      raf = requestAnimationFrame(configureWhenAvailable)
    }

    configureWhenAvailable()
    return () => cancelAnimationFrame(raf)
  }, [handleMapReady])

  useEffect(() => {
    if (!mapInstance) return
    applyStandardStyleConfig(mapInstance)
  }, [mapInstance])

  useEffect(() => {
    if (!mapInstance || !weatherContext) return
    const preset = weatherContext.lighting === 'night'
      ? 'night'
      : weatherContext.lighting === 'day'
        ? 'day'
        : 'dusk'
    try {
      mapInstance.setConfigProperty('basemap', 'lightPreset', preset)
    } catch {
      // Keep weather enrichment non-blocking if this style version omits the option.
    }
  }, [mapInstance, weatherContext])

  // Hide all Mapbox 3D geometry when custom deck.gl buildings are active.
  // show3dLandmarks covers things like Marina Bay Sands which otherwise bleed
  // through as colorful Mapbox-textured triangles even when show3dBuildings=false.
  useEffect(() => {
    if (!mapInstance) return
    const show = !selectedArea
    for (const prop of ['show3dBuildings', 'show3dFacades', 'show3dObjects', 'show3dLandmarks', 'show3dTrees']) {
      try {
        mapInstance.setConfigProperty('basemap', prop, show)
      } catch {
        // Non-blocking if style version omits this option.
      }
    }
  }, [mapInstance, selectedArea, weatherContext])

  const addBillboardAt = useCallback((position: LatLng, heading?: number, id?: string) => {
    const nextId = id ?? `bb-${Date.now()}`
    const nextBillboard: BillboardPlacement = {
      id: nextId,
      name: `Billboard ${billboards.length + 1}`,
      position,
      widthM: 12,
      heightM: 5,
      clearanceM: 6,
      heading: heading ?? 90,
      format: 'digital',
      material: 'digital-day',
      creativeText: 'NEW LAUNCH',
      primaryColor: '#ffcf5c',
      secondaryColor: '#111318',
      brightness: 75,
      weeklyReach: 64000,
      mediaUrl: appliedCreative,
    }

    setBillboards(current => [...current, nextBillboard])
    setSelectedBillboardId(nextId)
  }, [billboards.length, appliedCreative])

  const updateBillboard = useCallback((id: string, patch: Partial<BillboardPlacement>) => {
    setBillboards(current => current.map(billboard =>
      billboard.id === id ? { ...billboard, ...patch } : billboard
    ))
  }, [])

  const applyOptimizedCreativeToSelectedBillboard = useCallback((creativeUrl: string) => {
    const targetId = selectedBillboardId ?? billboardsRef.current[0]?.id
    if (!targetId) return
    updateBillboard(targetId, {
      mediaUrl: creativeUrl,
      creativeText: 'GPT IMAGE 2 FIX',
    })
    setSelectedBillboardId(targetId)
  }, [selectedBillboardId, updateBillboard])

  const duplicateBillboard = useCallback((id: string) => {
    setBillboards(current => {
      const source = current.find(billboard => billboard.id === id)
      if (!source) return current

      const duplicate: BillboardPlacement = {
        ...source,
        id: `bb-${Date.now()}`,
        name: `${source.name} Copy`,
        position: {
          lat: source.position.lat + 0.00018,
          lng: source.position.lng + 0.00018,
        },
      }

      setSelectedBillboardId(duplicate.id)
      return [...current, duplicate]
    })
  }, [])

  const deleteBillboard = useCallback((id: string) => {
    setBillboards(current => {
      const next = current.filter(billboard => billboard.id !== id)
      setSelectedBillboardId(selectedBillboardId === id ? (next[0]?.id ?? null) : selectedBillboardId)
      return next
    })
  }, [selectedBillboardId])

  const addBusStopAt = useCallback((position: LatLng) => {
    const nextFixture: StreetFixture = {
      id: `placed-bus-stop-${Date.now()}`,
      kind: 'bus-stop',
      position,
      name: 'Placed Bus Stop',
    }

    setStreetFixtures(current => [...current, nextFixture])
  }, [])

  const addPedestrianAt = useCallback((position: LatLng) => {
    const isInsideSelection = selectionBoundaryRef.current
    if (!isInsideSelection || !isInsideSelection(position)) return

    const id = `placed-pedestrian-${Date.now()}`
    const kind = pickRandomPedestrianKind()
    const model = getAgentModel(kind)
    const agent: PedestrianAgent = {
      id,
      name: pickAgentName(id),
      position,
      heading: Math.random() * 360,
      speedMps: model.speed[0] + Math.random() * (model.speed[1] - model.speed[0]),
      phaseOffsetM: Math.random() * 14,
      visual: 'walker',
      kind,
    }

    agentsRef.current = [...agentsRef.current, agent]
    behaviorsRef.current = [...behaviorsRef.current, createBehavior(agent.id)]
    setHasCrowd(true)
    mapInstance?.triggerRepaint()
  }, [mapInstance])

  const runAgentBillboardCapture = useCallback(async (agentPosition: LatLng) => {
    if (isAgentShotRunning) return
    if (!GOOGLE_MAPS_KEY && !MAPBOX_TOKEN) {
      setAgentShotError(true)
      setAgentShotStatus('Street View credentials are missing.')
      return
    }

    const candidates = [...billboardsRef.current, ...oohBillboards]
      .map(billboard => ({
        billboard,
        distanceM: haversineKm(agentPosition, billboard.position) * 1000,
      }))
      .sort((a, b) => a.distanceM - b.distanceM)

    const selectedCandidate = selectedBillboardId
      ? candidates.find(candidate => candidate.billboard.id === selectedBillboardId)
      : null
    const target = selectedCandidate && selectedCandidate.distanceM <= 1000
      ? selectedCandidate
      : candidates[0]

    if (!target || target.distanceM > 1000) {
      setAgentShotError(true)
      setAgentShotStatus('No billboard within 1 km of that viewer spot.')
      return
    }

    const captureId = `agent-shot-${target.billboard.id}-${Date.now()}`
    const agentName = 'Picked Agent'
    const headingOffset = captureHeadingOffset(captureId)
    const captureHeading = normalizeHeading(bearingBetween(agentPosition, target.billboard.position) + headingOffset)
    const streetViewImageUrl = pedestrianStreetViewCaptureUrl(agentPosition, target.billboard.position, captureHeading, headingOffset)
    const streetViewEmbedUrl = pedestrianStreetViewEmbedUrl(agentPosition, target.billboard.position, captureHeading, headingOffset)
    const fallbackImageUrl = pedestrianMapboxCaptureUrl(agentPosition, target.billboard.position, captureHeading, headingOffset)
    const imageUrl = fallbackImageUrl || streetViewImageUrl
    if (!imageUrl) {
      setAgentShotError(true)
      setAgentShotStatus('Could not build a Street View capture URL.')
      return
    }

    setIsAgentShotRunning(true)
    setAgentShotError(false)
    setAgentShotStatus(`Capturing ${agentName} view of ${target.billboard.name}...`)
    setSightingNotifications(prev => [
      {
        id: captureId,
        agentId: captureId,
        agentName,
        billboardName: target.billboard.name,
        agentPosition,
        billboardPosition: target.billboard.position,
        timestamp: performance.now(),
      },
      ...prev,
    ])
    setAgentCaptures(prev => [
      {
        id: captureId,
        agentName,
        agentKind: 'walker',
        billboardName: target.billboard.name,
        imageUrl,
        streetViewEmbedUrl,
        fallbackImageUrl,
        billboardOverlay: makeCaptureBillboardOverlay(agentPosition, target.billboard, undefined, captureHeading),
        thought: 'Manual viewer spot selected.',
        timestamp: performance.now(),
        photorealPending: ENABLE_PHOTOREAL_RENDER,
      },
      ...prev,
    ])

    try {
      const resolvedStreetViewUrl = await resolveStreetViewCaptureUrl(
        agentPosition,
        target.billboard.position,
        captureHeading,
        headingOffset,
      )
      if (resolvedStreetViewUrl) {
        setAgentCaptures(prev => prev.map(c => c.id === captureId ? { ...c, imageUrl: resolvedStreetViewUrl } : c))
      }
      const captureUrl = resolvedStreetViewUrl ?? imageUrl
      const capture = await fetchCaptureWithFallback(captureUrl, fallbackImageUrl)
      if (capture.usedFallback) {
        setAgentCaptures(prev => prev.map(c => c.id === captureId ? { ...c, imageUrl: capture.imageUrl } : c))
      }
      const sceneDataUrl = capture.dataUrl
      if (!ENABLE_PHOTOREAL_RENDER) {
        setAgentCaptures(prev => prev.map(c =>
          c.id === captureId
            ? {
                ...c,
                photorealImageUrl: sceneDataUrl,
                photorealPending: false,
                thought: capture.usedFallback
                  ? 'Captured Mapbox fallback view. Photoreal rendering is disabled.'
                  : 'Captured Street View. Photoreal rendering is disabled.',
              }
            : c
        ))
        setAgentShotStatus(capture.usedFallback
          ? 'Captured fallback view. Photoreal rendering disabled.'
          : 'Captured agent view. Photoreal rendering disabled.')
        return
      }

      setAgentShotStatus(`Rendering photoreal Street View from ${agentName} side...`)

      const creativeDataUrl = target.billboard.mediaUrl ? undefined : createGeneratedCreativeDataUrl(target.billboard)
      if (!target.billboard.mediaUrl && !creativeDataUrl) {
        throw new Error('Could not generate a billboard creative image.')
      }

      const res = await fetch('/api/photoreal-scene', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sceneImage: { dataUrl: sceneDataUrl },
          billboard: {
            name: target.billboard.name,
            widthM: target.billboard.widthM,
            heightM: target.billboard.heightM,
            clearanceM: target.billboard.clearanceM,
            heading: target.billboard.heading,
            distanceM: target.distanceM,
            creativeText: target.billboard.creativeText || target.billboard.name,
            mediaUrl: target.billboard.mediaUrl,
            creativeDataUrl,
          },
          environment: {
            viewerPosition: agentPosition,
            billboardPosition: target.billboard.position,
            capturedAt: new Date().toISOString(),
            lightingSummary: `Street View Static camera aimed from the picked agent position toward the billboard at ${Math.round(bearingBetween(agentPosition, target.billboard.position))} degrees.`,
          },
          brief: `Evaluate billboard "${target.billboard.name}" from a manually picked pedestrian viewer spot.`,
          viewerProfile: 'urban pedestrian with short dwell time viewing a real street-level billboard',
          saveToAgentScreenshots: true,
          captureId,
        }),
      })

      if (!res.ok) {
        const errData = await res.json() as { error?: string }
        throw new Error(errData.error ?? `photoreal-scene returned ${res.status}`)
      }

      const data = await res.json() as PhotorealSceneApiResponse
      setAgentCaptures(prev => prev.map(c =>
        c.id === captureId
          ? {
              ...c,
              photorealImageUrl: data.photorealImageUrl,
              photorealAnalysis: data.analysis,
              photorealPending: false,
              thought: data.savedImageUrl ? `Saved to ${data.savedImageUrl}` : c.thought,
            }
          : c
      ))
      setAgentShotStatus(data.savedImageUrl ? `Saved ${data.savedImageUrl}` : 'Agent billboard screenshot ready.')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setAgentCaptures(prev => prev.map(c =>
        c.id === captureId
          ? { ...c, photorealPending: false, photorealError: message }
          : c
      ))
      setAgentShotError(true)
      setAgentShotStatus(message)
    } finally {
      setIsAgentShotRunning(false)
    }
  }, [isAgentShotRunning, oohBillboards, selectedBillboardId])

  const handleMapClick = useCallback((info: PickingInfo) => {
    if (suppressNextMapClickRef.current) {
      suppressNextMapClickRef.current = false
      return
    }

    if (activeTool === 'streetview') {
      if (info.coordinate) {
        const [lng, lat] = info.coordinate
        if (typeof lng === 'number' && typeof lat === 'number') {
          setStreetViewLocation({ lat, lng })
        }
      }
      return
    }

    if (!info.coordinate) return
    const [lng, lat] = info.coordinate
    if (typeof lng !== 'number' || typeof lat !== 'number') return

    if (activeTool === 'agent-billboard-capture') {
      void runAgentBillboardCapture({ lat, lng })
      return
    }

    if ((info.object as FloodReport | null)?.source === 'pub-risk-area' || (info.object as FloodReport | null)?.source === 'synthetic-live-report') {
      handleSelectFloodReport(info.object as FloodReport, { x: info.x ?? 0, y: info.y ?? 0 })
      return
    }

    if (activeTool === 'flood-planner' && selectedArea) {
      placeFloodIntervention({ lat, lng })
      return
    }

    // Clicking an existing billboard always selects it
    const pickedBillboardId = (info.object as { placement?: BillboardPlacement } | null)?.placement?.id
    if (pickedBillboardId) {
      const pickedOohPoint = oohPoints.find(point => point.id === pickedBillboardId)
      if (pickedOohPoint) {
        setSelectedOohPointId(pickedOohPoint.id)
        setOohClickPos({ x: info.x ?? 0, y: info.y ?? 0 })
        return
      }

      setSelectedBillboardId(pickedBillboardId)
      return
    }

    // Builder tool: two-phase place + rotate, works even when area is selected
    if (activeTool === 'builder') {
      if (billboardRotateRef.current === null) {
        const newId = `bb-${Date.now()}`
        addBillboardAt({ lat, lng }, 0, newId)
        billboardRotateRef.current = { id: newId, startX: info.x ?? 0 }
        setIsBillboardRotating(true)
      } else {
        billboardRotateRef.current = null
        setIsBillboardRotating(false)
      }
      return
    }

    if (activeTool === 'place-bus-stop') {
      addBusStopAt({ lat, lng })
      return
    }

    if (activeTool === 'place-pedestrian') {
      addPedestrianAt({ lat, lng })
      return
    }

    if (selectedArea) return

    if (isOohMapPoint(info.object)) {
      setSelectedOohPointId(info.object.id)
      setOohClickPos({ x: info.x ?? 0, y: info.y ?? 0 })
      return
    }
  }, [activeTool, addBillboardAt, addBusStopAt, addPedestrianAt, handleSelectFloodReport, oohPoints, placeFloodIntervention, runAgentBillboardCapture, selectedArea])

  const handleMapHover = useCallback((info: PickingInfo) => {
    // Heading rotate for billboard placement
    if (billboardRotateRef.current !== null && info.x !== undefined) {
      const deltaX = info.x - billboardRotateRef.current.startX
      const heading = (((-deltaX) % 360) + 360) % 360
      updateBillboard(billboardRotateRef.current.id, { heading })
    }

    // Street view cursor pin
    if (activeTool === 'streetview') {
      if (info.x === undefined || info.y === undefined || !info.coordinate) {
        setStreetViewHover(null)
      } else if (focusArea && !countryIso) {
        const [lng, lat] = info.coordinate as [number, number]
        setStreetViewHover(haversineKm({ lat, lng }, focusArea) > 2 ? null : { x: info.x, y: info.y })
      } else {
        setStreetViewHover({ x: info.x, y: info.y })
      }
    } else {
      setStreetViewHover(null)
    }

    // Cursor previews for two-phase placement tools
    if ((activeTool === 'builder' || activeTool === 'place-bus-stop' || activeTool === 'place-pedestrian' || activeTool === 'agent-billboard-capture' || activeTool === 'flood-planner') && info.coordinate) {
      const [lng, lat] = info.coordinate as [number, number]
      setCursorCoord({ lat, lng })
    } else {
      setCursorCoord(null)
    }
  }, [activeTool, countryIso, focusArea, updateBillboard])

  const handleAreaHoldMouseDown = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button === 2) {
      if (hasFinishedLasso) return
      setLassoPoints([])
      setSelectedArea(null)
      setIsLassoModeActive(false)
      setHasFinishedLasso(false)
      setIsDrawingLasso(false)
      return
    }

    if (event.button !== 0 || !mapInstance) return

    const target = event.target as HTMLElement | null
    if (target?.closest('button,a,input,textarea,select,[role="dialog"]')) return

    if (hasFinishedLasso) return

    if (isLassoModeActive) {
      if (lassoPoints.length > 0) return
      const rect = event.currentTarget.getBoundingClientRect()
      const lngLat = mapInstance.unproject([event.clientX - rect.left, event.clientY - rect.top])
      setIsDrawingLasso(true)
      setLassoPoints([[lngLat.lng, lngLat.lat]])
      setSelectedArea(null)
    }
  }, [mapInstance, isLassoModeActive, hasFinishedLasso, lassoPoints])

  const handleAreaHoldMouseMove = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (hasFinishedLasso) return

    if (isLassoModeActive && isDrawingLasso && mapInstance) {
      const rect = event.currentTarget.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      const lngLat = mapInstance.unproject([x, y])
      
      setLassoPoints(current => {
        if (current.length === 0) return [[lngLat.lng, lngLat.lat]]
        const last = current[current.length - 1]
        const lastProj = mapInstance.project(last)
        const dx = x - lastProj.x
        const dy = y - lastProj.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        // Periodically add nodes every 35 pixels of drawing distance
        if (dist > 35) {
          return [...current, [lngLat.lng, lngLat.lat]]
        }
        return current
      })
      return
    }
  }, [isLassoModeActive, isDrawingLasso, mapInstance, hasFinishedLasso])

  const handleAreaHoldMouseUp = useCallback(() => {
    if (hasFinishedLasso) return
    if (isLassoModeActive && isDrawingLasso) {
      setIsDrawingLasso(false)
      if (lassoPoints.length < 3) {
        setLassoPoints([])
        setSelectedArea(null)
        setIsLassoModeActive(false)
      }
    }
  }, [isLassoModeActive, isDrawingLasso, lassoPoints, hasFinishedLasso])

  const handleLockToggle = useCallback(() => {
    if (!selectedArea) return
    setIsSelectionLocked(locked => !locked)
  }, [selectedArea])

  const [hasCrowd, setHasCrowd] = useState(false)
  const [focusedAgentIdx, setFocusedAgentIdx] = useState(0)

  const handleAgentCycle = useCallback(() => {
    setFocusedAgentIdx(prev => {
      const total = agentsRef.current.length
      if (total === 0) return 0
      return (prev + 1) % total
    })
  }, [])

  useEffect(() => {
    if (activeTool !== 'builder' && billboardRotateRef.current !== null) {
      billboardRotateRef.current = null
      setIsBillboardRotating(false)
    }
  }, [activeTool])

  const captureSceneView = useCallback(async () => {
    const canvas = document.querySelector<HTMLCanvasElement>('.mapboxgl-canvas')
    if (!canvas) {
      setCaptureStatus('Could not find the 3D scene canvas.')
      return null
    }

    try {
      const capture = {
        dataUrl: canvas.toDataURL('image/jpeg', 0.82),
        capturedAt: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      }
      setSceneCapture(capture)
      setCaptureStatus('Scene camera view captured.')
      return capture
    } catch {
      setCaptureStatus('Scene capture was blocked by the browser. Upload a screenshot instead.')
      return null
    }
  }, [])

  const askAIAboutSnapshot = useCallback(async () => {
    setIsQuickAnalyzing(true)
    setQuickResponse(null)
    setQuickResponseError(null)

    try {
      const capture = await captureSceneView()
      if (!capture) {
        throw new Error('Could not capture the current 3D view.')
      }

      const res = await fetch('/api/scene-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sceneImage: { dataUrl: capture.dataUrl },
          brief: 'Quick test from the current Faultline 3D map view. Describe the scene and likely viewer response to the visible outdoor ads.',
          viewerProfile: 'urban pedestrian or commuter glancing at a messy 3D street scene',
        }),
      })

      const body = await res.json() as SceneResponseApiResponse | { error?: string }
      if (!res.ok) {
        throw new Error('error' in body && body.error ? body.error : `AI request failed with status ${res.status}`)
      }

      setQuickResponse(body as SceneResponseApiResponse)
    } catch (err: unknown) {
      setQuickResponseError(err instanceof Error ? err.message : 'Could not get AI analysis of the snapshot.')
    } finally {
      setIsQuickAnalyzing(false)
    }
  }, [captureSceneView])

  useEffect(() => {
    if (!mapInstance || !countryIso) return

    const addCountryHighlight = () => {
      try {
        if (!mapInstance.getSource('country-boundaries-highlight')) {
          mapInstance.addSource('country-boundaries-highlight', {
            type: 'vector',
            url: 'mapbox://mapbox.country-boundaries-v1',
          })
        }
        if (!mapInstance.getLayer('selected-country-highlight')) {
          // slot:'middle' places the fill between terrain/roads and labels in Mapbox Standard v3
          mapInstance.addLayer({
            id: 'selected-country-highlight',
            slot: 'middle',
            type: 'fill',
            source: 'country-boundaries-highlight',
            'source-layer': 'country_boundaries',
            filter: ['==', ['get', 'iso_3166_1'], countryIso],
            paint: {
              'fill-color': '#D02020',
              'fill-opacity': 0.16,
            },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any)
        } else {
          mapInstance.setFilter('selected-country-highlight', ['==', ['get', 'iso_3166_1'], countryIso])
        }
      } catch {
        // Standard style slot errors are non-fatal; map renders without the country highlight.
      }
    }

    if (mapInstance.isStyleLoaded()) addCountryHighlight()
    else mapInstance.once('style.load', addCountryHighlight)

    return () => {
      if (mapInstance.getLayer('selected-country-highlight')) mapInstance.removeLayer('selected-country-highlight')
      if (mapInstance.getSource('country-boundaries-highlight')) mapInstance.removeSource('country-boundaries-highlight')
    }
  }, [mapInstance, countryIso])

  if (!MAPBOX_TOKEN) {
    return null
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }} onContextMenu={e => e.preventDefault()}>
      <MapLoadingScreen ready={mapStyleReady} progress={loadingProgress} label={loadingLabel} />
      <div
        style={{ position: 'absolute', inset: 0 }}
        onMouseDown={handleAreaHoldMouseDown}
        onMouseMove={handleAreaHoldMouseMove}
        onMouseUp={handleAreaHoldMouseUp}
        onMouseLeave={handleAreaHoldMouseUp}
      >
        <DeckGL
          ref={deckRef}
          initialViewState={focusArea
            ? { ...INITIAL_VIEW_STATE, longitude: focusArea.lng, latitude: focusArea.lat }
            : INITIAL_VIEW_STATE}
          controller={isLassoModeActive && !hasFinishedLasso ? { dragPan: false } : true}
          layers={layers}
          onClick={handleMapClick}
          onHover={handleMapHover}
          getTooltip={({ layer, object }) => {
            if (layer?.id.startsWith('flood-report-') && object) {
              const report = object as FloodReport
              return {
                html: `<div style="font:12px/1.5 sans-serif;padding:7px 9px;max-width:240px"><b>${report.locationName}</b><br/>Severity ${report.severity}/5 · ${(report.confidence * 100).toFixed(0)}% confidence</div>`,
                style: { background: '#07131f', color: '#f0f8ff', borderRadius: '6px', border: '1px solid rgba(91,205,255,0.42)' },
              }
            }
            if (layer?.id === 'sg-ooh-dots' && object) {
              const a = object as SingaporeOohAsset
              const typeLabel = SG_OOH_TYPE_LABELS[a.type] ?? a.type
              const lines = [
                `<b>${typeLabel}</b>`,
                a.name ? a.name : null,
                a.operator ? `Operator: ${a.operator}` : null,
                `Source: ${a.source.toUpperCase()}`,
              ].filter(Boolean).join('<br/>')
              return {
                html: `<div style="font:12px/1.6 sans-serif;padding:6px 8px">${lines}</div>`,
                style: { background: '#0d1117', color: '#f0f0f0', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.14)' },
              }
            }
            if (!layer?.id.startsWith('billboard-framesooh-') || !object) return null
            const placementId = (object as { placementId?: string }).placementId
            const p = placementId ? oohPoints.find(point => point.id === placementId) : null
            if (!p) return null
            return {
              html: `<div style="font:12px/1.5 sans-serif;padding:6px 8px"><b>${p.mediaTypeLabel}</b><br/>${(p.weeklyImpressions / 1000).toFixed(0)}k impressions/wk<br/>Visibility: ${getOohScoreLabel(p)}/10</div>`,
              style: { background: '#1a1a2e', color: '#f0f0f0', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.12)' },
            }
          }}
          style={{ position: 'absolute', inset: '0', cursor: activeTool === 'streetview' ? 'none' : isBillboardRotating ? 'ew-resize' : isLassoModeActive && !hasFinishedLasso ? 'cell' : activeTool === 'builder' || activeTool === 'place-bus-stop' || activeTool === 'place-pedestrian' || activeTool === 'agent-billboard-capture' || activeTool === 'flood-planner' ? 'crosshair' : undefined }}
        >
          <MapboxMap
            ref={mapRef}
            mapboxAccessToken={MAPBOX_TOKEN}
            mapStyle="mapbox://styles/mapbox/standard"
            onLoad={handleMapReady}
            onRender={handleMapReady}
            preserveDrawingBuffer
            maxPitch={85}
            maxZoom={MAP_MAX_ZOOM}
            minZoom={countryIso ? 3 : 11}
          />
        </DeckGL>
        <CrowdLayer
          agentSourceRef={agentsRef}
          cursorAgentRef={cursorAgentRef}
          elapsedSeconds={animationTime}
          map={mapInstance}
          iconMinZoom={PEDESTRIAN_ICON_MIN_ZOOM}
          modelMinZoom={PEDESTRIAN_MODEL_MIN_ZOOM}
        />
      </div>

      <RainOverlay active={floodElapsedMinute > 0 && floodElapsedMinute < 24.5} />

      {activeTool === 'builder' && (
        <BillboardStudioPanel
          billboards={billboards}
          selectedBillboard={selectedBillboard}
          onSelectBillboard={setSelectedBillboardId}
          onUpdateBillboard={updateBillboard}
          onDuplicateBillboard={duplicateBillboard}
          onDeleteBillboard={deleteBillboard}
        />
      )}

      {activeTool === 'settings' && (
        <AgencyDemoPanel
          selectedArea={selectedArea}
          fallbackArea={FALLBACK_AREA}
          sceneCapture={sceneCapture}
          captureStatus={captureStatus}
          onCaptureScene={captureSceneView}
          onSceneUpload={setSceneCapture}
          selectedBillboard={selectedBillboard}
          onApplyOptimizedCreative={applyOptimizedCreativeToSelectedBillboard}
        />
      )}

      {activeTool === 'dashboard' && (
        <DashboardOverlay onClose={() => setActiveTool(null)} captures={agentCaptures} billboards={billboards} oohPoints={oohPoints} mapboxToken={MAPBOX_TOKEN ?? ''} agentsRef={agentsRef} />
      )}

      {activeTool === 'photoreal-test' && (
        <PhotorealTestPanel onClose={() => setActiveTool(null)} />
      )}

      {(activeTool === 'agent-billboard-capture' || agentShotStatus) && (
        <div
          style={{
            position: 'fixed',
            top: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 70,
            background: '#121212',
            color: agentShotError ? '#ff6b6b' : '#F0F0F0',
            border: `3px solid ${agentShotError ? '#D02020' : '#4991FF'}`,
            boxShadow: '5px 5px 0 #121212',
            padding: '8px 12px',
            fontFamily: 'monospace',
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            pointerEvents: 'none',
          }}
        >
          {isAgentShotRunning
            ? agentShotStatus
            : agentShotStatus ?? 'Click an agent viewpoint'}
        </div>
      )}

      {isLassoModeActive && !hasFinishedLasso && lassoPoints.length >= 3 && (
        <AreaConfirmDialog
          billboardCount={oohPoints.filter(p => isPointInPolygon(p.position, lassoPoints)).length + billboards.filter(b => isPointInPolygon(b.position, lassoPoints)).length}
          radiusKm={0}
          allowEmpty
          countLabel="OOH sites"
          emptyMessage="No OOH assets inside your custom lasso boundary."
          onConfirm={() => {
            const centroid = getPolygonCentroid(lassoPoints)
            setSelectedArea(centroid)
            setHasFinishedLasso(true)
            setActiveTool('flood-planner')
          }}
          onCancel={() => {
            setLassoPoints([])
            setSelectedArea(null)
            setSuggestionPreloadArea(null)
            setIsLassoModeActive(false)
          }}
        />
      )}

      {selectedArea && !buildingsDataReady && (
        <div style={{
          position: 'fixed',
          top: 16,
          left: 16,
          zIndex: 60,
          background: '#121212',
          border: '3px solid #F0F0F0',
          boxShadow: '4px 4px 0 #121212',
          padding: '8px 12px',
          fontFamily: 'monospace',
          fontSize: 11,
          fontWeight: 900,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#F0F0F0',
          pointerEvents: 'none',
          minWidth: 180,
        }}>
          <div style={{ marginBottom: 6 }}>Rendering buildings…</div>
          <div style={{ width: '100%', height: 4, background: '#333', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: '40%',
              background: '#F0F0F0',
              animation: 'buildingLoadScan 1.2s ease-in-out infinite',
            }} />
          </div>
        </div>
      )}

      {floodScenarioVisible && (
        <FloodActionBar
          scenario={floodScenario}
          selectedKind={selectedFloodIntervention}
          onSelectedKindChange={setSelectedFloodIntervention}
          onStart={startFloodSimulation}
          onReset={resetFloodSimulation}
          onSpawnProcedural={spawnProceduralInterventions}
          interventions={plannerInterventions}
          hasSelectedArea={Boolean(selectedArea)}
          selectedArea={selectedArea}
          buildingsReady={buildingsDataReady}
        />
      )}

      {floodScenarioVisible && (
        <FloodPlannerPanel
          scenario={floodScenario}
          selectedKind={selectedFloodIntervention}
          onSelectedKindChange={setSelectedFloodIntervention}
          onStart={startFloodSimulation}
          onReset={resetFloodSimulation}
          onApplyRecommended={applyRecommendedFloodIntervention}
          onSpawnProcedural={spawnProceduralInterventions}
          interventions={plannerInterventions}
          hasSelectedArea={Boolean(selectedArea)}
          selectedArea={selectedArea}
          buildingsReady={buildingsDataReady}
        />
      )}



      {activeTool === 'streetview' && streetViewHover && (
        <StreetViewCursor x={streetViewHover.x} y={streetViewHover.y} />
      )}

      {activeTool === 'streetview' && streetViewLocation && (
        <StreetViewPanel
          location={streetViewLocation}
          billboards={streetViewBillboards}
          onClose={() => { setStreetViewLocation(null); setActiveTool(null) }}
          onPlaceBillboard={(pos, heading) => {
            addBillboardAt(pos, heading)
            setStreetViewLocation(null)
            setActiveTool('builder')
          }}
          floodScenario={floodScenario}
          interventions={plannerInterventions}
        />
      )}

      {selectedOohPoint && activeTool !== 'builder' && (
        <BillboardListingPanel
          point={selectedOohPoint}
          mapboxToken={MAPBOX_TOKEN}
          cursorX={oohClickPos?.x}
          cursorY={oohClickPos?.y}
          onClose={() => { setSelectedOohPointId(null); setOohClickPos(null) }}
          onPlaceBillboard={() => {
            addBillboardAt(selectedOohPoint.position)
            setSelectedOohPointId(null)
            setOohClickPos(null)
            setActiveTool('builder')
          }}
        />
      )}


      <MapToolbar
        activeTool={activeTool}
        onToolChange={setActiveTool}
        dashboardEnabled={true}
      />

      {selectedArea && (
        <FloodMetricsBar scenario={floodScenario} />
      )}


      {sightingNotifications.length > 0 && (
        <div style={{
          position: 'absolute',
          top: 48,
          left: 12,
          zIndex: 999,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          maxWidth: 260,
          pointerEvents: 'none',
        }}>
          {sightingNotifications.map(n => {
            const demoIdx = (parseInt(n.agentId.replace(/\D+/g, '').slice(-4) || '0', 10)) % DEMOGRAPHIC_DEFS.length
            const demo = DEMOGRAPHIC_DEFS[demoIdx]
            return (
              <div key={n.id} style={{
                background: '#121212',
                border: `3px solid ${demo.color}`,
                display: 'flex',
                overflow: 'hidden',
              }}>
                {/* Demographic icon block */}
                <div style={{
                  width: 40,
                  flexShrink: 0,
                  background: demo.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <svg viewBox="0 0 20 26" width={20} height={26} fill="#121212">
                    {demo.icon}
                  </svg>
                </div>
                {/* Text block */}
                <div style={{ padding: '6px 10px', minWidth: 0 }}>
                  <div style={{
                    fontSize: 8,
                    fontWeight: 900,
                    letterSpacing: '0.16em',
                    color: demo.color,
                    textTransform: 'uppercase',
                    marginBottom: 2,
                  }}>
                    {demo.label} · SAW IT
                  </div>
                  <div style={{
                    fontSize: 12,
                    fontWeight: 900,
                    color: '#F0F0F0',
                    letterSpacing: '-0.01em',
                    lineHeight: 1.1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {n.agentName}
                  </div>
                  <div style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: 'rgba(240,240,240,0.45)',
                    letterSpacing: '0.04em',
                    marginTop: 2,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    ↗ {n.billboardName}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Singapore OOH live layer toggle */}
      <div style={{
        position: 'absolute',
        bottom: 40,
        right: 12,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 6,
        pointerEvents: 'none',
      }}>
        {showSgOoh && sgOohStatus && (
          <div style={{
            fontFamily: 'monospace',
            fontSize: 11,
            color: 'rgba(255,255,255,0.7)',
            background: 'rgba(0,0,0,0.6)',
            padding: '3px 8px',
            borderRadius: 4,
            maxWidth: 320,
            textAlign: 'right',
          }}>
            {sgOohStatus}
          </div>
        )}

      </div>

      <div
        aria-label="Faultline"
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 28,
          fontWeight: 900,
          lineHeight: 1,
          color: '#ffffff',
          letterSpacing: 0,
          opacity: 0.3,
          pointerEvents: 'none',
          userSelect: 'none',
          zIndex: 1000,
        }}
      >
        FAULTLINE
      </div>

      <div style={{
        position: 'absolute',
        top: 12,
        right: 12,
        fontFamily: 'monospace',
        fontSize: 12,
        color: fps < 30 ? '#ff5555' : fps < 50 ? '#ffaa33' : '#55ff88',
        background: 'rgba(0,0,0,0.45)',
        padding: '2px 7px',
        borderRadius: 4,
        pointerEvents: 'none',
        userSelect: 'none',
        zIndex: 1000,
      }}>
        {fps} FPS
      </div>

    </div>
  )
}
