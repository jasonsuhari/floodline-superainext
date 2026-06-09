import { PathLayer, ScatterplotLayer } from '@deck.gl/layers'
import type { RoadSegment, TrafficPoint } from '@/types'

const ELEV = 1  // ground-level so lines appear on the road surface

// Maps weight [0,1] -> gray (quiet) -> green (some people) -> red (busy).
function trafficColor(weight: number, alpha: number): [number, number, number, number] {
  const w = Math.max(0, Math.min(1, weight))
  let r: number, g: number, b: number
  if (w < 0.35) {
    const t = w / 0.35
    r = Math.round(118 - t * 38)
    g = Math.round(126 + t * 34)
    b = Math.round(135 - t * 55)
  } else if (w < 0.78) {
    const t = (w - 0.35) / 0.43
    r = Math.round(80 - t * 30)
    g = Math.round(160 + t * 70)
    b = Math.round(80 - t * 20)
  } else {
    const t = (w - 0.78) / 0.22
    r = Math.round(50 + t * 205)
    g = Math.round(230 - t * 185)
    b = Math.round(60 - t * 50)
  }
  return [r, g, b, alpha]
}

function roadLineWidth(road: RoadSegment) {
  if (road.kind === 'footway' || road.kind === 'path' || road.kind === 'pedestrian') return 3.2
  if (road.kind === 'primary') return 7
  if (road.kind === 'secondary') return 5
  return 3.8
}

export function makeTrafficFlowLayers(
  points: TrafficPoint[],
  roads: RoadSegment[],
) {
  return [
    new ScatterplotLayer<TrafficPoint>({
      id: 'traffic-activity-glow',
      data: points,
      getPosition: p => [p.position.lng, p.position.lat, ELEV + 0.2],
      getRadius: p => 10 + p.weight * 20,
      radiusUnits: 'meters',
      radiusMinPixels: 3,
      radiusMaxPixels: 18,
      getFillColor: p => trafficColor(p.weight, Math.round(18 + p.weight * 34)),
      stroked: false,
      filled: true,
      pickable: false,
    }),

    // Subtle transparent green→red overlay on roads showing foot traffic intensity
    new PathLayer<RoadSegment>({
      id: 'traffic-road-lines',
      data: roads,
      getPath: r => r.path.map(p => [p.lng, p.lat, ELEV]) as [number, number, number][],
      getColor: r => trafficColor(r.weight, Math.round(38 + r.weight * 72)),
      getWidth: roadLineWidth,
      widthUnits: 'meters',
      widthMinPixels: 2.5,
      widthMaxPixels: 13,
      pickable: false,
    }),

    // Activity node anchors
    new ScatterplotLayer<TrafficPoint>({
      id: 'traffic-activity-nodes',
      data: points,
      getPosition: p => [p.position.lng, p.position.lat, ELEV + 0.4],
      getRadius: p => 4 + p.weight * 7,
      radiusUnits: 'meters',
      radiusMinPixels: 2,
      radiusMaxPixels: 9,
      getFillColor: p => trafficColor(p.weight, Math.round(120 + p.weight * 80)),
      getLineColor: [255, 255, 255, 170],
      getLineWidth: 1,
      lineWidthUnits: 'pixels',
      stroked: true,
      pickable: false,
    }),
  ]
}
