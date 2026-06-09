import type { Building, BuildingPoiCategory, LatLng, RoadKind, RoadSegment, StreetFixture, StreetFixtureKind, TrafficPoint, VegetationFeature, VegetationKind, WaterBody } from '@/types'

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
]
const OVERPASS_URL = OVERPASS_MIRRORS[0]
const OVERPASS_HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded',
  'User-Agent': 'Faultline/0.1',
}

async function overpassFetch(query: string, timeoutMs = 8000): Promise<OverpassResponse> {
  const body = `data=${encodeURIComponent(query)}`
  for (const mirror of OVERPASS_MIRRORS) {
    try {
      const res = await fetch(mirror, {
        method: 'POST',
        headers: OVERPASS_HEADERS,
        body,
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!res.ok) continue
      return await res.json() as OverpassResponse
    } catch {
      // try next mirror
    }
  }
  throw new Error('All Overpass mirrors failed or timed out')
}

interface OverpassGeometryPoint {
  lat: number
  lon: number
}

interface OverpassWay {
  type: string
  id: number | string
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
  geometry?: OverpassGeometryPoint[]
}

interface OverpassResponse {
  elements: OverpassWay[]
}

interface PoiCandidate {
  id: string
  point: LatLng
  category: BuildingPoiCategory
  name?: string
  tags: Record<string, string>
  priority: number
}

function kmToDeg(km: number): number {
  return km / 111.32
}

export function buildOverpassQuery(center: LatLng, radiusKm: number): string {
  const d = kmToDeg(radiusKm)
  const south = center.lat - d
  const north = center.lat + d
  const west = center.lng - d
  const east = center.lng + d
  const bbox = `(${south},${west},${north},${east})`

  return `[out:json][timeout:25];(
way["building"]${bbox};
node["amenity"]${bbox};
way["amenity"]${bbox};
node["shop"]${bbox};
way["shop"]${bbox};
node["tourism"]${bbox};
way["tourism"]${bbox};
node["leisure"]${bbox};
way["leisure"]${bbox};
node["office"]${bbox};
way["office"]${bbox};
);out tags geom;`
}

export function buildVegetationQuery(center: LatLng, radiusKm: number): string {
  const d = kmToDeg(radiusKm)
  const south = center.lat - d
  const north = center.lat + d
  const west = center.lng - d
  const east = center.lng + d
  const bbox = `(${south},${west},${north},${east})`

  return `[out:json][timeout:25];(
node["natural"="tree"]${bbox};
way["natural"~"^(tree|tree_row|wood|scrub)$"]${bbox};
relation["natural"~"^(wood|scrub)$"]${bbox};
way["landuse"~"^(forest|grass|recreation_ground)$"]${bbox};
relation["landuse"~"^(forest|grass|recreation_ground)$"]${bbox};
way["leisure"~"^(park|garden)$"]${bbox};
relation["leisure"~"^(park|garden)$"]${bbox};
);out tags geom;`
}

export function buildWaterQuery(center: LatLng, radiusKm: number): string {
  const d = kmToDeg(radiusKm)
  const south = center.lat - d
  const north = center.lat + d
  const west = center.lng - d
  const east = center.lng + d
  const bbox = `(${south},${west},${north},${east})`

  return `[out:json][timeout:25];(
way["natural"="water"]${bbox};
relation["natural"="water"]${bbox};
way["waterway"]${bbox};
relation["waterway"]${bbox};
way["natural"="coastline"]${bbox};
way["waterway"="drain"]${bbox};
way["waterway"="ditch"]${bbox};
way["waterway"="canal"]${bbox};
);out tags geom;`
}

export function parseOverpassResponse(data: OverpassResponse): Building[] {
  const poiCandidates = data.elements.flatMap(getPoiCandidate)

  return data.elements
    .filter((el): el is OverpassWay & { geometry: OverpassGeometryPoint[] } =>
      el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length >= 4 && Boolean(el.tags?.building)
    )
    .map(el => {
      const tags = el.tags ?? {}
      const footprint: LatLng[] = el.geometry.map(g => ({ lat: g.lat, lng: g.lon }))
      const centroid = computeCentroid(footprint)
      const levels = parseLevels(tags['building:levels'])
      const baseLevels = parseLevels(tags['building:min_level'])
      const heightM = parseMeters(tags.height) ?? (levels ? levels * 3.2 : 12)
      const baseHeightM = parseMeters(tags.min_height) ?? (baseLevels ? baseLevels * 3.2 : 0)
      const directPoi = getPoiCandidate(el)[0]
      const containedPoi = directPoi ?? findBestPoiForBuilding(footprint, poiCandidates)

      return {
        id: String(el.id),
        footprint,
        centroid,
        groundElevation: 0,
        heightM: Math.max(3, heightM),
        baseHeightM: Math.max(0, Math.min(baseHeightM, heightM - 1)),
        levels,
        facadeColor: tags['building:colour'] ?? tags.colour,
        roofColor: tags['roof:colour'],
        material: tags['building:material'] ?? tags.building,
        roofMaterial: tags['roof:material'] ?? tags['roof:shape'],
        poiCategory: containedPoi?.category ?? getBuildingCategory(tags),
        poiName: containedPoi?.name,
        poiTags: containedPoi?.tags,
        sourceTags: tags,
      }
    })
}

function getPoiCandidate(el: OverpassWay): PoiCandidate[] {
  const tags = el.tags ?? {}
  const category = getPoiCategory(tags)
  if (!category) return []

  let point: LatLng | null = null
  if (el.type === 'node' && typeof el.lat === 'number' && typeof el.lon === 'number') {
    point = { lat: el.lat, lng: el.lon }
  } else if (Array.isArray(el.geometry) && el.geometry.length > 0) {
    point = computeCentroid(el.geometry.map(g => ({ lat: g.lat, lng: g.lon })))
  }

  if (!point) return []

  return [{
    id: `${el.type}-${el.id}`,
    point,
    category,
    name: tags.name ?? tags.brand ?? tags.operator,
    tags,
    priority: getPoiPriority(category),
  }]
}

function getPoiCategory(tags: Record<string, string>): BuildingPoiCategory | null {
  const amenity = tags.amenity
  const shop = tags.shop
  const tourism = tags.tourism
  const leisure = tags.leisure
  const office = tags.office

  if (amenity === 'restaurant' || amenity === 'fast_food' || amenity === 'food_court') return 'restaurant'
  if (amenity === 'cafe') return 'cafe'
  if (amenity === 'bar' || amenity === 'pub' || amenity === 'nightclub') return 'bar'
  if (amenity === 'school' || amenity === 'college' || amenity === 'university' || amenity === 'kindergarten') return 'school'
  if (amenity === 'clinic' || amenity === 'doctors' || amenity === 'hospital' || amenity === 'pharmacy') return 'medical'
  if (amenity === 'bus_station' || amenity === 'ferry_terminal' || amenity === 'taxi') return 'transit'
  if (amenity === 'parking' || amenity === 'parking_entrance') return 'parking'
  if (amenity === 'cinema' || amenity === 'theatre' || leisure === 'fitness_centre' || leisure === 'sports_centre') return 'entertainment'
  if (amenity === 'place_of_worship') return 'worship'

  if (shop === 'supermarket' || shop === 'convenience' || shop === 'bakery' || shop === 'greengrocer') return 'grocery'
  if (shop) return 'retail'
  if (tourism === 'hotel' || tourism === 'hostel' || tourism === 'guest_house') return 'hotel'
  if (tourism === 'museum' || tourism === 'attraction') return 'entertainment'
  if (office) return 'office'

  return null
}

function getBuildingCategory(tags: Record<string, string>): BuildingPoiCategory | undefined {
  const building = tags.building
  if (building === 'apartments' || building === 'residential' || building === 'house' || building === 'terrace') return 'residential'
  if (building === 'commercial' || building === 'office') return 'office'
  if (building === 'retail' || building === 'supermarket') return 'retail'
  if (building === 'hotel') return 'hotel'
  if (building === 'school' || building === 'university' || building === 'college') return 'school'
  if (building === 'hospital') return 'medical'
  if (building === 'industrial' || building === 'warehouse') return 'industrial'
  if (building === 'parking') return 'parking'
  return undefined
}

function getPoiPriority(category: BuildingPoiCategory): number {
  switch (category) {
    case 'restaurant':
    case 'cafe':
    case 'bar':
    case 'grocery':
    case 'retail':
      return 90
    case 'hotel':
    case 'medical':
    case 'school':
      return 80
    case 'entertainment':
    case 'transit':
      return 70
    case 'office':
      return 55
    case 'worship':
    case 'parking':
      return 45
    case 'industrial':
    case 'residential':
      return 20
  }
}

function findBestPoiForBuilding(footprint: LatLng[], candidates: PoiCandidate[]): PoiCandidate | undefined {
  return candidates
    .filter(candidate => pointInPolygon(candidate.point, footprint))
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))[0]
}

function pointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  let inside = false

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].lng
    const yi = polygon[i].lat
    const xj = polygon[j].lng
    const yj = polygon[j].lat
    const intersects = ((yi > point.lat) !== (yj > point.lat)) &&
      (point.lng < (xj - xi) * (point.lat - yi) / (yj - yi || Number.EPSILON) + xi)
    if (intersects) inside = !inside
  }

  return inside
}

function parseMeters(value: string | undefined): number | undefined {
  if (!value) return undefined

  const trimmed = value.trim().toLowerCase()
  const match = trimmed.match(/^-?\d+(?:[.,]\d+)?/)
  if (!match) return undefined

  const amount = Number.parseFloat(match[0].replace(',', '.'))
  if (!Number.isFinite(amount) || amount <= 0) return undefined

  if (trimmed.includes('ft') || trimmed.includes('feet')) {
    return amount * 0.3048
  }

  return amount
}

function parseLevels(value: string | undefined): number | undefined {
  if (!value) return undefined

  const amount = Number.parseFloat(value.replace(',', '.'))
  if (!Number.isFinite(amount) || amount <= 0) return undefined

  return Math.round(amount)
}

function computeCentroid(points: LatLng[]): LatLng {
  const n = points.length
  if (n === 0) return { lat: 0, lng: 0 }
  const sum = points.reduce((acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }), { lat: 0, lng: 0 })
  return { lat: sum.lat / n, lng: sum.lng / n }
}

function getVegetationKind(tags: Record<string, string> = {}): VegetationKind | null {
  if (tags.natural === 'tree') return 'tree'
  if (tags.natural === 'tree_row') return 'tree-row'
  if (tags.natural === 'wood' || tags.landuse === 'forest') return 'wood'
  if (tags.natural === 'scrub') return 'scrub'
  if (tags.leisure === 'park') return 'park'
  if (tags.leisure === 'garden') return 'garden'
  if (tags.landuse === 'grass' || tags.landuse === 'recreation_ground') return 'grass'
  return null
}

function isClosedRing(points: LatLng[]): boolean {
  if (points.length < 4) return false
  const first = points[0]
  const last = points[points.length - 1]
  return Math.abs(first.lat - last.lat) < 0.000001 && Math.abs(first.lng - last.lng) < 0.000001
}

export function parseVegetationResponse(data: OverpassResponse): VegetationFeature[] {
  return data.elements.flatMap<VegetationFeature>(el => {
    const kind = getVegetationKind(el.tags)
    if (!kind) return []

    if (el.type === 'node' && typeof el.lat === 'number' && typeof el.lon === 'number') {
      return [{
        id: String(el.id),
        kind,
        geometry: 'point' as const,
        points: [{ lat: el.lat, lng: el.lon }],
      }]
    }

    if (!Array.isArray(el.geometry) || el.geometry.length < 2) return []

    const points = el.geometry.map(g => ({ lat: g.lat, lng: g.lon }))
    const shouldBePolygon = kind !== 'tree-row' && (isClosedRing(points) || kind !== 'tree')

    return [{
      id: String(el.id),
      kind,
      geometry: shouldBePolygon ? 'polygon' as const : 'line' as const,
      points,
    }]
  })
}

export function parseWaterResponse(data: OverpassResponse): WaterBody[] {
  return data.elements.flatMap<WaterBody>(el => {
    if (el.type !== 'way' && el.type !== 'relation') return []
    if (!Array.isArray(el.geometry) || el.geometry.length < 2) return []

    const tags = el.tags ?? {}
    const points = el.geometry.map(g => ({ lat: g.lat, lng: g.lon }))
    const isCoastline = tags.natural === 'coastline'
    const isWaterway = Boolean(tags.waterway)
    const isWaterPolygon = tags.natural === 'water'

    if (!isCoastline && !isWaterway && !isWaterPolygon) return []

    const geometry = isCoastline || isWaterway ? 'line' as const : isClosedRing(points) ? 'polygon' as const : 'line' as const
    const kind: WaterBody['kind'] = isCoastline ? 'coastline' : isWaterway ? 'waterway' : 'water'

    return [{
      id: String(el.id),
      kind,
      geometry,
      points,
      source: 'overpass',
      confidence: geometry === 'polygon' ? 0.8 : 0.72,
      tags,
    }]
  })
}

export async function fetchBuildings(center: LatLng, radiusKm: number): Promise<Building[]> {
  const query = buildOverpassQuery(center, radiusKm)
  return parseOverpassResponse(await overpassFetch(query))
}

export async function fetchWaterBodies(center: LatLng, radiusKm: number): Promise<WaterBody[]> {
  const query = buildWaterQuery(center, radiusKm)
  return parseWaterResponse(await overpassFetch(query))
}

export function buildStreetFixturesQuery(center: LatLng, radiusKm: number): string {
  const radiusM = Math.round(radiusKm * 1000)
  const around = `(around:${radiusM},${center.lat},${center.lng})`

  return `[out:json][timeout:25];(
node["highway"="traffic_signals"]${around};
node["highway"="crossing"]["crossing"!="no"]${around};
node["highway"="bus_stop"]${around};
node["amenity"="bench"]${around};
node["highway"="street_lamp"]${around};
node["amenity"="bicycle_parking"]${around};
node["barrier"="bollard"]${around};
node["amenity"="waste_basket"]${around};
node["amenity"="atm"]${around};
node["railway"="subway_entrance"]${around};
node["amenity"="taxi"]${around};
node["amenity"="charging_station"]${around};
node["amenity"="fountain"]${around};
node["man_made"="pumping_station"]${around};
node["drain"="grate"]${around};
node["highway"="drain"]${around};
);out tags;`
}

function getStreetFixtureKind(tags: Record<string, string>): StreetFixtureKind | null {
  if (tags.highway === 'traffic_signals') return 'traffic-signal'
  if (tags.highway === 'crossing') return 'crossing'
  if (tags.highway === 'bus_stop') return 'bus-stop'
  if (tags.amenity === 'bench') return 'bench'
  if (tags.highway === 'street_lamp') return 'street-lamp'
  if (tags.amenity === 'bicycle_parking') return 'bicycle-parking'
  if (tags.barrier === 'bollard') return 'bollard'
  if (tags.amenity === 'waste_basket') return 'waste-bin'
  if (tags.amenity === 'atm') return 'atm'
  if (tags.railway === 'subway_entrance') return 'subway-entrance'
  if (tags.amenity === 'taxi') return 'taxi-stand'
  if (tags.amenity === 'charging_station') return 'charging-station'
  if (tags.amenity === 'fountain') return 'fountain'
  if (tags.man_made === 'pumping_station') return 'pumping-station'
  if (tags.drain === 'grate' || tags.highway === 'drain') return 'drain-grate'
  return null
}

export function parseStreetFixturesResponse(data: OverpassResponse): StreetFixture[] {
  return data.elements.flatMap<StreetFixture>(el => {
    if (el.type !== 'node' || typeof el.lat !== 'number' || typeof el.lon !== 'number') return []

    const tags = el.tags ?? {}
    const kind = getStreetFixtureKind(tags)
    if (!kind) return []

    return [{
      id: String(el.id),
      kind,
      position: { lat: el.lat, lng: el.lon },
      name: tags.name ?? tags.ref ?? (kind === 'pumping-station' ? 'Pumping Station' : kind === 'drain-grate' ? 'Drain Grate/Inlet' : undefined),
      tags,
      source: 'overpass',
      confidence: 0.78,
    }]
  })
}

export async function fetchStreetFixtures(center: LatLng, radiusKm: number): Promise<StreetFixture[]> {
  const query = buildStreetFixturesQuery(center, radiusKm)
  return parseStreetFixturesResponse(await overpassFetch(query))
}

export function buildTrafficDensityQuery(center: LatLng, radiusKm: number): string {
  const d = kmToDeg(radiusKm)
  const south = center.lat - d
  const north = center.lat + d
  const west = center.lng - d
  const east = center.lng + d
  const bb = `${south},${west},${north},${east}`

  return `[out:json][timeout:20];(
nwr["amenity"="restaurant"](${bb});
nwr["amenity"="fast_food"](${bb});
nwr["amenity"="cafe"](${bb});
nwr["amenity"="bar"](${bb});
nwr["amenity"="pub"](${bb});
nwr["amenity"="nightclub"](${bb});
nwr["amenity"="cinema"](${bb});
nwr["amenity"="theatre"](${bb});
nwr["amenity"="pharmacy"](${bb});
nwr["amenity"="hospital"](${bb});
nwr["amenity"="school"](${bb});
nwr["amenity"="university"](${bb});
nwr["amenity"="bus_station"](${bb});
nwr["shop"](${bb});
node["highway"="bus_stop"](${bb});
node["railway"="station"](${bb});
node["railway"="subway_entrance"](${bb});
node["tourism"="hotel"](${bb});
nwr["tourism"="museum"](${bb});
nwr["tourism"="attraction"](${bb});
nwr["office"](${bb});
);out center tags;`
}

function getTrafficWeight(tags: Record<string, string>): number {
  const amenity = tags.amenity
  const railway = tags.railway
  const publicTransport = tags.public_transport
  const highway = tags.highway

  if (railway === 'station' || publicTransport === 'stop_position') return 1.0
  if (highway === 'bus_stop' || railway === 'subway_entrance' || railway === 'tram_stop' || amenity === 'bus_station' || amenity === 'ferry_terminal') return 0.9
  if (amenity === 'restaurant' || amenity === 'fast_food' || amenity === 'food_court') return 0.8
  if (amenity === 'cafe' || amenity === 'bar' || amenity === 'pub' || amenity === 'nightclub') return 0.75
  if (amenity === 'cinema' || amenity === 'theatre') return 0.7
  if (tags.shop === 'supermarket' || tags.shop === 'convenience') return 0.7
  if (tags.shop) return 0.6
  if (tags.tourism === 'hotel' || tags.tourism === 'hostel') return 0.65
  if (tags.tourism === 'museum' || tags.tourism === 'attraction') return 0.6
  if (amenity === 'hospital' || amenity === 'school' || amenity === 'university' || amenity === 'college') return 0.55
  if (tags.leisure) return 0.5
  if (tags.office) return 0.45
  return 0.3
}

export function parseTrafficDensityResponse(data: OverpassResponse): TrafficPoint[] {
  return data.elements.flatMap<TrafficPoint>(el => {
    const tags = el.tags ?? {}

    let lat: number | undefined
    let lon: number | undefined

    if (el.type === 'node' && typeof el.lat === 'number' && typeof el.lon === 'number') {
      lat = el.lat
      lon = el.lon
    } else if ((el.type === 'way' || el.type === 'relation') && el.center) {
      lat = el.center.lat
      lon = el.center.lon
    }

    if (lat === undefined || lon === undefined) return []

    const weight = getTrafficWeight(tags)
    const category = getPoiCategory(tags) ?? 'transit-hub'

    return [{
      id: `${el.type}-${el.id}`,
      position: { lat, lng: lon },
      weight,
      category,
      source: 'inferred',
      confidence: 0.58,
      label: 'Inferred from OSM POI/transit context',
    }]
  })
}

export async function fetchTrafficDensity(center: LatLng, radiusKm: number): Promise<TrafficPoint[]> {
  const query = buildTrafficDensityQuery(center, radiusKm)
  return parseTrafficDensityResponse(await overpassFetch(query))
}

export async function fetchVegetation(center: LatLng, radiusKm: number): Promise<VegetationFeature[]> {
  const query = buildVegetationQuery(center, radiusKm)
  return parseVegetationResponse(await overpassFetch(query))
}

export function buildRoadQuery(center: LatLng, radiusKm: number): string {
  const d = kmToDeg(radiusKm)
  const bb = `${center.lat - d},${center.lng - d},${center.lat + d},${center.lng + d}`
  return `[out:json][timeout:20];(
way["highway"](${bb});
);out tags geom;`
}

function getRoadKind(highway: string): RoadKind {
  if (highway === 'footway' || highway === 'steps') return 'footway'
  if (highway === 'path' || highway === 'cycleway') return 'path'
  if (highway === 'pedestrian' || highway === 'living_street') return 'pedestrian'
  if (highway === 'residential' || highway === 'service' || highway === 'unclassified' || highway === 'road' || highway === 'track') return 'residential'
  if (highway === 'secondary' || highway === 'secondary_link' || highway === 'tertiary' || highway === 'tertiary_link') return 'secondary'
  if (highway === 'primary' || highway === 'primary_link') return 'primary'
  return 'other'
}

function getRoadWeight(kind: RoadKind): number {
  if (kind === 'pedestrian') return 0.74
  if (kind === 'footway') return 0.66
  if (kind === 'path') return 0.54
  if (kind === 'primary') return 0.42
  if (kind === 'secondary') return 0.38
  if (kind === 'residential') return 0.3
  return 0.22
}

export function parseRoadResponse(data: OverpassResponse): RoadSegment[] {
  const segments = data.elements.flatMap<RoadSegment>(el => {
    if (el.type !== 'way' || !Array.isArray(el.geometry) || el.geometry.length < 2) return []
    const highway = el.tags?.highway
    if (!highway) return []
    const kind = getRoadKind(highway)
    return [{
      id: String(el.id),
      path: el.geometry.map(g => ({ lat: g.lat, lng: g.lon })),
      kind,
      weight: getRoadWeight(kind),
      source: 'overpass',
      confidence: 0.76,
      label: 'OSM road/path network',
    }]
  })

  // Return every road/pathway in the selected radius; rendering remains bounded by the selection.
  return segments
    .sort((a, b) => b.weight - a.weight)
}

export async function fetchRoads(center: LatLng, radiusKm: number): Promise<RoadSegment[]> {
  const query = buildRoadQuery(center, radiusKm)
  return parseRoadResponse(await overpassFetch(query))
}
