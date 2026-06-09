import type {
  Building,
  BuildingOccupancy,
  FloodDepthCell,
  FloodImpactSummary,
  FloodInterventionKind,
  FloodPriorityZone,
  FloodScenarioResult,
  IndoorAgent,
  LatLng,
  PlannerIntervention,
  RoadSegment,
  TrafficPoint,
  WaterBody,
  StreetFixture,
} from '@/types'

const METERS_PER_LAT_DEGREE = 110540
const METERS_PER_LNG_DEGREE = 111320
const GRID_STEPS = 13
const DEFAULT_RADIUS_KM = 1

const ROLE_BY_CATEGORY: Record<string, string> = {
  residential: 'resident',
  hotel: 'visitor',
  office: 'office worker',
  retail: 'shopper',
  grocery: 'shopper',
  restaurant: 'diner',
  cafe: 'diner',
  bar: 'nightlife visitor',
  school: 'student',
  medical: 'patient',
  transit: 'commuter',
  parking: 'driver',
  entertainment: 'visitor',
  worship: 'visitor',
  industrial: 'shift worker',
}

function hashNumber(seed: string): number {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967295
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function distanceM(a: LatLng, b: LatLng): number {
  const lngScale = METERS_PER_LNG_DEGREE * Math.cos(a.lat * Math.PI / 180)
  const dlat = (b.lat - a.lat) * METERS_PER_LAT_DEGREE
  const dlng = (b.lng - a.lng) * lngScale
  return Math.sqrt(dlat * dlat + dlng * dlng)
}

function offsetLatLng(origin: LatLng, eastM: number, northM: number): LatLng {
  const lngScale = METERS_PER_LNG_DEGREE * Math.cos(origin.lat * Math.PI / 180)
  return {
    lat: origin.lat + northM / METERS_PER_LAT_DEGREE,
    lng: origin.lng + eastM / lngScale,
  }
}

function polygonAreaM2(points: LatLng[]): number {
  if (points.length < 3) return 0
  const origin = points[0]
  let area = 0
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const ax = (a.lng - origin.lng) * METERS_PER_LNG_DEGREE * Math.cos(origin.lat * Math.PI / 180)
    const ay = (a.lat - origin.lat) * METERS_PER_LAT_DEGREE
    const bx = (b.lng - origin.lng) * METERS_PER_LNG_DEGREE * Math.cos(origin.lat * Math.PI / 180)
    const by = (b.lat - origin.lat) * METERS_PER_LAT_DEGREE
    area += ax * by - bx * ay
  }
  return Math.abs(area) / 2
}

// Compute the dominant flood flow direction at a position from nearby flooded cells.
// Returns the wall angle (perpendicular to flow), in radians. Falls back to 0.
function computeWallAngle(position: LatLng, floodCells: FloodDepthCell[]): number {
  const cosLat = Math.cos(position.lat * Math.PI / 180)
  let sumX = 0, sumY = 0, sumW = 0
  for (const c of floodCells) {
    if (c.depthM < 0.08) continue
    const dx = (c.position.lng - position.lng) * METERS_PER_LNG_DEGREE * cosLat
    const dy = (c.position.lat - position.lat) * METERS_PER_LAT_DEGREE
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist > 380) continue
    const w = c.depthM / Math.max(1, dist)
    sumX += dx * w
    sumY += dy * w
    sumW += w
  }
  if (sumW < 0.01) return 0
  const flowAngle = Math.atan2(sumY / sumW, sumX / sumW)
  return flowAngle + Math.PI / 2  // wall is perpendicular to flow
}

// Endpoints of a directed wall/corridor centred at the intervention position.
function wallEndpoints(inter: PlannerIntervention): [LatLng, LatLng] {
  const cosLat = Math.cos(inter.position.lat * Math.PI / 180)
  const half = inter.radiusM * 0.45
  const dLng = Math.cos(inter.angle) * half / (METERS_PER_LNG_DEGREE * cosLat)
  const dLat = Math.sin(inter.angle) * half / METERS_PER_LAT_DEGREE
  return [
    { lat: inter.position.lat - dLat, lng: inter.position.lng - dLng },
    { lat: inter.position.lat + dLat, lng: inter.position.lng + dLng },
  ]
}

// 2D segment intersection test in lat/lng space (accurate enough at grid scale).
function segmentsCross(a1: LatLng, a2: LatLng, b1: LatLng, b2: LatLng): boolean {
  const d1x = a2.lng - a1.lng, d1y = a2.lat - a1.lat
  const d2x = b2.lng - b1.lng, d2y = b2.lat - b1.lat
  const cross = d1x * d2y - d1y * d2x
  if (Math.abs(cross) < 1e-14) return false
  const dx = b1.lng - a1.lng, dy = b1.lat - a1.lat
  const t = (dx * d2y - dy * d2x) / cross
  const u = (dx * d1y - dy * d1x) / cross
  return t >= 0 && t <= 1 && u >= 0 && u <= 1
}

function distanceToSegmentM(point: LatLng, a: LatLng, b: LatLng): number {
  const cosLat = Math.cos(point.lat * Math.PI / 180)
  const ax = (a.lng - point.lng) * METERS_PER_LNG_DEGREE * cosLat
  const ay = (a.lat - point.lat) * METERS_PER_LAT_DEGREE
  const bx = (b.lng - point.lng) * METERS_PER_LNG_DEGREE * cosLat
  const by = (b.lat - point.lat) * METERS_PER_LAT_DEGREE
  const vx = bx - ax
  const vy = by - ay
  const lenSq = vx * vx + vy * vy
  const t = lenSq > 0 ? clamp(-(ax * vx + ay * vy) / lenSq, 0, 1) : 0
  const x = ax + vx * t
  const y = ay + vy * t
  return Math.sqrt(x * x + y * y)
}

function nearestWaterDistanceM(position: LatLng, waterBodies: WaterBody[]): number {
  let best = Infinity
  for (const waterBody of waterBodies) {
    const points = waterBody.points
    if (points.length < 2) continue
    for (let i = 1; i < points.length; i += 1) {
      best = Math.min(best, distanceToSegmentM(position, points[i - 1], points[i]))
    }
    if (waterBody.geometry === 'polygon' && points.length > 2) {
      best = Math.min(best, distanceToSegmentM(position, points[points.length - 1], points[0]))
    }
  }
  return best
}

function estimateGroundElevationM(position: LatLng, buildings: Building[]): number {
  let bestDistance = Infinity
  let bestElevation = 0
  for (const building of buildings) {
    const dist = distanceM(position, building.centroid)
    if (dist < bestDistance) {
      bestDistance = dist
      bestElevation = building.groundElevation
    }
  }
  return bestDistance <= 180 ? bestElevation : 0
}

function nearestDepthCell(position: LatLng, cells: FloodDepthCell[]): FloodDepthCell | null {
  let best: FloodDepthCell | null = null
  let bestDistance = Infinity
  for (const cell of cells) {
    const dist = distanceM(position, cell.position)
    if (dist < bestDistance) {
      best = cell
      bestDistance = dist
    }
  }
  return best
}

function estimateOccupants(building: Building, trafficPoints: TrafficPoint[]): BuildingOccupancy {
  const areaM2 = Math.max(80, polygonAreaM2(building.footprint))
  const floors = Math.max(1, Math.round(building.levels ?? building.heightM / 3.2))
  const category = building.poiCategory ?? 'unknown'
  const densityByCategory: Record<string, number> = {
    residential: 0.028,
    hotel: 0.052,
    office: 0.072,
    retail: 0.096,
    grocery: 0.085,
    restaurant: 0.11,
    cafe: 0.09,
    bar: 0.12,
    school: 0.082,
    medical: 0.075,
    transit: 0.13,
    parking: 0.018,
    entertainment: 0.09,
    worship: 0.062,
    industrial: 0.035,
    unknown: 0.026,
  }
  const transitBoost = trafficPoints.some(point => distanceM(point.position, building.centroid) < 120) ? 1.24 : 1
  const randomFactor = 0.86 + hashNumber(`${building.id}:occupancy`) * 0.34
  const estimatedOccupants = Math.max(1, Math.round(areaM2 * floors * (densityByCategory[category] ?? densityByCategory.unknown) * transitBoost * randomFactor))
  const vulnerableRate = category === 'medical' ? 0.42 : category === 'school' ? 0.24 : category === 'residential' ? 0.18 : 0.1

  return {
    buildingId: building.id,
    buildingName: building.poiName ?? `${category} building`,
    category,
    position: building.centroid,
    floors,
    estimatedOccupants,
    exposedOccupants: 0,
    vulnerableOccupants: Math.round(estimatedOccupants * vulnerableRate),
    confidence: building.poiCategory && building.levels ? 'high' : building.poiCategory ? 'medium' : 'low',
    depthM: 0,
    damageRatio: 0,
  }
}

function buildOccupancy(buildings: Building[], trafficPoints: TrafficPoint[], cells: FloodDepthCell[]): BuildingOccupancy[] {
  return buildings.slice(0, 420).map(building => {
    const base = estimateOccupants(building, trafficPoints)
    const depth = nearestDepthCell(building.centroid, cells)?.depthM ?? 0
    const exposedShare = clamp((depth - 0.08) / 0.74, 0, 1)
    const damageRatio = clamp(depth / 1.25, 0, 1)
    return {
      ...base,
      depthM: depth,
      exposedOccupants: Math.round(base.estimatedOccupants * exposedShare),
      damageRatio,
    }
  })
}

// Internal simulation cell structure
interface SimulationGridCell {
  id: string
  x: number
  y: number
  position: LatLng
  terrainHeight: number
  waterDepth: number
  nearestWaterM: number
  active: boolean
  velocityMps: number
  arrivalMinute: number
}

// Core Cellular Automata Water Simulation
function runCellularAutomataSimulation(
  center: LatLng,
  targetMinute: number,
  interventions: PlannerIntervention[] = [],
  waterBodies: WaterBody[] = [],
  buildings: Building[] = [],
  streetFixtures: StreetFixture[] = [],
): FloodDepthCell[] {
  const radiusM = DEFAULT_RADIUS_KM * 1000
  const cells2D: (SimulationGridCell | null)[][] = Array.from({ length: GRID_STEPS }, () =>
    Array(GRID_STEPS).fill(null)
  )
  const flatSimCells: SimulationGridCell[] = []

  // Initialize the grid with ground truth elevations and distance to nearest water sources
  for (let y = 0; y < GRID_STEPS; y += 1) {
    for (let x = 0; x < GRID_STEPS; x += 1) {
      const east = -radiusM + (x / (GRID_STEPS - 1)) * radiusM * 2
      const north = -radiusM + (y / (GRID_STEPS - 1)) * radiusM * 2
      const isInsideCircle = Math.sqrt(east * east + north * north) <= radiusM * 1.02
      const position = offsetLatLng(center, east, north)

      // Get terrain properties
      let terrainHeight = estimateGroundElevationM(position, buildings)
      
      // Elevated road: raise terrain in a linear corridor along the road angle.
      // The road runs perpendicular to the dominant flow (i.e. it acts as a raised berm/causeway).
      for (const inter of interventions) {
        if (inter.kind === 'elevated-road') {
          const [wa, wb] = wallEndpoints(inter)
          const perpDist = distanceToSegmentM(position, wa, wb)
          const corridorHalfWidth = 55  // meters either side of the road centreline
          if (perpDist < corridorHalfWidth) {
            terrainHeight += (1 - perpDist / corridorHalfWidth) * 1.8  // raise up to 1.8 m
          }
        }
      }

      const nearestWaterM = waterBodies.length > 0
        ? nearestWaterDistanceM(position, waterBodies)
        : Math.sqrt(east * east + north * north)

      const cell: SimulationGridCell = {
        id: `flood-cell-${x}-${y}`,
        x,
        y,
        position,
        terrainHeight,
        waterDepth: 0,
        nearestWaterM,
        active: isInsideCircle,
        velocityMps: 0.04,
        arrivalMinute: 0,
      }

      cells2D[y][x] = cell
      if (isInsideCircle) {
        flatSimCells.push(cell)
      }
    }
  }

  // Run Cellular Automata Simulation step-by-step
  // Run steps up to targetMinute (at least 1 step if minute is 0 to calculate ambient)
  const totalTicks = Math.max(1, targetMinute)
  
  for (let tick = 1; tick <= totalTicks; tick += 1) {
    // 1. Water source generation (Inflow wave based on storm/tidal intensity profile)
    const wave = tick <= 24 ? clamp(tick / 24, 0, 1) : clamp(1 - (tick - 24) / 24, 0, 1)
    
    // Calculate new inflows first
    for (const cell of flatSimCells) {
      if (!cell.active) continue

      // Influx from nearby water bodies (overflow)
      if (waterBodies.length > 0) {
        const waterInfluence = Math.max(0, 1 - cell.nearestWaterM / 420)
        if (waterInfluence > 0) {
          cell.waterDepth += waterInfluence * 0.11 * wave
        }
      } else {
        // Fallback synthetic influx from the center
        const distFromCenter = distanceM(cell.position, center)
        const centerInfluence = Math.max(0, 1 - distFromCenter / (radiusM * 0.8))
        cell.waterDepth += centerInfluence * 0.13 * wave
      }

      // Add small ambient rainfall across the entire active region
      cell.waterDepth += 0.005 * wave
    }

    // 2. Pre-calculate out-flows to neighbors based on gravity gradients (Water Depth + Terrain Elevation)
    const outflows = flatSimCells.map(cell => {
      const neighborFlows: { targetX: number; targetY: number; amount: number }[] = []
      if (cell.waterDepth <= 0.001) return { cell, flows: neighborFlows }

      const totalHeight = cell.terrainHeight + cell.waterDepth

      // Check 4-way orthogonal neighbors
      const directions = [
        [0, 1], [0, -1], [1, 0], [-1, 0]
      ]

      for (const [dx, dy] of directions) {
        const nx = cell.x + dx
        const ny = cell.y + dy
        if (nx >= 0 && nx < GRID_STEPS && ny >= 0 && ny < GRID_STEPS) {
          const neighbor = cells2D[ny][nx]
          if (neighbor && neighbor.active) {
            const neighborTotalHeight = neighbor.terrainHeight + neighbor.waterDepth
            if (neighborTotalHeight < totalHeight) {
              // Check if flow is blocked by a flood barrier intervention
              let barrierMitigation = 1.0
              for (const inter of interventions) {
                if (inter.kind === 'flood-barrier') {
                  // Barrier is a directed wall — block any flow that crosses the wall line segment
                  const [wa, wb] = wallEndpoints(inter)
                  if (segmentsCross(cell.position, neighbor.position, wa, wb)) {
                    barrierMitigation = 0  // complete block across the wall
                  }
                }
              }

              const headDiff = totalHeight - neighborTotalHeight
              // Gravity driven flow rate with transfer coefficient (beta = 0.18)
              const flowAmt = headDiff * 0.18 * barrierMitigation
              if (flowAmt > 0.001) {
                neighborFlows.push({ targetX: nx, targetY: ny, amount: flowAmt })
              }
            }
          }
        }
      }

      // Conserve mass: ensure we never outflow more than the current water depth
      const totalOutflow = neighborFlows.reduce((sum, f) => sum + f.amount, 0)
      if (totalOutflow > cell.waterDepth * 0.8) {
        const scale = (cell.waterDepth * 0.8) / totalOutflow
        for (const f of neighborFlows) {
          f.amount *= scale
        }
      }

      return { cell, flows: neighborFlows }
    })

    // Apply the pre-calculated flows to update the water depths simultaneously
    for (const outflow of outflows) {
      const cell = outflow.cell
      for (const f of outflow.flows) {
        const neighbor = cells2D[f.targetY][f.targetX]
        if (neighbor) {
          cell.waterDepth -= f.amount
          neighbor.waterDepth += f.amount
        }
      }
    }

    // 3. Local Sinks & Mitigation (Drains, Pumps, and Planner Interventions)
    for (const cell of flatSimCells) {
      if (cell.waterDepth <= 0) continue

      let mitigationAmount = 0

      // Street Fixture Sinks
      for (const fixture of streetFixtures) {
        const dist = distanceM(cell.position, fixture.position)
        if (fixture.kind === 'pumping-station' && dist < 300) {
          mitigationAmount += (1 - dist / 300) * 0.045
        } else if (fixture.kind === 'drain-grate' && dist < 120) {
          mitigationAmount += (1 - dist / 120) * 0.018
        }
      }

      // Concrete storm drains/drains/ditches
      for (const water of waterBodies) {
        if (water.tags?.waterway === 'drain' || water.tags?.waterway === 'ditch') {
          const points = water.points
          if (points.length >= 2) {
            let bestDist = Infinity
            for (let i = 1; i < points.length; i++) {
              bestDist = Math.min(bestDist, distanceToSegmentM(cell.position, points[i - 1], points[i]))
            }
            if (bestDist < 100) {
              mitigationAmount += (1 - bestDist / 100) * 0.024
            }
          }
        }
      }

      // Planner mitigation interventions (absorption sinks only for types that physically absorb water)
      for (const inter of interventions) {
        const dist = distanceM(cell.position, inter.position)
        if (dist < inter.radiusM) {
          const falloff = 1 - dist / inter.radiusM
          if (inter.kind === 'retention-pond') {
            // Ponds drain their natural catchment: cells lower than the pond position absorb more
            const terrainBias = clamp(1.2 - (cell.terrainHeight - inter.effectiveness * 2), 0.4, 1.8)
            mitigationAmount += falloff * 0.09 * terrainBias
          } else if (inter.kind === 'green-corridor') {
            mitigationAmount += falloff * 0.045
          }
          // flood-barrier: wall physics only, no absorption
          // elevated-road: terrain physics only, no absorption
          // shelter-node / protected-route: no flood physics effect
        }
      }

      cell.waterDepth = Math.max(0, cell.waterDepth - mitigationAmount)

      // 4. Update arrival time and velocities
      if (cell.waterDepth > 0.05) {
        if (cell.arrivalMinute === 0) {
          cell.arrivalMinute = tick
        }
        const velocitySeed = hashNumber(`${cell.x}:${cell.y}:${tick}`)
        cell.velocityMps = clamp(0.06 + cell.waterDepth * 0.28 + velocitySeed * 0.1, 0.04, 0.75)
      } else {
        cell.velocityMps = 0.04
      }
    }
  }

  // Map to final FloodDepthCell type schema
  return flatSimCells.map(cell => ({
    id: cell.id,
    position: cell.position,
    depthM: cell.waterDepth,
    arrivalMinute: cell.arrivalMinute || Math.max(1, targetMinute),
    velocityMps: cell.velocityMps,
  }))
}

function buildFloodCells(
  center: LatLng,
  minute: number,
  interventions: PlannerIntervention[] = [],
  waterBodies: WaterBody[] = [],
  buildings: Building[] = [],
  streetFixtures: StreetFixture[] = [],
): FloodDepthCell[] {
  return runCellularAutomataSimulation(center, minute, interventions, waterBodies, buildings, streetFixtures)
}

function countDisruptedRoads(roads: RoadSegment[], cells: FloodDepthCell[]): number {
  return roads.filter(road => road.path.some(point => (nearestDepthCell(point, cells)?.depthM ?? 0) > 0.22)).length
}

function summarizeImpact(occupancy: BuildingOccupancy[], roads: RoadSegment[], cells: FloodDepthCell[]): FloodImpactSummary {
  const affectedBuildings = occupancy.filter(item => item.depthM > 0.12).length
  const severeBuildings = occupancy.filter(item => item.depthM > 0.55).length
  const exposedIndoorPeople = occupancy.reduce((sum, item) => sum + item.exposedOccupants, 0)
  const vulnerablePeople = occupancy.reduce((sum, item) => sum + (item.depthM > 0.12 ? item.vulnerableOccupants : 0), 0)
  const roadsDisrupted = countDisruptedRoads(roads, cells)
  const estimatedDamageUsd = Math.round(occupancy.reduce((sum, item) => {
    const replacementValue = item.estimatedOccupants * 44000 + item.floors * 180000
    return sum + replacementValue * item.damageRatio
  }, 0))
  const mobilityLossPct = roads.length > 0 ? Math.round((roadsDisrupted / roads.length) * 100) : 0
  const impactPressure = exposedIndoorPeople / 1700 + affectedBuildings / 38 + mobilityLossPct / 82
  const resilienceScore = Math.round(clamp(100 - impactPressure * 28, 4, 98))

  return {
    affectedPeople: exposedIndoorPeople + Math.round(roadsDisrupted * 4.5),
    exposedIndoorPeople,
    vulnerablePeople,
    affectedBuildings,
    severeBuildings,
    roadsDisrupted,
    estimatedDamageUsd,
    mobilityLossPct,
    resilienceScore,
  }
}

function buildPriorityZones(occupancy: BuildingOccupancy[], roads: RoadSegment[], cells: FloodDepthCell[]): FloodPriorityZone[] {
  const buildingZones = occupancy
    .filter(item => item.exposedOccupants > 0 || item.damageRatio > 0.25)
    .map(item => ({
      id: `priority-building-${item.buildingId}`,
      position: item.position,
      label: item.category === 'medical' ? 'Protect critical care access' : item.category === 'school' ? 'Protect student evacuation' : 'Reduce building exposure',
      severity: clamp(item.exposedOccupants / 80 + item.damageRatio * 3, 0.2, 5),
      reason: `${item.exposedOccupants.toLocaleString()} occupants exposed at ${item.depthM.toFixed(2)}m estimated depth.`,
      recommendedIntervention: (item.category === 'medical' || item.category === 'school' ? 'shelter-node' : item.depthM > 0.55 ? 'flood-barrier' : 'green-corridor') as FloodInterventionKind,
    }))

  const roadZones = roads
    .filter(road => road.path.some(point => (nearestDepthCell(point, cells)?.depthM ?? 0) > 0.35))
    .slice(0, 12)
    .map((road, index) => ({
      id: `priority-road-${road.id}`,
      position: road.path[Math.floor(road.path.length / 2)],
      label: 'Restore access corridor',
      severity: clamp(road.weight * 4, 0.4, 4.2),
      reason: `${road.kind} link intersects flood depth above 0.35m.`,
      recommendedIntervention: (index % 2 === 0 ? 'elevated-road' : 'protected-route') as FloodInterventionKind,
    }))

  return [...buildingZones, ...roadZones]
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 8)
}

function buildIndoorAgents(occupancy: BuildingOccupancy[], center: LatLng): IndoorAgent[] {
  return occupancy
    .filter(item => item.estimatedOccupants >= 10)
    .sort((a, b) => b.exposedOccupants - a.exposedOccupants || b.estimatedOccupants - a.estimatedOccupants)
    .slice(0, 32)
    .map((item, index) => {
      const seed = `${item.buildingId}:${index}`
      const riskTolerance = hashNumber(`${seed}:risk`)
      const mobility = item.category === 'medical' || riskTolerance < 0.18 ? 'limited' : riskTolerance > 0.78 ? 'fast' : 'steady'
      const delay = Math.round(2 + (1 - riskTolerance) * 12 + (mobility === 'limited' ? 8 : 0))
      const status = item.depthM > 0.5 && delay > 12 ? 'delayed' : item.depthM > 0.18 ? 'evacuating' : 'shelter-in-place'
      const destination = offsetLatLng(center, riskTolerance > 0.5 ? 720 : -680, riskTolerance > 0.35 ? 620 : -540)
      const role = ROLE_BY_CATEGORY[item.category] ?? 'resident'

      return {
        id: `indoor-agent-${item.buildingId}-${index}`,
        name: `Agent ${String(index + 1).padStart(2, '0')}`,
        originBuildingId: item.buildingId,
        originBuildingName: item.buildingName,
        position: item.position,
        destination,
        persona: {
          role,
          riskTolerance,
          evacuationDelayMin: delay,
          mobility,
          summary: `${role} with ${mobility} mobility and ${riskTolerance > 0.62 ? 'high' : riskTolerance > 0.32 ? 'moderate' : 'low'} risk tolerance.`,
        },
        status,
      }
    })
}

export function createPlannerIntervention(
  kind: FloodInterventionKind,
  position: LatLng,
  index: number,
  floodCells: FloodDepthCell[] = [],
): PlannerIntervention {
  const settings: Record<FloodInterventionKind, { label: string; radiusM: number; effectiveness: number }> = {
    'flood-barrier': { label: 'Deployable flood barrier', radiusM: 220, effectiveness: 0.48 },
    'retention-pond': { label: 'Retention basin', radiusM: 300, effectiveness: 0.34 },
    'green-corridor': { label: 'Sponge green corridor', radiusM: 250, effectiveness: 0.24 },
    'elevated-road': { label: 'Raised road segment', radiusM: 170, effectiveness: 0.3 },
    'shelter-node': { label: 'Vertical shelter node', radiusM: 210, effectiveness: 0.22 },
    'protected-route': { label: 'Protected evacuation route', radiusM: 190, effectiveness: 0.28 },
  }
  const setting = settings[kind]
  // Directional interventions auto-orient perpendicular to the local flood flow
  const angle = (kind === 'flood-barrier' || kind === 'elevated-road')
    ? computeWallAngle(position, floodCells)
    : 0
  return {
    id: `intervention-${kind}-${index}`,
    kind,
    position,
    label: setting.label,
    radiusM: setting.radiusM,
    effectiveness: setting.effectiveness,
    angle,
  }
}

export function buildFloodScenario(input: {
  center: LatLng
  buildings: Building[]
  roads: RoadSegment[]
  trafficPoints: TrafficPoint[]
  waterBodies?: WaterBody[]
  streetFixtures?: StreetFixture[]
  elapsedMinute: number
  interventions?: PlannerIntervention[]
}): FloodScenarioResult {
  const interventions = input.interventions ?? []
  const waterBodies = input.waterBodies ?? []
  const streetFixtures = input.streetFixtures ?? []
  
  // Base scenario has no planner interventions
  const cells = buildFloodCells(input.center, input.elapsedMinute, [], waterBodies, input.buildings, streetFixtures)
  const occupancy = buildOccupancy(input.buildings, input.trafficPoints, cells)
  const summary = summarizeImpact(occupancy, input.roads, cells)
  const priorityZones = buildPriorityZones(occupancy, input.roads, cells)
  const indoorAgents = buildIndoorAgents(occupancy, input.center)

  // Improved scenario calculates using planner interventions
  const improvedCells = interventions.length > 0
    ? buildFloodCells(input.center, input.elapsedMinute, interventions, waterBodies, input.buildings, streetFixtures)
    : []
  const improvedOccupancy = interventions.length > 0 ? buildOccupancy(input.buildings, input.trafficPoints, improvedCells) : []
  const improvedSummary = interventions.length > 0 ? summarizeImpact(improvedOccupancy, input.roads, improvedCells) : null

  return {
    phase: input.elapsedMinute >= 48 ? 'complete' : input.elapsedMinute > 0 ? 'running' : 'idle',
    elapsedMinute: input.elapsedMinute,
    cells,
    improvedCells: interventions.length > 0 ? improvedCells : cells,
    occupancy,
    indoorAgents,
    priorityZones,
    interventions,
    summary,
    improvedSummary,
  }
}

/**
 * Procedurally spawns flood interventions using the same logic as the pedestrian agent spawn system.
 * It weights road segments by nearby traffic density, offsets position perpendicular to road direction,
 * and ensures items do not spawn inside buildings.
 */
export function spawnFloodInterventions(
  kind: FloodInterventionKind,
  roads: RoadSegment[],
  trafficPoints: TrafficPoint[],
  buildings: Building[],
  count: number,
  existingInterventions: PlannerIntervention[],
  floodCells: FloodDepthCell[] = [],
): PlannerIntervention[] {
  if (roads.length === 0) return []

  const newInterventions = [...existingInterventions]
  const ts = Date.now()

  // Calculate road lengths and weights just like pedestrian spawning
  const roadWeights = roads.map(road => {
    let length = 0
    for (let i = 1; i < road.path.length; i++) {
      const a = road.path[i - 1]
      const b = road.path[i]
      const dlat = (b.lat - a.lat) * METERS_PER_LAT_DEGREE
      const dlng = (b.lng - a.lng) * METERS_PER_LNG_DEGREE * Math.cos(a.lat * Math.PI / 180)
      length += Math.sqrt(dlat * dlat + dlng * dlng)
    }
    
    let boost = 0
    const midIdx = Math.floor(road.path.length / 2)
    const mid = road.path[midIdx]
    if (mid) {
      for (const tp of trafficPoints) {
        const dlat = (tp.position.lat - mid.lat) * METERS_PER_LAT_DEGREE
        const dlng = (tp.position.lng - mid.lng) * METERS_PER_LNG_DEGREE * Math.cos(mid.lat * Math.PI / 180)
        const dist = Math.sqrt(dlat * dlat + dlng * dlng)
        if (dist < 60) boost += tp.weight
      }
    }
    return Math.max(1, length) * Math.pow(Math.max(0.05, road.weight), 2) * (1 + boost)
  })

  const totalWeight = roadWeights.reduce((s, w) => s + w, 0)
  if (totalWeight <= 0) return []

  let attempts = count * 6
  let spawnedCount = 0

  while (spawnedCount < count && attempts > 0) {
    attempts--
    
    // 1. Pick a road segment via weighted random selection
    let r = Math.random() * totalWeight
    let roadIdx = 0
    for (let k = 0; k < roadWeights.length; k++) {
      r -= roadWeights[k]
      if (r <= 0) {
        roadIdx = k
        break
      }
    }
    const road = roads[roadIdx]
    if (!road || road.path.length < 2) continue

    // 2. Select a random spot on the road
    const segIdx = Math.floor(Math.random() * (road.path.length - 1))
    const p1 = road.path[segIdx]
    const p2 = road.path[segIdx + 1]
    const t = Math.random()
    let spawnPos = {
      lat: p1.lat + (p2.lat - p1.lat) * t,
      lng: p1.lng + (p2.lng - p1.lng) * t,
    }

    // 3. Offset perpendicular to the road to simulate roadside placement (like sidewalks)
    const lngScale = METERS_PER_LNG_DEGREE * Math.cos(spawnPos.lat * Math.PI / 180)
    const dE = (p2.lng - p1.lng) * lngScale
    const dN = (p2.lat - p1.lat) * METERS_PER_LAT_DEGREE
    const len = Math.sqrt(dE * dE + dN * dN) || 1
    const perpE = -dN / len
    const perpN = dE / len
    const lateral = (Math.random() - 0.5) * 8.0 // 8 meter offset spread

    const { isInsideBuilding, offsetLatLng } = require('./spawnAgents')
    spawnPos = offsetLatLng(spawnPos, perpE * lateral, perpN * lateral)

    // 4. Ensure it doesn't collide with buildings or exist too close to other interventions
    if (isInsideBuilding(spawnPos, buildings)) {
      continue
    }

    const minDistanceM = 15
    const isTooClose = newInterventions.some(interv => {
      const dlat = (interv.position.lat - spawnPos.lat) * METERS_PER_LAT_DEGREE
      const dlng = (interv.position.lng - spawnPos.lng) * METERS_PER_LNG_DEGREE * Math.cos(spawnPos.lat * Math.PI / 180)
      return Math.sqrt(dlat * dlat + dlng * dlng) < minDistanceM
    })

    if (isTooClose) {
      continue
    }

    // 5. Place the intervention!
    newInterventions.push(createPlannerIntervention(kind, spawnPos, newInterventions.length + 1, floodCells))
    spawnedCount++
  }

  return newInterventions
}
