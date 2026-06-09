import { describe, expect, it } from 'vitest'
import { buildFloodScenario, createPlannerIntervention } from '@/lib/floodSimulation'
import type { Building, RoadSegment, TrafficPoint } from '@/types'

const center = { lat: 1.35, lng: 103.82 }

const buildings: Building[] = [
  {
    id: 'b-medical',
    footprint: [
      { lat: 1.3501, lng: 103.8201 },
      { lat: 1.3501, lng: 103.8203 },
      { lat: 1.3503, lng: 103.8203 },
      { lat: 1.3503, lng: 103.8201 },
      { lat: 1.3501, lng: 103.8201 },
    ],
    centroid: { lat: 1.3502, lng: 103.8202 },
    groundElevation: 0,
    heightM: 28,
    baseHeightM: 0,
    levels: 8,
    poiCategory: 'medical',
    poiName: 'Clinic block',
  },
  {
    id: 'b-office',
    footprint: [
      { lat: 1.351, lng: 103.821 },
      { lat: 1.351, lng: 103.82125 },
      { lat: 1.35125, lng: 103.82125 },
      { lat: 1.35125, lng: 103.821 },
      { lat: 1.351, lng: 103.821 },
    ],
    centroid: { lat: 1.35112, lng: 103.82112 },
    groundElevation: 0,
    heightM: 45,
    baseHeightM: 0,
    levels: 13,
    poiCategory: 'office',
    poiName: 'Office tower',
  },
]

const roads: RoadSegment[] = [
  {
    id: 'road-1',
    path: [
      { lat: 1.349, lng: 103.819 },
      { lat: 1.35, lng: 103.82 },
      { lat: 1.351, lng: 103.821 },
    ],
    kind: 'primary',
    weight: 0.8,
  },
]

const trafficPoints: TrafficPoint[] = [
  {
    id: 'traffic-1',
    position: { lat: 1.35025, lng: 103.82025 },
    weight: 1,
    category: 'medical',
  },
]

describe('flood simulation', () => {
  it('estimates indoor exposure and improves after interventions', () => {
    const baseline = buildFloodScenario({
      center,
      buildings,
      roads,
      trafficPoints,
      elapsedMinute: 24,
    })

    expect(baseline.summary.affectedBuildings).toBeGreaterThan(0)
    expect(baseline.summary.exposedIndoorPeople).toBeGreaterThan(0)
    expect(baseline.indoorAgents.length).toBeGreaterThan(0)
    expect(baseline.priorityZones.length).toBeGreaterThan(0)

    // Retention pond placed at the flood centre absorbs water before it reaches buildings
    const intervention = createPlannerIntervention('retention-pond', center, 1)
    const improved = buildFloodScenario({
      center,
      buildings,
      roads,
      trafficPoints,
      elapsedMinute: 24,
      interventions: [intervention],
    })

    expect(improved.improvedSummary).not.toBeNull()
    expect(improved.improvedSummary?.affectedPeople).toBeLessThanOrEqual(baseline.summary.affectedPeople)
    expect(improved.improvedSummary?.estimatedDamageUsd).toBeLessThanOrEqual(baseline.summary.estimatedDamageUsd)
  })
})
