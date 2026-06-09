import type { AgentBehavior, Building, LatLng, PedestrianAgent, RoadSegment, TrafficPoint } from '@/types'
import { createBehavior } from './agentBehaviors'
import { getAgentModel, pickAgentName, pickWeightedAgentKind } from './agentIdentity'

const LOOP_LENGTH_M = 14
const METERS_PER_LAT_DEGREE = 110540
const METERS_PER_LNG_DEGREE = 111320
const MAX_PLACEMENT_RETRIES = 30

export function offsetLatLng(origin: LatLng, eastM: number, northM: number): LatLng {
  const lngScale = METERS_PER_LNG_DEGREE * Math.cos(origin.lat * Math.PI / 180)
  return {
    lat: origin.lat + northM / METERS_PER_LAT_DEGREE,
    lng: origin.lng + eastM / lngScale,
  }
}

export function pointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  let inside = false
  const x = point.lng, y = point.lat
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat
    const xj = polygon[j].lng, yj = polygon[j].lat
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

export function isInsideBuilding(pos: LatLng, buildings: Building[]): boolean {
  for (const b of buildings) {
    if (pointInPolygon(pos, b.footprint)) return true
  }
  return false
}

function makeAgent(i: number, position: LatLng, ts: number): PedestrianAgent {
  const id = `pedestrian-${ts}-${i}`
  const kind = pickWeightedAgentKind({ includeVehicles: false })
  const model = getAgentModel(kind)
  return {
    id,
    name: pickAgentName(id),
    position,
    heading: Math.random() * 360,
    speedMps: model.speed[0] + Math.random() * (model.speed[1] - model.speed[0]),
    phaseOffsetM: Math.random() * LOOP_LENGTH_M,
    visual: 'walker',
    kind,
  }
}

function safePosition(
  sample: () => LatLng,
  buildings: Building[],
): LatLng {
  for (let attempt = 0; attempt < MAX_PLACEMENT_RETRIES; attempt++) {
    const pos = sample()
    if (!isInsideBuilding(pos, buildings)) return pos
  }
  return sample() // give up and accept it rather than hang
}

export function spawnAgentsInRadius(
  center: LatLng,
  radiusM: number,
  count: number,
  buildings: Building[] = [],
): PedestrianAgent[] {
  const ts = Date.now()
  return Array.from({ length: count }, (_, i) => {
    const pos = safePosition(() => {
      const r = radiusM * Math.sqrt(Math.random())
      const angle = Math.random() * 2 * Math.PI
      return offsetLatLng(center, r * Math.cos(angle), r * Math.sin(angle))
    }, buildings)
    return makeAgent(i, pos, ts)
  })
}

/**
 * Spawn agents weighted by foot-traffic density. Each TrafficPoint contributes
 * agents proportional to its weight; agents scatter within scatterRadiusM of
 * the hotspot center and are rejected from building interiors.
 */
export function spawnAgentsFromTraffic(
  trafficPoints: TrafficPoint[],
  totalCount: number,
  buildings: Building[] = [],
  scatterRadiusM = 10,
): PedestrianAgent[] {
  if (trafficPoints.length === 0) return []

  const totalWeight = trafficPoints.reduce((sum, p) => sum + p.weight, 0)
  const agents: PedestrianAgent[] = []
  const ts = Date.now()

  for (const tp of trafficPoints) {
    const share = Math.round((tp.weight / totalWeight) * totalCount)
    const nodeCount = Math.max(1, share)

    for (let j = 0; j < nodeCount && agents.length < totalCount; j++) {
      const pos = safePosition(() => {
        const r = scatterRadiusM * Math.sqrt(Math.random())
        const angle = Math.random() * 2 * Math.PI
        return offsetLatLng(tp.position, r * Math.cos(angle), r * Math.sin(angle))
      }, buildings)
      agents.push(makeAgent(agents.length, pos, ts))
    }
  }

  // Fill rounding gaps from the highest-weight node
  const top = [...trafficPoints].sort((a, b) => b.weight - a.weight)[0]
  while (agents.length < totalCount) {
    const pos = safePosition(() => {
      const r = scatterRadiusM * Math.sqrt(Math.random())
      const angle = Math.random() * 2 * Math.PI
      return offsetLatLng(top.position, r * Math.cos(angle), r * Math.sin(angle))
    }, buildings)
    agents.push(makeAgent(agents.length, pos, ts))
  }

  return agents
}

// --- road-following spawn ---

function distanceMLocal(a: LatLng, b: LatLng): number {
  const lngScale = METERS_PER_LNG_DEGREE * Math.cos(a.lat * Math.PI / 180)
  const dlat = (b.lat - a.lat) * METERS_PER_LAT_DEGREE
  const dlng = (b.lng - a.lng) * lngScale
  return Math.sqrt(dlat * dlat + dlng * dlng)
}

function interpolateLatLng(a: LatLng, b: LatLng, t: number): LatLng {
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
  }
}

function roadLengthM(road: RoadSegment): number {
  let length = 0
  for (let i = 1; i < road.path.length; i++) {
    length += distanceMLocal(road.path[i - 1], road.path[i])
  }
  return length
}

function sampleRoadPosition(road: RoadSegment): { position: LatLng; segmentIdx: number; t: number } {
  if (road.path.length === 1) return { position: { ...road.path[0] }, segmentIdx: 0, t: 0 }

  const segmentLengths = road.path.slice(1).map((point, index) => distanceMLocal(road.path[index], point))
  const total = segmentLengths.reduce((sum, length) => sum + length, 0)
  if (total <= 0) return { position: { ...road.path[0] }, segmentIdx: 0, t: 0 }

  let r = Math.random() * total
  for (let i = 0; i < segmentLengths.length; i++) {
    const length = segmentLengths[i]
    r -= length
    if (r <= 0) {
      const t = length > 0 ? (r + length) / length : 0
      return {
        position: interpolateLatLng(road.path[i], road.path[i + 1], t),
        segmentIdx: i,
        t,
      }
    }
  }

  const last = road.path.length - 1
  return { position: { ...road.path[last] }, segmentIdx: Math.max(0, last - 1), t: 1 }
}

function nearestWaypointIdx(pos: LatLng, path: LatLng[]): number {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < path.length; i++) {
    const d = distanceMLocal(pos, path[i])
    if (d < bestDist) { bestDist = d; best = i }
  }
  return best
}

/**
 * Spawn agents on the road network, weighted by road kind and nearby traffic density.
 * Returns agents AND their pre-assigned path-following behaviors so waypoints are wired up.
 */
export function spawnAgentsOnRoads(
  roads: RoadSegment[],
  trafficPoints: TrafficPoint[],
  totalCount: number,
  buildings: Building[] = [],
  positionAllowed: (position: LatLng) => boolean = () => true,
): { agents: PedestrianAgent[]; behaviors: AgentBehavior[] } {
  if (roads.length === 0) return { agents: [], behaviors: [] }
  const spawnRoads = roads.filter(road => road.path.some(positionAllowed))
  if (spawnRoads.length === 0) return { agents: [], behaviors: [] }

  // Build per-road spawn weight. Squaring road.weight makes the red/high-density
  // traffic lines receive a visibly larger share of the agents.
  const TRAFFIC_BOOST_RADIUS_M = 60
  const roadWeights = spawnRoads.map(road => {
    const midIdx = Math.floor(road.path.length / 2)
    const mid = road.path[midIdx]
    let boost = 0
    for (const tp of trafficPoints) {
      if (distanceMLocal(mid, tp.position) < TRAFFIC_BOOST_RADIUS_M) boost += tp.weight
    }
    return Math.max(1, roadLengthM(road)) * Math.pow(Math.max(0.05, road.weight), 2) * (1 + boost)
  })
  const totalWeight = roadWeights.reduce((s, w) => s + w, 0)

  const agents: PedestrianAgent[] = []
  const behaviors: AgentBehavior[] = []
  const ts = Date.now()

  // Spatial hash for spawn-time anti-clustering: bucket by ~3m cells.
  const SPAWN_MIN_GAP_M = 2.2
  const CELL_M = 3
  const occupancy = new Map<string, LatLng[]>()
  const cellKey = (lat: number, lng: number) => {
    const lngScale = METERS_PER_LNG_DEGREE * Math.cos(lat * Math.PI / 180)
    return `${Math.round(lat * METERS_PER_LAT_DEGREE / CELL_M)}:${Math.round(lng * lngScale / CELL_M)}`
  }
  const tooClose = (pos: LatLng) => {
    const lat = pos.lat, lng = pos.lng
    const lngScale = METERS_PER_LNG_DEGREE * Math.cos(lat * Math.PI / 180)
    const cy = Math.round(lat * METERS_PER_LAT_DEGREE / CELL_M)
    const cx = Math.round(lng * lngScale / CELL_M)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const bucket = occupancy.get(`${cy + dy}:${cx + dx}`)
        if (!bucket) continue
        for (const p of bucket) {
          if (distanceMLocal(pos, p) < SPAWN_MIN_GAP_M) return true
        }
      }
    }
    return false
  }
  const remember = (pos: LatLng) => {
    const key = cellKey(pos.lat, pos.lng)
    const list = occupancy.get(key)
    if (list) list.push(pos)
    else occupancy.set(key, [pos])
  }

  let attemptsRemaining = totalCount * 6
  for (let n = 0; n < totalCount && attemptsRemaining > 0; n++) {
    // Pick a road segment via weighted random
    let r = Math.random() * totalWeight
    let roadIdx = 0
    for (let k = 0; k < roadWeights.length; k++) {
      r -= roadWeights[k]
      if (r <= 0) { roadIdx = k; break }
    }
    const road = spawnRoads[roadIdx]

    const sampled = sampleRoadPosition(road)

    // Lateral offset perpendicular to the road direction so agents don't stack
    // on the centerline. Range: ±1.6m (sidewalk width-ish).
    let spawnPos = sampled.position
    const segNext = road.path[Math.min(sampled.segmentIdx + 1, road.path.length - 1)]
    const segPrev = road.path[sampled.segmentIdx]
    if (segNext && segPrev && segNext !== segPrev) {
      const lngScale = METERS_PER_LNG_DEGREE * Math.cos(spawnPos.lat * Math.PI / 180)
      const dE = (segNext.lng - segPrev.lng) * lngScale
      const dN = (segNext.lat - segPrev.lat) * METERS_PER_LAT_DEGREE
      const len = Math.sqrt(dE * dE + dN * dN) || 1
      // perpendicular = (-dN, dE) normalized
      const perpE = -dN / len
      const perpN = dE / len
      const lateral = (Math.random() - 0.5) * 3.2
      spawnPos = offsetLatLng(spawnPos, perpE * lateral, perpN * lateral)
    }

    if (!positionAllowed(spawnPos) || isInsideBuilding(spawnPos, buildings) || tooClose(spawnPos)) {
      n--
      attemptsRemaining--
      continue
    }
    remember(spawnPos)

    const kind = pickWeightedAgentKind({ includeVehicles: true })
    const model = getAgentModel(kind)
    const speed = model.speed[0] + Math.random() * (model.speed[1] - model.speed[0])
    const id = `pedestrian-${ts}-${n}`
    const agent: PedestrianAgent = {
      id,
      name: pickAgentName(id),
      position: spawnPos,
      heading: 0,
      speedMps: speed,
      phaseOffsetM: Math.random() * LOOP_LENGTH_M,
      visual: kind === 'car' ? 'car' : 'walker',
      kind,
    }

    const waypointDir: 1 | -1 = Math.random() < 0.5 ? 1 : -1
    const startIdx = nearestWaypointIdx(spawnPos, road.path)

    // Set initial heading along the road
    const nextIdx = Math.min(sampled.segmentIdx + 1, road.path.length - 1)
    const prevIdx = Math.max(sampled.segmentIdx, 0)
    const refPoint = waypointDir === 1 ? road.path[nextIdx] : road.path[prevIdx]
    if (refPoint && distanceMLocal(spawnPos, refPoint) > 0.1) {
      const dlat = (refPoint.lat - spawnPos.lat) * METERS_PER_LAT_DEGREE
      const dlng = (refPoint.lng - spawnPos.lng) * METERS_PER_LNG_DEGREE * Math.cos(spawnPos.lat * Math.PI / 180)
      agent.heading = ((Math.atan2(dlng, dlat) * 180 / Math.PI) + 360) % 360
    }

    const behavior = createBehavior(agent.id, road.path, waypointDir)
    behavior.waypointIdx = startIdx

    agents.push(agent)
    behaviors.push(behavior)
  }

  // Fill to totalCount if buildings caused skips
  let fillAttemptsRemaining = totalCount * 3
  while (agents.length < totalCount && spawnRoads.length > 0 && fillAttemptsRemaining > 0) {
    fillAttemptsRemaining--
    const road = spawnRoads[Math.floor(Math.random() * spawnRoads.length)]
    const wpIdx = Math.floor(Math.random() * road.path.length)
    const pos = road.path[wpIdx]
    if (!positionAllowed(pos) || isInsideBuilding(pos, buildings) || tooClose(pos)) continue
    const n = agents.length
    const kind = pickWeightedAgentKind({ includeVehicles: true })
    const model = getAgentModel(kind)
    const speed = model.speed[0] + Math.random() * (model.speed[1] - model.speed[0])
    const id = `pedestrian-${ts}-fill-${n}`
    const agent: PedestrianAgent = {
      id,
      name: pickAgentName(id),
      position: { ...pos },
      heading: Math.random() * 360,
      speedMps: speed,
      phaseOffsetM: Math.random() * LOOP_LENGTH_M,
      visual: kind === 'car' ? 'car' : 'walker',
      kind,
    }
    const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1
    const beh = createBehavior(agent.id, road.path, dir)
    beh.waypointIdx = wpIdx
    agents.push(agent)
    behaviors.push(beh)
  }

  return { agents, behaviors }
}
