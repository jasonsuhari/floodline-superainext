import { PathLayer, PolygonLayer } from '@deck.gl/layers'
import type { Building, LatLng } from '@/types'

type Rgba = [number, number, number, number]

interface BuildingPathDetail {
  id: string
  building: Building
  path: [number, number, number][]
  color: Rgba
  width: number
}

const MAPBOX_FACADE: Rgba = [213, 209, 202, 230]
const MAPBOX_ROOF: Rgba = [178, 173, 165, 232]

function colorForBuilding(_building: Building): Rgba {
  return [MAPBOX_FACADE[0], MAPBOX_FACADE[1], MAPBOX_FACADE[2], 238]
}

function roofColorForBuilding(_building: Building): Rgba {
  return [MAPBOX_ROOF[0], MAPBOX_ROOF[1], MAPBOX_ROOF[2], 238]
}

// Return the open, deduplicated ring for a building footprint.
// OSM ways are closed rings (last node == first node) and can also contain
// consecutive duplicate vertices. Both cause degenerate triangles / zero-length
// path segments in deck.gl, so strip them before any rendering.
function openRing(building: Building): LatLng[] {
  const pts = building.footprint
  // Strip closing vertex
  const open = (pts.length >= 2 && pts[0].lat === pts[pts.length - 1].lat && pts[0].lng === pts[pts.length - 1].lng)
    ? pts.slice(0, -1)
    : pts
  // Strip consecutive duplicates
  const out: LatLng[] = []
  for (const pt of open) {
    const prev = out[out.length - 1]
    if (!prev || prev.lat !== pt.lat || prev.lng !== pt.lng) out.push(pt)
  }
  return out
}

function getBuildingPolygon(building: Building) {
  return openRing(building).map(point => [
    point.lng,
    point.lat,
    building.baseHeightM,
  ] as [number, number, number])
}

function getRoofPolygon(building: Building) {
  const roofZ = Math.max(building.heightM, building.baseHeightM + 1) + 0.08
  return openRing(building).map(point => [
    point.lng,
    point.lat,
    roofZ,
  ] as [number, number, number])
}

function getOutlinePath(building: Building) {
  const basePath = getRoofPolygon(building)
  const first = basePath[0]
  return first ? [...basePath, first] : basePath
}

function getFacadeBandColor(building: Building): Rgba {
  const facade = colorForBuilding(building)
  return [
    Math.max(35, Math.round(facade[0] * 0.62)),
    Math.max(35, Math.round(facade[1] * 0.62)),
    Math.max(35, Math.round(facade[2] * 0.62)),
    150,
  ]
}

function makeClosedPathAtHeight(building: Building, heightM: number) {
  const path = openRing(building).map(point => [
    point.lng,
    point.lat,
    heightM,
  ] as [number, number, number])
  const first = path[0]
  return first ? [...path, first] : path
}

function makeFacadeBands(building: Building): BuildingPathDetail[] {
  const floorHeightM = building.levels && building.levels > 0
    ? Math.max(2.6, Math.min(4.2, building.heightM / building.levels))
    : 3.2
  const firstBandM = building.baseHeightM + floorHeightM
  const maxBandCount = Math.min(14, Math.floor((building.heightM - firstBandM) / floorHeightM) + 1)
  const color = getFacadeBandColor(building)

  return Array.from({ length: Math.max(0, maxBandCount) }, (_, index) => {
    const heightM = firstBandM + index * floorHeightM
    return {
      id: `${building.id}-floor-${index}`,
      building,
      path: makeClosedPathAtHeight(building, heightM),
      color,
      width: 0.28,
    }
  })
}

function makeVerticalEdges(building: Building): BuildingPathDetail[] {
  const color = getFacadeBandColor(building)
  return openRing(building).map((point, index) => ({
    id: `${building.id}-edge-${index}`,
    building,
    path: [
      [point.lng, point.lat, building.baseHeightM],
      [point.lng, point.lat, building.heightM],
    ],
    color: [color[0], color[1], color[2], 115],
    width: 0.22,
  }))
}

function makeGroundFloorAccents(): BuildingPathDetail[] {
  return []
}

// Returns false if any non-adjacent edge pair crosses — earcut produces garbage
// triangles for self-intersecting rings, which appear as random floating shapes.
function isSimplePolygon(pts: LatLng[]): boolean {
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const ax = pts[i].lng,        ay = pts[i].lat
    const bx = pts[(i + 1) % n].lng, by = pts[(i + 1) % n].lat
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue // edges share vertex 0
      const cx = pts[j].lng,        cy = pts[j].lat
      const dx = pts[(j + 1) % n].lng, dy = pts[(j + 1) % n].lat
      const denom = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx)
      if (Math.abs(denom) < 1e-12) continue // parallel
      const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / denom
      const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / denom
      if (t > 0 && t < 1 && u > 0 && u < 1) return false
    }
  }
  return true
}

export function makeBuildingLayers(buildings: Building[], options?: { idPrefix?: string; parameters?: Record<string, unknown> }) {
  const idPrefix = options?.idPrefix ?? ''
  const parameters = options?.parameters

  const drawableBuildings = buildings.filter(building => {
    const ring = openRing(building)
    return ring.length >= 3 && building.heightM > 0 && isSimplePolygon(ring)
  })
  const facadeBands = drawableBuildings.flatMap(building => makeFacadeBands(building))
  const verticalEdges = drawableBuildings.flatMap(building => makeVerticalEdges(building))
  const groundFloorAccents = drawableBuildings.flatMap(makeGroundFloorAccents)

  return [
    new PolygonLayer<Building>({
      id: `${idPrefix}custom-building-extrusions`,
      data: drawableBuildings,
      getPolygon: getBuildingPolygon,
      extruded: true,
      wireframe: false,
      getElevation: building => Math.max(1, building.heightM - building.baseHeightM),
      getFillColor: building => colorForBuilding(building),
      filled: true,
      stroked: false,
      pickable: false,
      material: {
        ambient: 0.42,
        diffuse: 0.58,
        shininess: 18,
        specularColor: [210, 218, 220],
      },
      ...(parameters ? { parameters } : {}),
    }),
    new PolygonLayer<Building>({
      id: `${idPrefix}custom-building-roofs`,
      data: drawableBuildings,
      getPolygon: getRoofPolygon,
      getFillColor: building => roofColorForBuilding(building),
      filled: true,
      stroked: false,
      pickable: false,
      ...(parameters ? { parameters } : {}),
    }),
    new PathLayer<Building>({
      id: `${idPrefix}custom-building-roof-outlines`,
      data: drawableBuildings,
      getPath: getOutlinePath,
      getColor: [70, 66, 60, 145],
      getWidth: 0.55,
      widthUnits: 'meters',
      widthMinPixels: 0.45,
      rounded: false,
      pickable: false,
      ...(parameters ? { parameters } : {}),
    }),
    new PathLayer<BuildingPathDetail>({
      id: `${idPrefix}custom-building-floor-bands`,
      data: facadeBands,
      getPath: detail => detail.path,
      getColor: detail => detail.color,
      getWidth: detail => detail.width,
      widthUnits: 'meters',
      widthMinPixels: 0.35,
      rounded: false,
      pickable: false,
      ...(parameters ? { parameters } : {}),
    }),
    new PathLayer<BuildingPathDetail>({
      id: `${idPrefix}custom-building-vertical-edges`,
      data: verticalEdges,
      getPath: detail => detail.path,
      getColor: detail => detail.color,
      getWidth: detail => detail.width,
      widthUnits: 'meters',
      widthMinPixels: 0.25,
      rounded: false,
      pickable: false,
      ...(parameters ? { parameters } : {}),
    }),
    new PathLayer<BuildingPathDetail>({
      id: `${idPrefix}custom-building-poi-accents`,
      data: groundFloorAccents,
      getPath: detail => detail.path,
      getColor: detail => detail.color,
      getWidth: detail => detail.width,
      widthUnits: 'meters',
      widthMinPixels: 1.1,
      rounded: false,
      pickable: false,
      ...(parameters ? { parameters } : {}),
    }),
  ]
}
