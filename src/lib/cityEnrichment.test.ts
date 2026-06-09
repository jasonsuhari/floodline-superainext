import { describe, expect, it } from 'vitest'
import { parseRoadResponse, parseStreetFixturesResponse, parseTrafficDensityResponse } from '@/lib/overpass'

describe('city enrichment source normalization', () => {
  it('parses richer street fixtures from OSM tags', () => {
    const fixtures = parseStreetFixturesResponse({
      elements: [
        { type: 'node', id: 1, lat: 1.3, lon: 103.8, tags: { amenity: 'bicycle_parking' } },
        { type: 'node', id: 2, lat: 1.31, lon: 103.81, tags: { railway: 'subway_entrance', name: 'Station A' } },
        { type: 'node', id: 3, lat: 1.32, lon: 103.82, tags: { amenity: 'charging_station' } },
      ],
    })

    expect(fixtures.map(fixture => fixture.kind)).toEqual([
      'bicycle-parking',
      'subway-entrance',
      'charging-station',
    ])
    expect(fixtures.every(fixture => fixture.source === 'overpass')).toBe(true)
  })

  it('marks OSM activity points as inferred context', () => {
    const points = parseTrafficDensityResponse({
      elements: [
        { type: 'node', id: 10, lat: 1.3, lon: 103.8, tags: { amenity: 'cafe' } },
        { type: 'node', id: 11, lat: 1.31, lon: 103.81, tags: { railway: 'station' } },
      ],
    })

    expect(points).toHaveLength(2)
    expect(points[0]).toMatchObject({
      category: 'cafe',
      source: 'inferred',
      label: 'Inferred from OSM POI/transit context',
    })
    expect(points[1].category).toBe('transit-hub')
  })

  it('keeps road source and confidence metadata with road geometry', () => {
    const roads = parseRoadResponse({
      elements: [
        {
          type: 'way',
          id: 99,
          tags: { highway: 'pedestrian' },
          geometry: [
            { lat: 1.3, lon: 103.8 },
            { lat: 1.31, lon: 103.81 },
          ],
        },
      ],
    })

    expect(roads).toHaveLength(1)
    expect(roads[0]).toMatchObject({
      kind: 'pedestrian',
      source: 'overpass',
      confidence: 0.76,
      label: 'OSM road/path network',
    })
  })
})
