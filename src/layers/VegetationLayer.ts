import { PathLayer, PolygonLayer, ScatterplotLayer } from '@deck.gl/layers'
import { foliageShaderExtension } from '@/layers/RealisticShaderExtension'
import { blendRiskColor, floodRiskAt } from '@/lib/floodRisk'
import type { FloodReport, LatLng, VegetationFeature, VegetationKind } from '@/types'

interface VegetationPoint {
  id: string
  kind: VegetationKind
  position: [number, number]
}

function colorForKind(kind: VegetationKind): [number, number, number, number] {
  switch (kind) {
    case 'tree':
      return [54, 168, 92, 230]
    case 'tree-row':
      return [83, 190, 116, 235]
    case 'wood':
      return [35, 126, 74, 165]
    case 'park':
      return [92, 177, 93, 135]
    case 'scrub':
      return [120, 154, 78, 145]
    case 'garden':
      return [107, 190, 122, 145]
    case 'grass':
      return [145, 193, 98, 115]
  }
}

function featureCenter(feature: VegetationFeature): LatLng {
  const total = feature.points.reduce((sum, point) => ({ lat: sum.lat + point.lat, lng: sum.lng + point.lng }), { lat: 0, lng: 0 })
  return {
    lat: total.lat / Math.max(1, feature.points.length),
    lng: total.lng / Math.max(1, feature.points.length),
  }
}

export function makeVegetationLayers(features: VegetationFeature[], floodReports: FloodReport[] = []) {
  const polygons = features.filter(feature => feature.geometry === 'polygon' && feature.points.length >= 3)
  const paths = features.filter(feature => feature.geometry === 'line' && feature.points.length >= 2)
  const points: VegetationPoint[] = features
    .filter(feature => feature.geometry === 'point' && feature.points[0])
    .map(feature => ({
      id: feature.id,
      kind: feature.kind,
      position: [feature.points[0].lng, feature.points[0].lat],
    }))

  return [
    new PolygonLayer<VegetationFeature>({
      id: 'vegetation-polygons',
      data: polygons,
      getPolygon: feature => feature.points.map(point => [point.lng, point.lat] as [number, number]),
      getFillColor: feature => blendRiskColor(colorForKind(feature.kind), floodRiskAt(featureCenter(feature), floodReports), colorForKind(feature.kind)[3]),
      getLineColor: [24, 96, 56, 230],
      getLineWidth: 2,
      lineWidthMinPixels: 1,
      stroked: true,
      filled: true,
      pickable: false,
      extensions: [foliageShaderExtension],
    }),
    new PathLayer<VegetationFeature>({
      id: 'vegetation-paths',
      data: paths,
      getPath: feature => feature.points.map(point => [point.lng, point.lat] as [number, number]),
      getColor: feature => blendRiskColor(colorForKind(feature.kind), floodRiskAt(featureCenter(feature), floodReports), colorForKind(feature.kind)[3]),
      getWidth: 8,
      widthUnits: 'meters',
      widthMinPixels: 2,
      rounded: true,
      pickable: false,
      extensions: [foliageShaderExtension],
    }),
    new ScatterplotLayer<VegetationPoint>({
      id: 'vegetation-points',
      data: points,
      getPosition: point => point.position,
      getRadius: 5,
      radiusUnits: 'meters',
      radiusMinPixels: 3,
      radiusMaxPixels: 10,
      getFillColor: point => blendRiskColor(colorForKind(point.kind), floodRiskAt({ lat: point.position[1], lng: point.position[0] }, floodReports), colorForKind(point.kind)[3]),
      getLineColor: [232, 255, 225, 220],
      lineWidthMinPixels: 1,
      stroked: true,
      filled: true,
      pickable: false,
      extensions: [foliageShaderExtension],
    }),
  ]
}
