'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { BillboardPlacement, FloodScenarioResult, LatLng, PlannerIntervention } from '@/types'
import WorldModelSection from '@/components/WorldModelSection'

const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

const BILLBOARD_W = 320
const PLACE_DISTANCE_M = 20

// ── Geo helpers ──────────────────────────────────────────────────────────────
function bearingTo(from: LatLng, to: LatLng): number {
  const dLng = (to.lng - from.lng) * Math.PI / 180
  const lat1 = from.lat * Math.PI / 180
  const lat2 = to.lat * Math.PI / 180
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

function distanceTo(from: LatLng, to: LatLng): number {
  const R = 6371000
  const dLat = (to.lat - from.lat) * Math.PI / 180
  const dLng = (to.lng - from.lng) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(from.lat * Math.PI / 180) * Math.cos(to.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function offsetMeters(origin: LatLng, eastM: number, northM: number): LatLng {
  const lngScale = 111320 * Math.cos(origin.lat * Math.PI / 180)
  return {
    lat: origin.lat + northM / 110540,
    lng: origin.lng + eastM / lngScale,
  }
}

function bearingVector(degrees: number) {
  const r = degrees * Math.PI / 180
  return { east: Math.sin(r), north: Math.cos(r) }
}

function projectForward(from: LatLng, headingDeg: number, distanceM: number): LatLng {
  const R = 6371000
  const brng = headingDeg * Math.PI / 180
  const lat1 = from.lat * Math.PI / 180
  const lon1 = from.lng * Math.PI / 180
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distanceM / R) +
    Math.cos(lat1) * Math.sin(distanceM / R) * Math.cos(brng)
  )
  const lon2 = lon1 + Math.atan2(
    Math.sin(brng) * Math.sin(distanceM / R) * Math.cos(lat1),
    Math.cos(distanceM / R) - Math.sin(lat1) * Math.sin(lat2)
  )
  return { lat: lat2 * 180 / Math.PI, lng: lon2 * 180 / Math.PI }
}

// ── Maps script loader (singleton) ───────────────────────────────────────────
let _mapsPromise: Promise<void> | null = null

function loadMapsApi(key: string): Promise<void> {
  if (typeof google !== 'undefined' && google.maps?.StreetViewPanorama) return Promise.resolve()
  if (_mapsPromise) return _mapsPromise
  _mapsPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}`
    s.async = true
    s.onload = () => resolve()
    s.onerror = (e) => { _mapsPromise = null; reject(e) }
    document.head.appendChild(s)
  })
  return _mapsPromise
}

const EYE_HEIGHT_M = 1.5  // street view camera height above ground

// ── AR panorama view ──────────────────────────────────────────────────────────
interface ScreenPoint {
  x: number
  y: number
}

interface ProjectedBillboard {
  id: string
  faceW: number      // face width px at scale 1
  faceH: number      // face height px at scale 1
  transform: string
  poles: Array<{ bottom: ScreenPoint; top: ScreenPoint }>
  labelPoint: ScreenPoint
  mediaUrl?: string
  primaryColor: string
  label: string
  visible: boolean
}

interface StreetViewARViewProps {
  location: LatLng
  apiKey: string
  billboards: BillboardPlacement[]
  onPlaceBillboard: (pos: LatLng, heading: number) => void
}

function solveLinearSystem(matrix: number[][], values: number[]) {
  const n = values.length
  const a = matrix.map((row, i) => [...row, values[i]])

  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row
    }
    if (Math.abs(a[pivot][col]) < 1e-8) return null
    ;[a[col], a[pivot]] = [a[pivot], a[col]]

    const div = a[col][col]
    for (let j = col; j <= n; j++) a[col][j] /= div

    for (let row = 0; row < n; row++) {
      if (row === col) continue
      const factor = a[row][col]
      for (let j = col; j <= n; j++) a[row][j] -= factor * a[col][j]
    }
  }

  return a.map(row => row[n])
}

function getProjectiveTransform(width: number, height: number, dst: [ScreenPoint, ScreenPoint, ScreenPoint, ScreenPoint]) {
  const src = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ]
  const matrix: number[][] = []
  const values: number[] = []

  for (let index = 0; index < 4; index++) {
    const { x, y } = src[index]
    const { x: u, y: v } = dst[index]
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y])
    values.push(u)
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y])
    values.push(v)
  }

  const h = solveLinearSystem(matrix, values)
  if (!h) return null
  const [a, b, c, d, e, f, g, i] = h
  return `matrix3d(${a},${d},0,${g},${b},${e},0,${i},0,0,1,0,${c},${f},0,1)`
}

function StreetViewARView({ location, apiKey, billboards, onPlaceBillboard }: StreetViewARViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const panoRef = useRef<google.maps.StreetViewPanorama | null>(null)
  const didAimAtBillboardRef = useRef(false)
  const billboardsRef = useRef<BillboardPlacement[]>(billboards)
  const projectRef = useRef<(() => void) | null>(null)
  const [projected, setProjected] = useState<ProjectedBillboard[]>([])
  const [placing, setPlacing] = useState(false)

  useEffect(() => {
    didAimAtBillboardRef.current = false
  }, [location.lat, location.lng])

  useEffect(() => {
    billboardsRef.current = billboards
    // Re-aim and re-project whenever the billboard set changes (e.g. OOH inventory
    // finishes loading after the dialog opened).
    didAimAtBillboardRef.current = false
    projectRef.current?.()
  }, [billboards])

  useEffect(() => {
    if (!containerRef.current) return
    const container = containerRef.current
    let cancelled = false

    loadMapsApi(apiKey).then(() => {
      if (cancelled) return

      const pano = new google.maps.StreetViewPanorama(container, {
        pov: { heading: 0, pitch: 0 },
        zoom: 1,
        addressControl: false,
        fullscreenControl: false,
        motionTracking: false,
        motionTrackingControl: false,
        showRoadLabels: false,
        visible: true,
      })
      panoRef.current = pano

      // Snap to the nearest available panorama; the JS API does not auto-snap the
      // way the embed iframe does, so a click on a rooftop / off-road point would
      // otherwise render an all-black panorama.
      const svc = new google.maps.StreetViewService()
      svc.getPanorama(
        { location: { lat: location.lat, lng: location.lng }, radius: 80, source: google.maps.StreetViewSource.OUTDOOR },
        (data, status) => {
          if (cancelled) return
          if (status === google.maps.StreetViewStatus.OK && data?.location?.pano) {
            pano.setPano(data.location.pano)
          } else {
            pano.setPosition({ lat: location.lat, lng: location.lng })
          }
        }
      )

      const project = () => {
        if (cancelled || !containerRef.current) return
        const pov = pano.getPov()
        const zoom = pano.getZoom() ?? 1
        const panoPos = pano.getPosition()
        if (!panoPos) return

        const viewerPos: LatLng = { lat: panoPos.lat(), lng: panoPos.lng() }
        const { width, height } = containerRef.current.getBoundingClientRect()
        if (width <= 0 || height <= 0) return

        const hFOV = Math.max(20, Math.min(120, 180 / Math.pow(2, zoom)))
        const vFOV = hFOV * (height / width)
        const pitch = pov.pitch ?? 0
        let projectionHeading = pov.heading

        const currentBillboards = billboardsRef.current

        if (!didAimAtBillboardRef.current) {
          const nearest = currentBillboards
            .map(billboard => ({ billboard, distance: distanceTo(viewerPos, billboard.position) }))
            .filter(({ distance }) => distance <= 400)
            .sort((a, b) => a.distance - b.distance)[0]

          if (nearest) {
            didAimAtBillboardRef.current = true
            projectionHeading = bearingTo(viewerPos, nearest.billboard.position)
            pano.setPov({ ...pov, heading: projectionHeading })
          }
        }

        const projectPoint = (point: LatLng, altitudeM: number): ScreenPoint & { dH: number; distance: number } => {
          const distance = Math.max(distanceTo(viewerPos, point), 0.5)
          const heading = bearingTo(viewerPos, point)
          const dH = ((heading - projectionHeading) + 540) % 360 - 180
          const pointPitch = Math.atan2(altitudeM - EYE_HEIGHT_M, distance) * 180 / Math.PI
          const dP = pointPitch - pitch
          return {
            x: width / 2 + (Math.tan(dH * Math.PI / 180) / Math.tan(hFOV * Math.PI / 360)) * (width / 2),
            y: height / 2 - (Math.tan(dP * Math.PI / 180) / Math.tan(vFOV * Math.PI / 360)) * (height / 2),
            dH,
            distance,
          }
        }

        const next: ProjectedBillboard[] = []
        for (const bb of currentBillboards) {
          const dist = distanceTo(viewerPos, bb.position)
          if (dist > 400) continue

          const side = bearingVector(bb.heading + 90)
          const halfWidth = bb.widthM / 2

          const poleInset = bb.widthM * 0.28
          const leftPos = offsetMeters(bb.position, -side.east * halfWidth, -side.north * halfWidth)

          const rightPos = offsetMeters(bb.position, side.east * halfWidth, side.north * halfWidth)
          const poleLeftPos = offsetMeters(bb.position, -side.east * poleInset, -side.north * poleInset)

          const poleRightPos = offsetMeters(bb.position, side.east * poleInset, side.north * poleInset)

          const faceW = BILLBOARD_W
          const faceH = Math.round(bb.heightM * BILLBOARD_W / bb.widthM)

          const corners: [
            ScreenPoint & { dH: number; distance: number },
            ScreenPoint & { dH: number; distance: number },
            ScreenPoint & { dH: number; distance: number },
            ScreenPoint & { dH: number; distance: number },
          ] = [
            projectPoint(leftPos, bb.clearanceM),
            projectPoint(rightPos, bb.clearanceM),
            projectPoint(rightPos, bb.clearanceM + bb.heightM),
            projectPoint(leftPos, bb.clearanceM + bb.heightM),
          ]
          const transform = getProjectiveTransform(faceW, faceH, [
            corners[3],
            corners[2],
            corners[1],
            corners[0],
          ])
          if (!transform) continue

          const poles = [
            { bottom: projectPoint(poleLeftPos, 0), top: projectPoint(poleLeftPos, bb.clearanceM) },
            { bottom: projectPoint(poleRightPos, 0), top: projectPoint(poleRightPos, bb.clearanceM) },
          ]
          const isInFront = corners.some(corner => Math.abs(corner.dH) < 89)
          const minX = Math.min(...corners.map(corner => corner.x))
          const maxX = Math.max(...corners.map(corner => corner.x))
          const minY = Math.min(...corners.map(corner => corner.y))
          const maxY = Math.max(...corners.map(corner => corner.y))
          const isOnScreen = maxX > -width * 0.5 &&
            minX < width * 1.5 &&
            maxY > -height * 0.5 &&
            minY < height * 1.5
          const labelPoint = {
            x: (corners[2].x + corners[3].x) / 2,
            y: Math.min(corners[2].y, corners[3].y) - 8,
          }

          next.push({
            id: bb.id,
            faceW,
            faceH,
            transform,
            poles,
            labelPoint,
            mediaUrl: bb.mediaUrl,
            primaryColor: bb.primaryColor,
            label: bb.name,
            visible: isInFront && isOnScreen && dist > 1,
          })
        }
        setProjected(next)
      }

      projectRef.current = project
      pano.addListener('pov_changed', project)
      pano.addListener('position_changed', project)
      pano.addListener('status_changed', project)
      project()
    }).catch(() => {})

    return () => {
      cancelled = true
      projectRef.current = null
      if (panoRef.current) {
        google.maps?.event?.clearInstanceListeners?.(panoRef.current)
        panoRef.current = null
      }
      container.innerHTML = ''
    }
  }, [location.lat, location.lng, apiKey])

  const handlePlace = useCallback(() => {
    if (!panoRef.current) return
    const pov = panoRef.current.getPov()
    const panoPos = panoRef.current.getPosition()
    if (!panoPos) return
    const viewerPos: LatLng = { lat: panoPos.lat(), lng: panoPos.lng() }
    const placedPos = projectForward(viewerPos, pov.heading, PLACE_DISTANCE_M)
    onPlaceBillboard(placedPos, (pov.heading + 180) % 360)
    setPlacing(false)
  }, [onPlaceBillboard])

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, width: '100%' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Overlay layer — sits above the Maps canvas, clips at container boundary */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 100 }}>
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        {projected.filter(p => p.visible).flatMap(p => p.poles.map((pole, index) => (
          <line
            key={`${p.id}-pole-${index}`}
            x1={pole.bottom.x}
            y1={pole.bottom.y}
            x2={pole.top.x}
            y2={pole.top.y}
            stroke="rgba(74,74,74,0.88)"
            strokeWidth={Math.max(2, Math.min(7, Math.abs(pole.bottom.y - pole.top.y) * 0.08))}
            strokeLinecap="round"
          />
        )))}
      </svg>
      {projected.filter(p => p.visible).map(p => (
        <div key={p.id}>
          <div style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: p.faceW,
            height: p.faceH,
            transform: p.transform,
            transformOrigin: '0 0',
            willChange: 'transform',
            filter: 'brightness(0.82) contrast(1.08) saturate(0.88)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.6), 0 0 0 3px rgba(0,0,0,0.4)',
            overflow: 'hidden',
          }}>
            {p.mediaUrl ? (
              <img
                src={p.mediaUrl}
                alt={p.label}
                style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', background: p.primaryColor }} />
            )}
          </div>
          <div style={{
            position: 'absolute',
            left: p.labelPoint.x,
            top: p.labelPoint.y,
            transform: 'translate(-50%, -100%)',
            background: 'rgba(0,0,0,0.72)',
            color: '#009E73',
            fontFamily: 'monospace',
            fontSize: 9,
            letterSpacing: '0.1em',
            padding: '2px 6px',
            whiteSpace: 'nowrap',
          }}>
            {p.label}
          </div>
        </div>
      ))}
      </div>{/* end overlay layer */}

      {/* Place mode crosshair */}
      {placing && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 101,
          }}
        >
          <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
            <circle cx="28" cy="28" r="14" stroke="#009E73" strokeWidth="1.5" opacity="0.9" />
            <line x1="28" y1="4" x2="28" y2="18" stroke="#009E73" strokeWidth="1.5" />
            <line x1="28" y1="38" x2="28" y2="52" stroke="#009E73" strokeWidth="1.5" />
            <line x1="4" y1="28" x2="18" y2="28" stroke="#009E73" strokeWidth="1.5" />
            <line x1="38" y1="28" x2="52" y2="28" stroke="#009E73" strokeWidth="1.5" />
            <circle cx="28" cy="28" r="2" fill="#009E73" />
          </svg>
        </div>
      )}

      {/* Place controls */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          alignItems: 'flex-end',
          zIndex: 101,
        }}
      >
        {placing ? (
          <>
            <div
              style={{
                background: 'rgba(0,0,0,0.8)',
                color: '#009E73',
                fontFamily: 'monospace',
                fontSize: 10,
                letterSpacing: '0.1em',
                padding: '4px 8px',
                border: '1px solid rgba(0,158,115,0.3)',
              }}
            >
              AIM AT PLACEMENT SPOT
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={() => setPlacing(false)}
                style={{
                  background: 'none',
                  border: '2px solid #444',
                  color: '#aaa',
                  cursor: 'pointer',
                  padding: '5px 12px',
                  fontFamily: 'monospace',
                  fontSize: 11,
                  letterSpacing: '0.08em',
                }}
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={handlePlace}
                style={{
                  background: '#009E73',
                  border: 'none',
                  color: '#000',
                  cursor: 'pointer',
                  padding: '5px 12px',
                  fontFamily: 'monospace',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                }}
              >
                PLACE HERE
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setPlacing(true)}
            style={{
              background: '#121212',
              border: '2px solid #009E73',
              color: '#009E73',
              cursor: 'pointer',
              padding: '6px 14px',
              fontFamily: 'monospace',
              fontSize: 11,
              letterSpacing: '0.1em',
            }}
          >
            + PLACE BILLBOARD
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────
interface StreetViewPanelProps {
  location: LatLng
  billboards: BillboardPlacement[]
  onClose: () => void
  onPlaceBillboard: (pos: LatLng, heading: number) => void
  floodScenario?: FloodScenarioResult | null
  interventions?: PlannerIntervention[]
}

export default function StreetViewPanel({ location, billboards, onClose, onPlaceBillboard, floodScenario = null, interventions = [] }: StreetViewPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  if (!GOOGLE_MAPS_KEY) return null

  const embedSrc = `https://www.google.com/maps/embed/v1/streetview?key=${GOOGLE_MAPS_KEY}&location=${location.lat},${location.lng}&fov=80`
  const coordLabel = `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`

  return (
    <>
      {/* ── Thumbnail ─────────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'fixed',
          bottom: 32,
          left: 32,
          zIndex: 50,
          width: 300,
          border: '3px solid #121212',
          boxShadow: '6px 6px 0 #121212',
          background: '#0f1117',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 10px',
            background: '#121212',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: 10,
              letterSpacing: '0.1em',
              color: '#009E73',
              textTransform: 'uppercase',
            }}
          >
            STREET VIEW · {coordLabel}
          </span>
          <button
            type="button"
            aria-label="Close street view"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#F0F0F0',
              cursor: 'pointer',
              padding: '0 2px',
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{ position: 'relative', cursor: 'pointer', height: 180 }}
          onClick={() => setIsExpanded(true)}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <iframe
            key={`thumb-${location.lat},${location.lng}`}
            src={embedSrc}
            width="100%"
            height="180"
            style={{ display: 'block', border: 'none', pointerEvents: 'none' }}
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
            title="Street View thumbnail"
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: isHovered ? 'rgba(0,0,0,0.52)' : 'rgba(0,0,0,0)',
              backdropFilter: isHovered ? 'blur(2px)' : 'none',
              transition: 'background 0.15s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isHovered && (
              <div style={{ textAlign: 'center' }}>
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#F0F0F0"
                  strokeWidth="2.5"
                  strokeLinecap="square"
                  aria-hidden="true"
                >
                  <circle cx="10" cy="10" r="6" />
                  <line x1="14.5" y1="14.5" x2="20" y2="20" />
                  <line x1="10" y1="7" x2="10" y2="13" />
                  <line x1="7" y1="10" x2="13" y2="10" />
                </svg>
                <div
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 9,
                    color: '#009E73',
                    letterSpacing: '0.12em',
                    marginTop: 4,
                  }}
                >
                  AR MODE
                </div>
              </div>
            )}
          </div>
        </div>

        {GOOGLE_MAPS_KEY && (
          <WorldModelSection
            location={location}
            floodScenario={floodScenario}
            interventions={interventions}
            googleMapsKey={GOOGLE_MAPS_KEY}
          />
        )}
      </div>

      {/* ── Expanded AR dialog ────────────────────────────────────────────── */}
      {isExpanded && (
        <div
          className="bh-overlay-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsExpanded(false)
          }}
        >
          <div
            className="bh-overlay-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Street View AR"
            style={{ background: '#121212' }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                height: 52,
                borderBottom: '4px solid #121212',
                flexShrink: 0,
                background: '#121212',
                color: '#fff',
                padding: '0 20px',
              }}
            >
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: 12,
                  letterSpacing: '0.12em',
                  color: '#009E73',
                  textTransform: 'uppercase',
                }}
              >
                AR VIEW · {coordLabel}
              </span>
              <button
                type="button"
                aria-label="Close street view dialog"
                onClick={() => setIsExpanded(false)}
                style={{
                  background: 'none',
                  border: '2px solid #F0F0F0',
                  color: '#F0F0F0',
                  cursor: 'pointer',
                  padding: '2px 10px',
                  fontSize: 13,
                  fontFamily: 'monospace',
                  letterSpacing: '0.08em',
                }}
              >
                CLOSE
              </button>
            </div>

            <StreetViewARView
              location={location}
              apiKey={GOOGLE_MAPS_KEY}
              billboards={billboards}
              onPlaceBillboard={onPlaceBillboard}
            />
          </div>
        </div>
      )}
    </>
  )
}
