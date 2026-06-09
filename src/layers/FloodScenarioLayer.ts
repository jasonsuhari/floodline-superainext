import { ColumnLayer, PathLayer, ScatterplotLayer, SolidPolygonLayer } from '@deck.gl/layers'
import type {
  Building,
  BuildingOccupancy,
  FloodDepthCell,
  FloodPriorityZone,
  IndoorAgent,
  LatLng,
  PlannerIntervention,
} from '@/types'
import { isPointInPolygon } from '@/lib/geoUtils'

type Position3D = [number, number, number]
type Rgba = [number, number, number, number]

interface FloodSurfacePatch {
  id: string
  polygon: Position3D[]
  edge: Position3D[]
  fillColor: Rgba
  lineColor: Rgba
}

const METERS_PER_LAT_DEGREE = 110540
const METERS_PER_LNG_DEGREE = 111320

function lngScaleAt(lat: number): number {
  return METERS_PER_LNG_DEGREE * Math.cos(lat * Math.PI / 180)
}

function toMeters(point: LatLng, origin: LatLng): [number, number] {
  return [
    (point.lng - origin.lng) * lngScaleAt(origin.lat),
    (point.lat - origin.lat) * METERS_PER_LAT_DEGREE,
  ]
}

function fromMeters(origin: LatLng, eastM: number, northM: number): [number, number] {
  return [
    origin.lng + eastM / lngScaleAt(origin.lat),
    origin.lat + northM / METERS_PER_LAT_DEGREE,
  ]
}

function averagePosition(cells: FloodDepthCell[]): LatLng {
  const total = cells.reduce((sum, cell) => ({
    lat: sum.lat + cell.position.lat,
    lng: sum.lng + cell.position.lng,
  }), { lat: 0, lng: 0 })
  return {
    lat: total.lat / Math.max(1, cells.length),
    lng: total.lng / Math.max(1, cells.length),
  }
}

function hashWave(seed: string): number {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967295
}

function buildFloodSurfacePatch(
  id: string,
  cells: FloodDepthCell[],
  thresholdM: number,
  expandM: number,
  zM: number,
  fillColor: Rgba,
  lineColor: Rgba,
  time = 0,
  waveAmplitude = 0,
): FloodSurfacePatch | null {
  const flooded = cells.filter(cell => cell.depthM >= thresholdM)
  if (flooded.length < 3) return null

  const origin = averagePosition(flooded)
  const candidates: Array<{ angle: number; radius: number }> = []

  for (const cell of flooded) {
    const [east, north] = toMeters(cell.position, origin)
    const cellRadius = expandM * (0.72 + cell.depthM * 0.38)
    for (let i = 0; i < 8; i += 1) {
      const angle = (Math.PI * 2 * i) / 8
      const wrinkle = 1 + (hashWave(`${id}:${cell.id}:${i}`) - 0.5) * 0.18
      const x = east + Math.cos(angle) * cellRadius * wrinkle
      const y = north + Math.sin(angle) * cellRadius * wrinkle
      candidates.push({
        angle: Math.atan2(y, x),
        radius: Math.sqrt(x * x + y * y),
      })
    }
  }

  const binCount = 44
  const bins: Array<{ angle: number; radius: number } | null> = Array.from({ length: binCount }, () => null)
  for (const point of candidates) {
    const normalized = (point.angle + Math.PI * 2) % (Math.PI * 2)
    const index = Math.floor((normalized / (Math.PI * 2)) * binCount) % binCount
    const existing = bins[index]
    if (!existing || point.radius > existing.radius) {
      bins[index] = { angle: normalized, radius: point.radius }
    }
  }

  const polygon = bins
    .map((bin, index) => {
      if (!bin) return null
      const prev = bins[(index - 1 + binCount) % binCount]
      const next = bins[(index + 1) % binCount]
      const smoothedRadius = (bin.radius * 2 + (prev?.radius ?? bin.radius) + (next?.radius ?? bin.radius)) / 4
      const angle = (index / binCount) * Math.PI * 2
      const [lng, lat] = fromMeters(origin, Math.cos(angle) * smoothedRadius, Math.sin(angle) * smoothedRadius)
      // Layered wave: two sine frequencies offset per vertex so the surface ripples organically
      const wave = waveAmplitude > 0
        ? waveAmplitude * (
            0.6 * Math.sin(time * 1.1 + angle * 2.7) +
            0.4 * Math.sin(time * 0.65 + angle * 5.1 + 1.3)
          )
        : 0
      return [lng, lat, zM + wave] as Position3D
    })
    .filter((point): point is Position3D => Boolean(point))

  if (polygon.length < 3) return null
  return {
    id,
    polygon,
    edge: [...polygon, polygon[0]],
    fillColor,
    lineColor,
  }
}


function interventionColor(kind: PlannerIntervention['kind']): Rgba {
  switch (kind) {
    case 'flood-barrier': return [255, 207, 92, 235]
    case 'retention-pond': return [61, 180, 255, 225]
    case 'green-corridor': return [52, 210, 132, 225]
    case 'elevated-road': return [255, 130, 64, 225]
    case 'shelter-node': return [245, 245, 245, 235]
    case 'protected-route': return [164, 126, 255, 225]
  }
}

export function makeFloodScenarioLayers(input: {
  cells: FloodDepthCell[]
  baselineCells?: FloodDepthCell[]
  indoorAgents: IndoorAgent[]
  priorityZones: FloodPriorityZone[]
  interventions: PlannerIntervention[]
  time?: number
  elapsedMinute?: number
  floodProgress?: number
  showHeatmap?: boolean
  occupancy?: BuildingOccupancy[]
  buildings?: Building[]
  lassoPolygon?: [number, number][]
}) {
  const time = input.time ?? 0
  const elapsedMinute = input.elapsedMinute ?? 0
  const floodProgress = input.floodProgress ?? 0
  const shapedCells = input.lassoPolygon && input.lassoPolygon.length >= 3
    ? input.cells.filter(cell => isPointInPolygon(cell.position, input.lassoPolygon!))
    : input.cells
  // All cells with water at the final simulation state
  const visibleCells = shapedCells.filter(cell => cell.depthM > 0.04)
  const peakDepth = visibleCells.reduce((max, c) => Math.max(max, c.depthM), 0)

  // Only cells where water has actually arrived yet — makes the flood SPREAD over time.
  const activeCells = visibleCells.filter(cell => cell.arrivalMinute <= elapsedMinute)

  // Wave amplitude grows with depth, so deep floods ripple more than shallow ones.
  const waveAmp = Math.min(peakDepth * floodProgress * 0.14, 0.22)

  // Three merged surface patches, each built from only the active (arrived) cells.
  // The polygon grows as more cells become active, and each ring sits at a higher Z
  // so deeper zones visually tower over the shallow fringe.
  let waterPatches: FloodSurfacePatch[]

  if (input.lassoPolygon && input.lassoPolygon.length >= 3 && activeCells.length > 0) {
    const ringDefs = [
      { zOff: 0,    alpha: 130, lineAlpha: 165 },
      { zOff: 0.10, alpha: 165, lineAlpha: 200 },
      { zOff: 0.22, alpha: 195, lineAlpha: 230 },
    ]
    waterPatches = ringDefs.map((r, ri) => {
      const polygon = input.lassoPolygon!.map(([lng, lat], vi) => {
        const angle = (vi / input.lassoPolygon!.length) * Math.PI * 2
        const wave = waveAmp * (
          0.6 * Math.sin(time * 1.1 + angle * 2.7 + ri) +
          0.4 * Math.sin(time * 0.65 + angle * 5.1 + ri * 1.3)
        )
        return [lng, lat, peakDepth * floodProgress * 0.6 + r.zOff + wave] as Position3D
      })
      return {
        id: `flood-ring-${ri}`,
        polygon,
        edge: [...polygon, polygon[0]],
        fillColor: [14 - ri * 4, 95 - ri * 28, 215 - ri * 22, Math.round(floodProgress * r.alpha)] as Rgba,
        lineColor: [70 - ri * 15, 165 - ri * 30, 250 - ri * 10, Math.round(floodProgress * r.lineAlpha)] as Rgba,
      }
    })
  } else {
    // Build each ring from only the active cells at that depth threshold.
    // Shallower cells haven't arrived yet → shallow ring is smaller early on.
    const ringDefs = [
      { id: 'flood-ring-0', threshold: 0.04, expand: 78, zOff: 0,    fill: [18, 95, 215] as [number,number,number], lineAlpha: 165, fillAlpha: 130, wave: waveAmp * 0.55 },
      { id: 'flood-ring-1', threshold: 0.18, expand: 62, zOff: 0.10, fill: [12, 68, 192] as [number,number,number], lineAlpha: 200, fillAlpha: 165, wave: waveAmp * 0.85 },
      { id: 'flood-ring-2', threshold: 0.40, expand: 46, zOff: 0.22, fill: [6,  40, 162] as [number,number,number], lineAlpha: 230, fillAlpha: 195, wave: waveAmp * 1.1  },
    ]
    waterPatches = ringDefs
      .map(r => {
        const ringCells = activeCells.filter(c => c.depthM >= r.threshold)
        return buildFloodSurfacePatch(
          r.id, ringCells, r.threshold, r.expand,
          peakDepth * floodProgress * 0.6 + r.zOff,
          [...r.fill, Math.round(floodProgress * r.fillAlpha)] as Rgba,
          [80, 175, 255, Math.round(floodProgress * r.lineAlpha)],
          time, r.wave,
        )
      })
      .filter((p): p is FloodSurfacePatch => p !== null)
  }

  // Surface glints: small bright dots that pulse to mimic light on moving water
  interface GlintPoint { id: string; position: [number, number, number]; phase: number }
  const glintPoints: GlintPoint[] = []
  if (floodProgress > 0.1 && activeCells.length > 0) {
    const glintCount = Math.min(Math.round(activeCells.length * 0.4), 55)
    for (let g = 0; g < glintCount; g++) {
      const seed = `glint-${g}`
      const h1 = hashWave(`${seed}-lat`)
      const h2 = hashWave(`${seed}-lng`)
      const h3 = hashWave(`${seed}-phase`)
      const cellIdx = Math.floor(hashWave(`${seed}-cell`) * activeCells.length)
      const cell = activeCells[Math.min(cellIdx, activeCells.length - 1)]
      glintPoints.push({
        id: seed,
        position: [
          cell.position.lng + (h2 - 0.5) * 0.0004,
          cell.position.lat + (h1 - 0.5) * 0.0004,
          peakDepth * floodProgress * 0.6 + 0.05,
        ],
        phase: h3 * Math.PI * 2,
      })
    }
  }

  // Generate 3D rainfall layer if there is ongoing rainfall (minutes 0 to 24)
  const rainStreaks: Array<{ id: string; path: Position3D[] }> = []
  if (elapsedMinute > 0 && elapsedMinute < 24.5) {
    // Dynamic rain opacity scaling: starts light, peaks, then fades as the rain stops
    const rainIntensity = elapsedMinute <= 12 
      ? elapsedMinute / 12 
      : Math.max(0, 1 - (elapsedMinute - 12) / 12.5)

    const streakCount = Math.round(75 * rainIntensity)
    const rainCells = shapedCells.length > 0 ? shapedCells : input.cells
    if (rainCells.length > 0 && streakCount > 0) {
      for (let i = 0; i < streakCount; i++) {
        const seed = `rain-streak-${i}`
        const hash1 = hashWave(`${seed}-lat`)
        const hash2 = hashWave(`${seed}-lng`)
        const hashSpeed = hashWave(`${seed}-speed`)

        // Pick a random cell from the actual flood area to match its irregular shape
        const cellIndex = Math.floor(hashWave(`${seed}-cell`) * rainCells.length)
        const baseCell = rainCells[Math.min(cellIndex, rainCells.length - 1)]
        const jitterLat = (hash1 - 0.5) * 0.0006
        const jitterLng = (hash2 - 0.5) * 0.0006
        const lat = baseCell.position.lat + jitterLat
        const lng = baseCell.position.lng + jitterLng

        // Fall animation using time and speed
        const speed = 40 + hashSpeed * 30
        const fallCycle = 95 // max altitude in meters
        const startZ = fallCycle - ((time * speed + hash1 * fallCycle) % fallCycle)
        const endZ = Math.max(0, startZ - 12 - hashSpeed * 10) // length of the raindrop path

        // Slight slant for realistic rain falling at an angle
        const angleOffsetLat = 0.00003
        const angleOffsetLng = -0.00004

        rainStreaks.push({
          id: `rain-${i}`,
          path: [
            [lng + angleOffsetLng, lat + angleOffsetLat, startZ],
            [lng, lat, endZ]
          ]
        })
      }
    }
  }

  return [
    new SolidPolygonLayer<FloodSurfacePatch>({
      id: 'flood-water-surface-fill',
      data: waterPatches,
      getPolygon: patch => patch.polygon,
      getFillColor: patch => patch.fillColor,
      extruded: false,
      filled: true,
      pickable: false,
      parameters: { depthTest: true, depthMask: false } as any,
    }),

    new PathLayer<FloodSurfacePatch>({
      id: 'flood-water-surface-edge',
      data: waterPatches,
      getPath: patch => patch.edge,
      getColor: patch => patch.lineColor,
      getWidth: 2.5,
      widthUnits: 'pixels',
      pickable: false,
      parameters: { depthTest: true, depthMask: false } as any,
    }),

    new ScatterplotLayer<GlintPoint>({
      id: 'flood-water-glints',
      data: glintPoints,
      getPosition: g => g.position,
      getRadius: g => 0.7 + 0.5 * Math.abs(Math.sin(time * 2.3 + g.phase)),
      radiusUnits: 'meters',
      getFillColor: g => {
        const brightness = 0.45 + 0.55 * Math.abs(Math.sin(time * 2.3 + g.phase))
        return [
          Math.round(190 + 65 * brightness),
          Math.round(215 + 40 * brightness),
          255,
          Math.round(floodProgress * brightness * 140),
        ] as Rgba
      },
      filled: true,
      stroked: false,
      pickable: false,
      parameters: { depthTest: true, depthMask: false } as any,
    }),

    new PathLayer<{ id: string; path: Position3D[] }>({
      id: 'flood-falling-rain-3d',
      data: rainStreaks,
      getPath: d => d.path,
      getColor: [210, 230, 255, 105],
      getWidth: 1.2,
      widthUnits: 'pixels',
      pickable: false,
      parameters: {
        depthTest: true,
        depthMask: false,
      } as any
    }),


    // Protected zones: cells that baseline flooding would have hit but interventions saved
    ...(input.baselineCells && input.baselineCells.length > 0 && input.interventions.length > 0 ? (() => {
      const PROTECTION_THRESHOLD = 0.12
      const improvedDepthById = new Map(input.cells.map(c => [c.id, c.depthM]))
      const protectedCells = input.baselineCells.filter(bc => {
        const improvedDepth = improvedDepthById.get(bc.id) ?? bc.depthM
        return bc.depthM >= PROTECTION_THRESHOLD && improvedDepth < PROTECTION_THRESHOLD
      })
      if (protectedCells.length === 0) return []
      return [
        new ScatterplotLayer<FloodDepthCell>({
          id: 'flood-protected-zones-fill',
          data: protectedCells,
          getPosition: c => [c.position.lng, c.position.lat, 0.5],
          getRadius: 42,
          radiusUnits: 'meters',
          getFillColor: c => {
            const savedDepth = c.depthM
            const intensity = Math.min(1, savedDepth / 0.6)
            return [30, Math.round(200 + 55 * intensity), 120, Math.round(55 + 40 * intensity)] as Rgba
          },
          filled: true,
          stroked: false,
          pickable: false,
          parameters: { depthCompare: 'always', depthWriteEnabled: false },
        }),
        new ScatterplotLayer<FloodDepthCell>({
          id: 'flood-protected-zones-edge',
          data: protectedCells,
          getPosition: c => [c.position.lng, c.position.lat, 0.6],
          getRadius: 42,
          radiusUnits: 'meters',
          getFillColor: [0, 0, 0, 0],
          getLineColor: [52, 230, 140, 110] as Rgba,
          stroked: true,
          filled: false,
          getLineWidth: 1.5,
          lineWidthUnits: 'pixels',
          pickable: false,
          parameters: { depthCompare: 'always', depthWriteEnabled: false },
        }),
      ]
    })() : []),

    // Barrier walls: each barrier renders its own directed wall line based on its angle
    ...(input.interventions.filter(i => i.kind === 'flood-barrier').length > 0 ? (() => {
      const METERS_PER_LNG = 111320
      const METERS_PER_LAT = 110540
      const barriers = input.interventions.filter(i => i.kind === 'flood-barrier')
      const wallSegments: Array<{ id: string; path: Position3D[] }> = barriers.map(b => {
        const cosLat = Math.cos(b.position.lat * Math.PI / 180)
        const halfLen = b.radiusM * 0.45
        const dLng = Math.cos(b.angle) * halfLen / (METERS_PER_LNG * cosLat)
        const dLat = Math.sin(b.angle) * halfLen / METERS_PER_LAT
        return {
          id: `barrier-wall-${b.id}`,
          path: [
            [b.position.lng - dLng, b.position.lat - dLat, 2],
            [b.position.lng + dLng, b.position.lat + dLat, 2],
          ],
        }
      })
      return [
        new PathLayer<{ id: string; path: Position3D[] }>({
          id: 'flood-barrier-wall-line',
          data: wallSegments,
          getPath: d => d.path,
          getColor: [255, 207, 92, 220],
          getWidth: 6,
          widthUnits: 'pixels',
          pickable: false,
          parameters: { depthCompare: 'always', depthWriteEnabled: false },
        }),
      ]
    })() : []),

    // Elevated road: show its corridor direction as an orange road-deck line
    ...(input.interventions.filter(i => i.kind === 'elevated-road').length > 0 ? (() => {
      const METERS_PER_LNG = 111320
      const METERS_PER_LAT = 110540
      const roads = input.interventions.filter(i => i.kind === 'elevated-road')
      const deckSegments: Array<{ id: string; path: Position3D[] }> = roads.map(r => {
        const cosLat = Math.cos(r.position.lat * Math.PI / 180)
        const halfLen = r.radiusM * 0.45
        const dLng = Math.cos(r.angle) * halfLen / (METERS_PER_LNG * cosLat)
        const dLat = Math.sin(r.angle) * halfLen / METERS_PER_LAT
        return {
          id: `road-deck-${r.id}`,
          path: [
            [r.position.lng - dLng, r.position.lat - dLat, 3.5],
            [r.position.lng + dLng, r.position.lat + dLat, 3.5],
          ],
        }
      })
      return [
        new PathLayer<{ id: string; path: Position3D[] }>({
          id: 'flood-elevated-road-deck',
          data: deckSegments,
          getPath: d => d.path,
          getColor: [255, 107, 36, 200],
          getWidth: 10,
          widthUnits: 'pixels',
          pickable: false,
          parameters: { depthCompare: 'always', depthWriteEnabled: false },
        }),
      ]
    })() : []),

    // Retention pond water fill: animated blue pool within radius
    ...(input.interventions.filter(i => i.kind === 'retention-pond').length > 0 ? [
      new ScatterplotLayer<PlannerIntervention>({
        id: 'flood-retention-pond-fill',
        data: input.interventions.filter(i => i.kind === 'retention-pond'),
        getPosition: item => [item.position.lng, item.position.lat, 0.3],
        getRadius: item => item.radiusM * (0.55 + 0.08 * Math.sin(time * 0.8)),
        radiusUnits: 'meters',
        getFillColor: [28, 110, 240, Math.round(55 + 20 * Math.abs(Math.sin(time * 0.6)))] as Rgba,
        filled: true,
        stroked: false,
        pickable: false,
        parameters: { depthCompare: 'always', depthWriteEnabled: false },
      }),
    ] : []),

    // Green corridor absorption ring: pulsing ring showing active absorption
    ...(input.interventions.filter(i => i.kind === 'green-corridor').length > 0 ? [
      new ScatterplotLayer<PlannerIntervention>({
        id: 'flood-green-corridor-ring',
        data: input.interventions.filter(i => i.kind === 'green-corridor'),
        getPosition: item => [item.position.lng, item.position.lat, 0.4],
        getRadius: item => item.radiusM * (0.7 + 0.15 * Math.sin(time * 1.2)),
        radiusUnits: 'meters',
        getFillColor: [0, 0, 0, 0] as Rgba,
        getLineColor: [52, 210, 132, Math.round(80 + 40 * Math.abs(Math.sin(time * 1.2)))] as Rgba,
        stroked: true,
        filled: false,
        getLineWidth: 2,
        lineWidthUnits: 'pixels',
        pickable: false,
        parameters: { depthCompare: 'always', depthWriteEnabled: false },
      }),
    ] : []),

    new ScatterplotLayer<PlannerIntervention>({
      id: 'flood-planner-interventions',
      data: input.interventions,
      getPosition: item => [item.position.lng, item.position.lat, 8],
      getRadius: item => item.radiusM,
      radiusUnits: 'meters',
      getFillColor: item => {
        const c = interventionColor(item.kind)
        return [c[0], c[1], c[2], 28]
      },
      getLineColor: item => interventionColor(item.kind),
      stroked: true,
      filled: true,
      getLineWidth: 2,
      lineWidthUnits: 'pixels',
      pickable: false,
      parameters: { depthCompare: 'always', depthWriteEnabled: false },
    }),

    // --- Beautiful Procedural Low-Poly 3D Models for Flood Prevention Items ---
    // Matches the blocky/voxel architectural style of the pedestrians.
    
    // 1. Core / Base structures
    new ColumnLayer<PlannerIntervention>({
      id: 'flood-3d-intervention-bases',
      data: input.interventions,
      diskResolution: 4, // Stylized square/rectangular prisms
      radius: 12,
      radiusUnits: 'meters',
      extruded: true,
      filled: true,
      stroked: false,
      angle: 45,
      material: { ambient: 0.55, diffuse: 0.7, shininess: 8 },
      getPosition: item => [item.position.lng, item.position.lat, 0],
      getElevation: item => {
        if (item.kind === 'shelter-node') return 24
        if (item.kind === 'elevated-road') return 12
        if (item.kind === 'flood-barrier') return 6
        if (item.kind === 'retention-pond') return 4
        return 5
      },
      getFillColor: item => {
        if (item.kind === 'retention-pond') return [100, 110, 120, 240] // concrete basin frame
        return interventionColor(item.kind)
      },
      parameters: { depthTest: true, depthMask: true } as any,
    }),

    // 2. Secondary Tiers, Water Cores, Foliage canopies, or Roof caps
    new ColumnLayer<PlannerIntervention>({
      id: 'flood-3d-intervention-tops',
      data: input.interventions,
      diskResolution: 4,
      radius: 8,
      radiusUnits: 'meters',
      extruded: true,
      filled: true,
      stroked: false,
      angle: 45,
      material: { ambient: 0.65, diffuse: 0.6, shininess: 12 },
      getPosition: item => {
        const baseLng = item.position.lng
        const baseLat = item.position.lat
        if (item.kind === 'shelter-node') return [baseLng, baseLat, 24]
        if (item.kind === 'elevated-road') return [baseLng, baseLat, 12]
        if (item.kind === 'green-corridor') return [baseLng, baseLat, 5] // Canopy sits on trunk
        if (item.kind === 'retention-pond') return [baseLng, baseLat, 0.5] // Water core sits inside
        return [baseLng, baseLat, 6]
      },
      getElevation: item => {
        if (item.kind === 'shelter-node') return 6 // Pyramidal peaked roof
        if (item.kind === 'elevated-road') return 2 // Road deck surface
        if (item.kind === 'green-corridor') return 8 // Foliage block height
        if (item.kind === 'retention-pond') return 3 // Deep blue water block
        return 1.5 // general top trim / bracing caps
      },
      getFillColor: item => {
        if (item.kind === 'shelter-node') return [45, 55, 72, 250] // Dark slate roof
        if (item.kind === 'elevated-road') return [255, 107, 36, 250] // Bright orange road deck
        if (item.kind === 'green-corridor') return [34, 180, 105, 245] // Green canopy foliage
        if (item.kind === 'retention-pond') return [41, 121, 255, 240] // Dynamic blue water core
        if (item.kind === 'flood-barrier') return [60, 64, 72, 250] // Dark reinforcement trim
        return [220, 220, 220, 240]
      },
      parameters: { depthTest: true, depthMask: true } as any,
    }),

  ]
}
