import type { FloodReport, LatLng } from '@/types'

const METERS_PER_LAT_DEGREE = 110540
const METERS_PER_LNG_DEGREE = 111320

export function distanceMeters(a: LatLng, b: LatLng): number {
  const lngScale = METERS_PER_LNG_DEGREE * Math.cos(a.lat * Math.PI / 180)
  const dlat = (b.lat - a.lat) * METERS_PER_LAT_DEGREE
  const dlng = (b.lng - a.lng) * lngScale
  return Math.sqrt(dlat * dlat + dlng * dlng)
}

export function floodRiskAt(position: LatLng, reports: FloodReport[]): number {
  let risk = 0
  for (const report of reports) {
    const radiusM = report.source === 'pub-risk-area' ? 1150 : 760
    const dist = distanceMeters(position, report.position)
    if (dist > radiusM) continue
    const falloff = 1 - dist / radiusM
    risk += falloff * falloff * (0.22 + report.severity * 0.18) * report.confidence
  }
  return Math.min(1, risk)
}

export function blendRiskColor(
  base: [number, number, number, number],
  risk: number,
  alpha = base[3],
): [number, number, number, number] {
  if (risk <= 0.02) return [base[0], base[1], base[2], alpha]
  const hot: [number, number, number] = risk > 0.72 ? [255, 48, 42] : risk > 0.42 ? [255, 110, 48] : [255, 190, 68]
  const t = Math.min(0.86, 0.18 + risk * 0.78)
  return [
    Math.round(base[0] * (1 - t) + hot[0] * t),
    Math.round(base[1] * (1 - t) + hot[1] * t),
    Math.round(base[2] * (1 - t) + hot[2] * t),
    alpha,
  ]
}
