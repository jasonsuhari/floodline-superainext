import type { Building, LatLng } from '@/types'
import type { Map as MapboxMap } from 'mapbox-gl'

export type ElevationQueryFn = (
  points: LatLng[]
) => Promise<Map<string, number>>

export async function enrichBuildingsWithElevation(
  buildings: Building[],
  queryFn: ElevationQueryFn
): Promise<Building[]> {
  if (buildings.length === 0) return buildings

  const points = buildings.map(b => b.centroid)
  const elevationMap = await queryFn(points)

  return buildings.map(b => ({
    ...b,
    groundElevation: elevationMap.get(`${b.centroid.lat},${b.centroid.lng}`) ?? b.groundElevation,
  }))
}

export function makeMapboxElevationQuery(map: MapboxMap): ElevationQueryFn {
  return async (points: LatLng[]) => {
    const result = new Map<string, number>()
    for (const point of points) {
      const elevation = map.queryTerrainElevation([point.lng, point.lat]) ?? 0
      result.set(`${point.lat},${point.lng}`, elevation)
    }
    return result
  }
}
