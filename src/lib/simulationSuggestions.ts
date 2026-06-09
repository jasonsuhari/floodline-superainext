import type { FloodReport, LatLng } from '@/types'
import { haversineKm } from './geoUtils'
import { FLOOD_REPORTS } from './floodHotspots'

export interface SimulationSuggestion {
  id: string
  label: string
  centroid: LatLng
  polygon: [number, number][]
  pubReportCount: number
  nearbyReportCount: number
  meanSeverity: number
  score: number
  topReport: FloodReport
}

const CLUSTER_MERGE_KM = 2.2
const POLY_RAYS = 28
const BUFFER_M = 480
const MIN_RADIUS_M = 350
const MAX_SUGGESTIONS = 5
const NEARBY_RADIUS_KM = 1.5

function weightedCentroid(reports: FloodReport[]): LatLng {
  let wLat = 0, wLng = 0, wSum = 0
  for (const r of reports) {
    const w = r.severity * r.confidence
    wLat += r.position.lat * w
    wLng += r.position.lng * w
    wSum += w
  }
  return { lat: wLat / wSum, lng: wLng / wSum }
}

function bearingRad(from: LatLng, to: LatLng): number {
  const dLng = (to.lng - from.lng) * Math.cos((from.lat * Math.PI) / 180)
  const dLat = to.lat - from.lat
  return Math.atan2(dLng, dLat)
}

function angularDiff(a: number, b: number): number {
  const d = ((a - b) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)
  return d > Math.PI ? Math.PI * 2 - d : d
}

function offsetPoint(center: LatLng, distM: number, angleRad: number): [number, number] {
  const latDeg = distM / 111320
  const lngDeg = distM / (111320 * Math.cos((center.lat * Math.PI) / 180))
  return [
    center.lng + Math.sin(angleRad) * lngDeg,
    center.lat + Math.cos(angleRad) * latDeg,
  ]
}

function djb2(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i)
    h = h >>> 0
  }
  return h / 0xffffffff
}

function buildIrregularPolygon(centroid: LatLng, reports: FloodReport[], seed: string): [number, number][] {
  const phaseA = djb2(seed) * Math.PI * 2
  const phaseB = djb2(seed + 'b') * Math.PI * 2
  const phaseC = djb2(seed + 'c') * Math.PI * 2
  const phaseD = djb2(seed + 'd') * Math.PI * 2

  const polygon: [number, number][] = []
  for (let i = 0; i < POLY_RAYS; i++) {
    const angle = (i / POLY_RAYS) * Math.PI * 2

    // Find the max distance to any cluster report in this angular sector
    let maxDistM = MIN_RADIUS_M
    for (const r of reports) {
      const distM = haversineKm(centroid, r.position) * 1000
      const bearing = bearingRad(centroid, r.position)
      const diff = angularDiff(bearing, angle)
      if (diff < Math.PI / (POLY_RAYS / 2)) {
        maxDistM = Math.max(maxDistM, distM)
      }
    }

    const baseR = maxDistM + BUFFER_M

    // Multiple harmonic noise for organic shape
    const noise =
      0.14 * Math.sin(3 * angle + phaseA) +
      0.08 * Math.sin(7 * angle + phaseB) +
      0.05 * Math.cos(5 * angle + phaseC) +
      0.03 * Math.sin(11 * angle + phaseD)

    polygon.push(offsetPoint(centroid, baseR * (1 + noise), angle))
  }

  // Close the ring
  polygon.push(polygon[0])
  return polygon
}

export function computeSimulationSuggestions(): SimulationSuggestion[] {
  const pubReports = FLOOD_REPORTS.filter(r => r.source === 'pub-risk-area')
  const syntheticSg = FLOOD_REPORTS.filter(r => r.id.startsWith('sg-live'))

  // Greedy single-linkage clustering of pub reports
  const clusters: FloodReport[][] = pubReports.map(r => [r])

  let merged = true
  while (merged) {
    merged = false
    outer: for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        if (haversineKm(weightedCentroid(clusters[i]), weightedCentroid(clusters[j])) < CLUSTER_MERGE_KM) {
          clusters[i] = [...clusters[i], ...clusters[j]]
          clusters.splice(j, 1)
          merged = true
          break outer
        }
      }
    }
  }

  // Score and rank clusters
  const scored = clusters.map(reports => {
    const centroid = weightedCentroid(reports)
    const pubScore = reports.reduce((s, r) => s + r.severity * r.confidence, 0)
    const nearbyCount = syntheticSg.filter(r => haversineKm(centroid, r.position) < NEARBY_RADIUS_KM).length
    const score = pubScore * Math.sqrt(1 + nearbyCount * 0.04)
    const meanSeverity = reports.reduce((s, r) => s + r.severity, 0) / reports.length
    const topReport = [...reports].sort((a, b) => b.severity * b.confidence - a.severity * a.confidence)[0]
    return { reports, centroid, nearbyCount, score, meanSeverity, topReport }
  })

  scored.sort((a, b) => b.score - a.score)

  return scored.slice(0, MAX_SUGGESTIONS).map(({ reports, centroid, nearbyCount, score, meanSeverity, topReport }) => {
    const id = `sim-suggestion-${topReport.id}`
    const rawLabel = topReport.locationName.split('/')[0].split(' near ')[0].trim()
    const label = rawLabel.length > 22 ? rawLabel.slice(0, 21) + '…' : rawLabel
    return {
      id,
      label,
      centroid,
      polygon: buildIrregularPolygon(centroid, reports, id),
      pubReportCount: reports.length,
      nearbyReportCount: reports.length + nearbyCount,
      meanSeverity,
      score,
      topReport,
    }
  })
}
