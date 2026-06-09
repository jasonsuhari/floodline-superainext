import type { FloodDepthCell, LatLng } from '@/types'

export interface WorldModelResult {
  videoUrl: string
  depthM: number
  prompt: string
  generatedAt: number
}

const LAT_SCALE = 110540
const LNG_SCALE = 111320

function metersApart(a: LatLng, b: LatLng): number {
  const lngScale = LNG_SCALE * Math.cos(a.lat * Math.PI / 180)
  const dx = (b.lng - a.lng) * lngScale
  const dy = (b.lat - a.lat) * LAT_SCALE
  return Math.sqrt(dx * dx + dy * dy)
}

export function getDepthAtLocation(cells: FloodDepthCell[], location: LatLng): number {
  if (cells.length === 0) return 0
  let closest = cells[0]
  let minDist = metersApart(location, cells[0].position)
  for (const cell of cells.slice(1)) {
    const d = metersApart(location, cell.position)
    if (d < minDist) { minDist = d; closest = cell }
  }
  return closest.depthM
}

export function depthToLabel(depthM: number): string {
  if (depthM < 0.01) return 'No flooding at this location'
  if (depthM < 0.15) return `${(depthM * 100).toFixed(0)} cm — ankle-deep`
  if (depthM < 0.4) return `${depthM.toFixed(2)} m — knee-deep`
  if (depthM < 0.8) return `${depthM.toFixed(2)} m — waist-deep`
  return `${depthM.toFixed(2)} m — severe / chest-deep`
}

export function depthToPrompt(depthM: number, hasIntervention: boolean): string {
  let base: string
  if (depthM < 0.01) {
    base = 'a normal Singapore urban street, pedestrians walking on dry pavement, sunny tropical weather, clear road'
  } else if (depthM < 0.15) {
    base = 'Singapore urban street during a flash flood, ankle-deep murky brown rainwater covering the pavement, pedestrians cautiously stepping through the water, overcast sky, light rain, tropical flood'
  } else if (depthM < 0.4) {
    base = 'Singapore street severely flooded, knee-deep muddy brown floodwater flowing through the road, pedestrians wading with difficulty, some sheltering in shop doorways, heavy tropical rain, urban flooding'
  } else if (depthM < 0.8) {
    base = 'Singapore street catastrophically flooded, waist-deep turbid brown floodwater, debris and leaves floating on the water surface, people clinging to railings, cars partially submerged, emergency conditions, extreme urban flood'
  } else {
    base = 'Singapore street underwater from extreme flooding, chest-deep turbulent brown floodwater, vehicles fully submerged, people on elevated surfaces, catastrophic urban flood disaster, emergency rescue'
  }

  if (hasIntervention) {
    base += ', flood barriers and improved drainage infrastructure clearly visible, water level controlled, evidence of successful flood mitigation measures'
  }

  return base
}
