import { PathLayer, SolidPolygonLayer, ScatterplotLayer } from '@deck.gl/layers'
import { makeCircleCoords } from '@/lib/geoUtils'
import type { LatLng } from '@/types'

// Covers the entire Mercator-visible world
const WORLD_RING: [number, number][] = [
  [-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85],
]

interface SelectionRing {
  path: [number, number, number][]
}

export function makeSelectionLayer(center: LatLng, radiusKm: number) {
  return new PathLayer<SelectionRing>({
    id: 'selection-circle',
    data: [{
      path: makeCircleCoords([center.lng, center.lat], radiusKm, 96)
        .map(([lng, lat]) => [lng, lat, 1] as [number, number, number]),
    }],
    getPath: d => d.path,
    getColor: [100, 180, 255, 220],
    getWidth: 3,
    widthUnits: 'pixels',
    pickable: false,
  })
}

type MaskBand = { polygon: [number, number][][]; alpha: number }

/**
 * Gradient void — concentric donut rings stepping from transparent at the
 * selection boundary to fully opaque, so the surrounding area dissolves
 * naturally without any visible walls.
 */
export function makeSelectionMaskLayer(center: LatLng, radiusKm: number) {
  const c: [number, number] = [center.lng, center.lat]

  // Each band: [delta from selection edge (inner), delta (outer), alpha]
  const defs: [number, number, number][] = [
    [0,    0.07, 35],
    [0.07, 0.15, 105],
    [0.15, 0.25, 185],
    [0.25, 100,  252],
  ]

  const bands: MaskBand[] = defs.map(([di, do_, alpha]) => ({
    polygon: [
      makeCircleCoords(c, radiusKm + do_, 96),
      [...makeCircleCoords(c, radiusKm + di, 96)].reverse(),
    ],
    alpha,
  }))

  return new SolidPolygonLayer<MaskBand>({
    id: 'selection-mask-3d',
    data: bands,
    getPolygon: d => d.polygon,
    extruded: false,
    getFillColor: d => [13, 14, 20, d.alpha],
    pickable: false,
    updateTriggers: { getFillColor: [center.lat, center.lng, radiusKm] },
  })
}

export function makeLassoSelectionLayer(polygon: [number, number][], isClosed = true) {
  const path = [...polygon]
  if (isClosed && path.length > 0 && (path[0][0] !== path[path.length - 1][0] || path[0][1] !== path[path.length - 1][1])) {
    path.push(path[0])
  }

  return new PathLayer<SelectionRing>({
    id: 'selection-lasso-line',
    data: [{
      path: path.map(([lng, lat]) => [lng, lat, 1] as [number, number, number]),
    }],
    getPath: (d: SelectionRing) => d.path,
    getColor: [100, 180, 255, 220],
    getWidth: 3,
    widthUnits: 'pixels',
    dashed: !isClosed,
    getDashArray: !isClosed ? [3, 3] : undefined,
    dashJustified: true,
    pickable: false,
    updateTriggers: {
      getPath: [polygon.length, isClosed],
    }
  } as any)
}

export function makeLassoHandlesLayer(
  polygon: [number, number][],
  onDragHandle: (index: number, coordinate: [number, number]) => void
) {
  if (polygon.length === 0) return []

  // Create a handle for EVERY point in the polygon so all intermediate nodes can be adjusted
  const handles = polygon.map((position, index) => ({
    id: `node-${index}`,
    index,
    position
  }))

  return [
    new ScatterplotLayer({
      id: 'selection-lasso-handles',
      data: handles,
      getPosition: (d: any) => [d.position[0], d.position[1], 5],
      getRadius: 5, // Small, consistent pixel-sized circles
      radiusUnits: 'pixels',
      getFillColor: [255, 255, 255, 255],
      getLineColor: [100, 180, 255, 255],
      getLineWidth: 2,
      stroked: true,
      filled: true,
      pickable: true,
      onDragStart: (info: any, event: any) => {
        event.stopImmediatePropagation()
      },
      onDrag: (info: any, event: any) => {
        if (info.coordinate) {
          onDragHandle(info.object.index, [info.coordinate[0], info.coordinate[1]])
        }
      },
      updateTriggers: {
        getPosition: [polygon.length, ...polygon.flatMap(p => p)],
      }
    } as any)
  ]
}

export function makeLassoSelectionMaskLayer(polygon: [number, number][]) {
  const path = [...polygon]
  if (path.length > 0 && (path[0][0] !== path[path.length - 1][0] || path[0][1] !== path[path.length - 1][1])) {
    path.push(path[0])
  }

  // Draw full mask outside lasso area. depthTest: false ensures the flat mask
  // covers extruded 3D buildings outside the selection, not just ground-level geometry.
  return new SolidPolygonLayer<{ polygon: [number, number][][] }>({
    id: 'selection-lasso-mask-3d',
    data: [{
      polygon: [
        WORLD_RING,
        [...path].reverse(),
      ],
    }],
    getPolygon: d => d.polygon,
    extruded: false,
    getFillColor: [13, 14, 20, 252],
    pickable: false,
    parameters: { depthCompare: 'always', depthWriteEnabled: false },
    updateTriggers: { getPolygon: [polygon.length] },
  })
}
