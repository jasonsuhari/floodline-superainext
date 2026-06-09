import { ScatterplotLayer } from '@deck.gl/layers'
import type { TrafficPoint } from '@/types'

function getColor(point: TrafficPoint): [number, number, number, number] {
  const alpha = Math.round(40 + point.weight * 100)
  if (point.category === 'transit-hub') return [60, 220, 255, alpha]
  if (point.category === 'restaurant' || point.category === 'cafe' || point.category === 'bar') return [255, 140, 50, alpha]
  if (point.category === 'retail' || point.category === 'grocery') return [255, 200, 60, alpha]
  if (point.category === 'entertainment') return [200, 100, 255, alpha]
  if (point.category === 'office') return [120, 180, 255, alpha]
  return [255, 160, 80, alpha]
}

export function makeTrafficDensityLayers(points: TrafficPoint[]) {
  return [
    new ScatterplotLayer<TrafficPoint>({
      id: 'traffic-density-glow',
      data: points,
      getPosition: p => [p.position.lng, p.position.lat, 0],
      getRadius: p => 12 + p.weight * 28,
      radiusUnits: 'meters',
      radiusMinPixels: 3,
      radiusMaxPixels: 30,
      getFillColor: p => {
        const c = getColor(p)
        return [c[0], c[1], c[2], Math.round(c[3] * 0.45)]
      },
      stroked: false,
      filled: true,
      pickable: false,
    }),
    new ScatterplotLayer<TrafficPoint>({
      id: 'traffic-density-core',
      data: points,
      getPosition: p => [p.position.lng, p.position.lat, 0],
      getRadius: p => 4 + p.weight * 8,
      radiusUnits: 'meters',
      radiusMinPixels: 2,
      radiusMaxPixels: 12,
      getFillColor: getColor,
      stroked: false,
      filled: true,
      pickable: false,
    }),
  ]
}
