import type {
  Building,
  CityDataAttribution,
  CityEnrichmentResponse,
  CityPlace,
  CityWeatherContext,
  LatLng,
  RoadSegment,
  StreetFixture,
  TrafficPoint,
  TransitNode,
  VegetationFeature,
  WaterBody,
} from '@/types'
import {
  fetchBuildings,
  fetchRoads,
  fetchStreetFixtures,
  fetchTrafficDensity,
  fetchVegetation,
  fetchWaterBodies,
} from '@/lib/overpass'

type CityDataMode = 'auto' | 'overture' | 'overpass'

interface CacheEntry {
  expiresAt: number
  value: CityEnrichmentResponse
}

const CACHE_TTL_MS = 1000 * 60 * 10
const cityCache = new Map<string, CacheEntry>()

const ATTRIBUTIONS: Record<string, CityDataAttribution> = {
  overpass: {
    source: 'overpass',
    label: 'OpenStreetMap contributors via Overpass API',
    url: 'https://www.openstreetmap.org/copyright',
  },
  openMeteo: {
    source: 'open-meteo',
    label: 'Open-Meteo weather forecast API',
    url: 'https://open-meteo.com/',
  },
  overtureReady: {
    source: 'overture',
    label: 'Overture Maps adapter ready; install DuckDB CLI to enable GeoParquet extraction',
    url: 'https://overturemaps.org/',
  },
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function cacheKey(center: LatLng, radiusKm: number, mode: CityDataMode) {
  return `${mode}:${center.lat.toFixed(4)},${center.lng.toFixed(4)},${radiusKm.toFixed(2)}`
}

function normalizeMode(value: string | undefined): CityDataMode {
  if (value === 'overture' || value === 'overpass') return value
  return 'auto'
}

function withBuildingMetadata(buildings: Building[]): Building[] {
  return buildings.map(building => ({
    ...building,
    source: building.source ?? 'overpass',
    confidence: building.confidence ?? (building.sourceTags?.height || building.levels ? 0.82 : 0.62),
  }))
}

function withRoadMetadata(roads: RoadSegment[]): RoadSegment[] {
  return roads.map(road => ({
    ...road,
    source: road.source ?? 'overpass',
    confidence: road.confidence ?? 0.76,
    label: road.label ?? 'OSM road/path network',
  }))
}

function withFixtureMetadata(fixtures: StreetFixture[]): StreetFixture[] {
  return fixtures.map(fixture => ({
    ...fixture,
    source: fixture.source ?? 'overpass',
    confidence: fixture.confidence ?? 0.78,
  }))
}

function withVegetationMetadata(vegetation: VegetationFeature[]): VegetationFeature[] {
  return vegetation.map(feature => ({
    ...feature,
    source: feature.source ?? 'overpass',
    confidence: feature.confidence ?? (feature.geometry === 'polygon' ? 0.74 : 0.68),
  }))
}

function withWaterBodyMetadata(waterBodies: WaterBody[]): WaterBody[] {
  return waterBodies.map(waterBody => ({
    ...waterBody,
    source: waterBody.source ?? 'overpass',
    confidence: waterBody.confidence ?? (waterBody.geometry === 'polygon' ? 0.8 : 0.72),
  }))
}

function withTrafficMetadata(points: TrafficPoint[], weather: CityWeatherContext | null): TrafficPoint[] {
  const weatherMultiplier = weather?.footfallMultiplier ?? 1
  return points.map(point => ({
    ...point,
    source: point.source ?? 'inferred',
    confidence: point.confidence ?? 0.58,
    label: point.label ?? 'Inferred from transit, POI, and street context',
    weight: clamp(point.weight * weatherMultiplier, 0.03, 1),
  }))
}

function trafficToPlaces(points: TrafficPoint[]): CityPlace[] {
  const placePoints = points.filter((point): point is TrafficPoint & { category: CityPlace['category'] } => point.category !== 'transit-hub')
  return placePoints
    .map(point => ({
      id: `place-${point.id}`,
      position: point.position,
      category: point.category,
      source: point.source ?? 'inferred',
      confidence: Math.max(0.35, (point.confidence ?? 0.58) - 0.08),
    }))
}

function trafficToTransit(points: TrafficPoint[], fixtures: StreetFixture[]): TransitNode[] {
  const fromTraffic = points
    .filter(point => point.category === 'transit-hub')
    .map(point => ({
      id: `transit-${point.id}`,
      position: point.position,
      kind: 'other' as const,
      source: point.source ?? 'inferred',
      confidence: point.confidence ?? 0.62,
    }))

  const fromFixtures = fixtures
    .filter(fixture => fixture.kind === 'bus-stop' || fixture.kind === 'subway-entrance' || fixture.kind === 'taxi-stand')
    .map(fixture => ({
      id: `fixture-transit-${fixture.id}`,
      position: fixture.position,
      kind: fixture.kind === 'bus-stop'
        ? 'bus' as const
        : fixture.kind === 'subway-entrance'
          ? 'subway' as const
          : 'taxi' as const,
      name: fixture.name,
      source: fixture.source ?? 'overpass',
      confidence: fixture.confidence ?? 0.78,
    }))

  return [...fromTraffic, ...fromFixtures]
}

function weatherSummary(weatherCode?: number, precipitationMm = 0, cloudCoverPct = 0) {
  if (precipitationMm >= 4) return 'Heavy rain'
  if (precipitationMm > 0) return 'Light rain'
  if (weatherCode !== undefined && weatherCode >= 95) return 'Thunderstorms nearby'
  if (cloudCoverPct >= 75) return 'Cloudy'
  if (cloudCoverPct >= 35) return 'Partly cloudy'
  return 'Clear'
}

function lightingForWeather(isDay: boolean | undefined, precipitationMm = 0, cloudCoverPct = 0): CityWeatherContext['lighting'] {
  if (precipitationMm > 0) return 'rain'
  if (isDay === false) return 'night'
  if (cloudCoverPct >= 70) return 'dusk'
  return 'day'
}

function footfallMultiplierForWeather(precipitationMm = 0, windSpeedKmh = 0) {
  const rainPenalty = precipitationMm >= 4 ? 0.72 : precipitationMm > 0 ? 0.86 : 1
  const windPenalty = windSpeedKmh >= 45 ? 0.9 : 1
  return clamp(rainPenalty * windPenalty, 0.65, 1.08)
}

async function fetchWeatherContext(center: LatLng): Promise<CityWeatherContext | null> {
  const params = new URLSearchParams({
    latitude: String(center.lat),
    longitude: String(center.lng),
    current: 'temperature_2m,precipitation,cloud_cover,wind_speed_10m,weather_code,is_day',
    timezone: 'auto',
  })
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(6000),
  })
  if (!res.ok) throw new Error(`Open-Meteo returned ${res.status}`)

  const data = await res.json() as {
    current?: {
      temperature_2m?: number
      precipitation?: number
      cloud_cover?: number
      wind_speed_10m?: number
      weather_code?: number
      is_day?: number
    }
  }
  const current = data.current ?? {}
  const precipitationMm = current.precipitation
  const cloudCoverPct = current.cloud_cover
  const windSpeedKmh = current.wind_speed_10m
  const isDay = current.is_day === undefined ? undefined : current.is_day === 1
  const lighting = lightingForWeather(isDay, precipitationMm, cloudCoverPct)

  return {
    source: 'open-meteo',
    fetchedAt: new Date().toISOString(),
    temperatureC: current.temperature_2m,
    precipitationMm,
    cloudCoverPct,
    windSpeedKmh,
    weatherCode: current.weather_code,
    isDay,
    lighting,
    footfallMultiplier: footfallMultiplierForWeather(precipitationMm, windSpeedKmh),
    summary: weatherSummary(current.weather_code, precipitationMm, cloudCoverPct),
  }
}

function isDuckDbAvailable() {
  return false
}

export async function getCityEnrichment(input: {
  center: LatLng
  radiusKm?: number
  mode?: string
}): Promise<CityEnrichmentResponse> {
  const radiusKm = clamp(input.radiusKm ?? 1, 0.2, 2.5)
  const mode = normalizeMode(input.mode ?? process.env.CITY_DATA_MODE)
  const key = cacheKey(input.center, radiusKm, mode)
  const cached = cityCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  const errors: string[] = []
  const attributions = new Map<string, CityDataAttribution>([
    ['overpass', ATTRIBUTIONS.overpass],
    ['open-meteo', ATTRIBUTIONS.openMeteo],
  ])
  if (mode === 'auto' || mode === 'overture') {
    attributions.set('overture-ready', ATTRIBUTIONS.overtureReady)
    if (!isDuckDbAvailable() && mode === 'overture') {
      errors.push('Overture mode requested, but DuckDB CLI is not installed; using Overpass fallback.')
    }
  }

  const weatherResult = await Promise.allSettled([fetchWeatherContext(input.center)])
  const weather = weatherResult[0].status === 'fulfilled' ? weatherResult[0].value : null
  if (weatherResult[0].status === 'rejected') errors.push(`Weather: ${weatherResult[0].reason}`)

  const [buildingsResult, roadsResult, fixturesResult, vegetationResult, waterBodiesResult, trafficResult] = await Promise.allSettled([
    fetchBuildings(input.center, radiusKm),
    fetchRoads(input.center, radiusKm),
    fetchStreetFixtures(input.center, radiusKm),
    fetchVegetation(input.center, radiusKm),
    fetchWaterBodies(input.center, radiusKm),
    fetchTrafficDensity(input.center, radiusKm),
  ])

  const buildings = buildingsResult.status === 'fulfilled' ? withBuildingMetadata(buildingsResult.value) : []
  const roads = roadsResult.status === 'fulfilled' ? withRoadMetadata(roadsResult.value) : []
  const streetFixtures = fixturesResult.status === 'fulfilled' ? withFixtureMetadata(fixturesResult.value) : []
  const vegetation = vegetationResult.status === 'fulfilled' ? withVegetationMetadata(vegetationResult.value) : []
  const waterBodies = waterBodiesResult.status === 'fulfilled' ? withWaterBodyMetadata(waterBodiesResult.value) : []
  const trafficPoints = trafficResult.status === 'fulfilled' ? withTrafficMetadata(trafficResult.value, weather) : []

  if (buildingsResult.status === 'rejected') errors.push(`Buildings: ${buildingsResult.reason}`)
  if (roadsResult.status === 'rejected') errors.push(`Roads: ${roadsResult.reason}`)
  if (fixturesResult.status === 'rejected') errors.push(`Fixtures: ${fixturesResult.reason}`)
  if (vegetationResult.status === 'rejected') errors.push(`Vegetation: ${vegetationResult.reason}`)
  if (waterBodiesResult.status === 'rejected') errors.push(`Water bodies: ${waterBodiesResult.reason}`)
  if (trafficResult.status === 'rejected') errors.push(`Activity: ${trafficResult.reason}`)

  const response: CityEnrichmentResponse = {
    metadata: {
      center: input.center,
      radiusKm,
      mode,
      generatedAt: new Date().toISOString(),
      attributions: [...attributions.values()],
      errors: errors.length > 0 ? errors : undefined,
    },
    buildings,
    roads,
    places: trafficToPlaces(trafficPoints),
    streetFixtures,
    vegetation,
    waterBodies,
    trafficPoints,
    transitNodes: trafficToTransit(trafficPoints, streetFixtures),
    weather,
  }

  cityCache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value: response,
  })

  return response
}
