import { BitmapLayer, PathLayer, ScatterplotLayer } from '@deck.gl/layers'
import type { StreetFixture, StreetFixtureKind } from '@/types'

interface Pole {
  id: string
  from: [number, number, number]
  to: [number, number, number]
  widthM: number
  color: [number, number, number, number]
}

interface LampDot {
  id: string
  position: [number, number, number]
  radiusM: number
  color: [number, number, number, number]
}

interface BusStopAdPanel {
  id: string
  bounds: [[number, number, number], [number, number, number], [number, number, number], [number, number, number]]
}

type TrafficPhase = 'red' | 'yellow' | 'green'

const METERS_PER_LAT_DEGREE = 110540
const METERS_PER_LNG_DEGREE = 111320
const BUS_STOP_MODEL_SCALE = 1.5
const BUS_STOP_WIDTH_M = 3.2 * BUS_STOP_MODEL_SCALE
const BUS_STOP_DEPTH_M = 1.25 * BUS_STOP_MODEL_SCALE
const BUS_STOP_HEIGHT_M = 2.65 * BUS_STOP_MODEL_SCALE
const BUS_STOP_AD_BOTTOM_M = 0.35 * BUS_STOP_MODEL_SCALE
const BUS_STOP_AD_HEIGHT_M = 1.85 * BUS_STOP_MODEL_SCALE

// 60-second cycle: 30s green → 5s yellow → 25s red
// Each fixture gets a staggered offset seeded from its OSM id.
function getTrafficPhase(fixture: StreetFixture, t: number): TrafficPhase {
  const seed = fixture.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 60
  const elapsed = (t + seed) % 60
  if (elapsed < 30) return 'green'
  if (elapsed < 35) return 'yellow'
  return 'red'
}

const DIM: [number, number, number, number] = [40, 40, 42, 180]
const BULB_COLORS: Record<TrafficPhase, [number, number, number, number]> = {
  red: [225, 48, 48, 255],
  yellow: [240, 185, 40, 255],
  green: [48, 205, 100, 255],
}

function signalColor(bulb: TrafficPhase, active: TrafficPhase): [number, number, number, number] {
  return bulb === active ? BULB_COLORS[bulb] : DIM
}

const POLE_COLORS: Record<StreetFixtureKind, [number, number, number, number]> = {
  'traffic-signal': [50, 50, 55, 240],
  'bus-stop': [55, 85, 130, 225],
  'street-lamp': [62, 62, 68, 225],
  'crossing': [200, 200, 200, 0],
  'bench': [108, 78, 48, 205],
  'bicycle-parking': [78, 98, 118, 215],
  'bollard': [70, 72, 76, 230],
  'waste-bin': [42, 102, 78, 220],
  'atm': [52, 112, 185, 230],
  'subway-entrance': [230, 54, 54, 235],
  'taxi-stand': [248, 201, 52, 235],
  'charging-station': [78, 188, 110, 235],
  'fountain': [70, 160, 210, 210],
  'pumping-station': [80, 80, 85, 230],
  'drain-grate': [40, 40, 42, 220],
}

let busStopAdTexture: string | null = null

function getBusStopAdTexture(): string {
  if (busStopAdTexture) return busStopAdTexture
  if (typeof document === 'undefined') return ''

  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 384
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  ctx.fillStyle = '#f6d64a'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#121212'
  ctx.fillRect(0, 0, canvas.width, 54)
  ctx.fillStyle = '#d02020'
  ctx.fillRect(22, 80, 212, 10)
  ctx.fillRect(22, 290, 118, 10)
  ctx.fillStyle = '#1040c0'
  ctx.fillRect(22, 104, 152, 10)

  ctx.fillStyle = '#121212'
  ctx.font = '900 44px Arial, sans-serif'
  ctx.fillText('OOH', 22, 166)
  ctx.font = '900 31px Arial, sans-serif'
  ctx.fillText('TESTED', 22, 207)
  ctx.font = '700 20px Arial, sans-serif'
  ctx.fillText('before it goes live', 22, 242)
  ctx.font = '900 16px Arial, sans-serif'
  ctx.fillStyle = '#f6d64a'
  ctx.fillText('FAULTLINE', 22, 35)

  busStopAdTexture = canvas.toDataURL()
  return busStopAdTexture
}

function idToHeading(id: string): number {
  let h = 5381
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h) ^ id.charCodeAt(i)
  return ((h >>> 0) / 0xffffffff) * 360
}

function offsetLngLat(
  origin: { lat: number; lng: number },
  eastM: number,
  northM: number,
) {
  const lngScale = METERS_PER_LNG_DEGREE * Math.cos(origin.lat * Math.PI / 180)
  return {
    lat: origin.lat + northM / METERS_PER_LAT_DEGREE,
    lng: origin.lng + eastM / lngScale,
  }
}

function busStopPoint(
  fixture: StreetFixture,
  right: { east: number; north: number },
  forward: { east: number; north: number },
  rightM: number,
  forwardM: number,
  z: number,
): [number, number, number] {
  const point = offsetLngLat(
    fixture.position,
    right.east * rightM + forward.east * forwardM,
    right.north * rightM + forward.north * forwardM,
  )
  return [point.lng, point.lat, z]
}

export function makeStreetFixtureLayers(fixtures: StreetFixture[], trafficPhaseTime: number) {
  const poles: Pole[] = []
  const lamps: LampDot[] = []
  const signalBulbs: LampDot[] = []
  const busStopPaths: Pole[] = []
  const busStopAdPanels: BusStopAdPanel[] = []

  for (const f of fixtures) {
    const lng = f.position.lng
    const lat = f.position.lat

    switch (f.kind) {
      case 'traffic-signal': {
        // Slender black pole
        poles.push({
          id: `${f.id}-pole`,
          from: [lng, lat, 0],
          to: [lng, lat, 4.5],
          widthM: 0.12,
          color: POLE_COLORS['traffic-signal'],
        })
        // Thicker housing box at the top of the pole
        poles.push({
          id: `${f.id}-housing`,
          from: [lng, lat, 3.65],
          to: [lng, lat, 4.5],
          widthM: 0.3,
          color: [30, 30, 32, 255],
        })
        // Three stacked lamp bulbs
        const phase = getTrafficPhase(f, trafficPhaseTime)
        signalBulbs.push(
          { id: `${f.id}-red`, position: [lng, lat, 4.35], radiusM: 0.13, color: signalColor('red', phase) },
          { id: `${f.id}-yellow`, position: [lng, lat, 4.08], radiusM: 0.13, color: signalColor('yellow', phase) },
          { id: `${f.id}-green`, position: [lng, lat, 3.81], radiusM: 0.13, color: signalColor('green', phase) },
        )
        break
      }

      case 'street-lamp': {
        poles.push({
          id: `${f.id}-pole`,
          from: [lng, lat, 0],
          to: [lng, lat, 5.5],
          widthM: 0.09,
          color: POLE_COLORS['street-lamp'],
        })
        // Warm white glow at the top
        lamps.push({
          id: `${f.id}-lamp`,
          position: [lng, lat, 5.55],
          radiusM: 0.32,
          color: [255, 230, 155, 215],
        })
        break
      }

      case 'bus-stop': {
        const heading = idToHeading(f.id) * Math.PI / 180
        const forward = { east: Math.sin(heading), north: Math.cos(heading) }
        const right = { east: Math.sin(heading + Math.PI / 2), north: Math.cos(heading + Math.PI / 2) }
        const hw = BUS_STOP_WIDTH_M / 2
        const hd = BUS_STOP_DEPTH_M / 2
        const roofZ = BUS_STOP_HEIGHT_M
        const adRight = hw
        const adFront = -hd + 0.08
        const adBack = hd - 0.08
        const adTop = BUS_STOP_AD_BOTTOM_M + BUS_STOP_AD_HEIGHT_M

        const rearLeftBottom = busStopPoint(f, right, forward, -hw, hd, 0)
        const rearRightBottom = busStopPoint(f, right, forward, hw, hd, 0)
        const rearLeftTop = busStopPoint(f, right, forward, -hw, hd, roofZ)
        const rearRightTop = busStopPoint(f, right, forward, hw, hd, roofZ)
        const frontLeftBottom = busStopPoint(f, right, forward, -hw, -hd, 0)
        const frontRightBottom = busStopPoint(f, right, forward, hw, -hd, 0)
        const frontLeftTop = busStopPoint(f, right, forward, -hw, -hd, roofZ)
        const frontRightTop = busStopPoint(f, right, forward, hw, -hd, roofZ)

        busStopPaths.push(
          { id: `${f.id}-post-fl`, from: frontLeftBottom, to: frontLeftTop, widthM: 0.08 * BUS_STOP_MODEL_SCALE, color: [42, 58, 68, 230] },
          { id: `${f.id}-post-fr`, from: frontRightBottom, to: frontRightTop, widthM: 0.08 * BUS_STOP_MODEL_SCALE, color: [42, 58, 68, 230] },
          { id: `${f.id}-post-rl`, from: rearLeftBottom, to: rearLeftTop, widthM: 0.08 * BUS_STOP_MODEL_SCALE, color: [42, 58, 68, 230] },
          { id: `${f.id}-post-rr`, from: rearRightBottom, to: rearRightTop, widthM: 0.08 * BUS_STOP_MODEL_SCALE, color: [42, 58, 68, 230] },
          { id: `${f.id}-roof-front`, from: frontLeftTop, to: frontRightTop, widthM: 0.16 * BUS_STOP_MODEL_SCALE, color: [32, 40, 48, 245] },
          { id: `${f.id}-roof-back`, from: rearLeftTop, to: rearRightTop, widthM: 0.16 * BUS_STOP_MODEL_SCALE, color: [32, 40, 48, 245] },
          { id: `${f.id}-roof-left`, from: frontLeftTop, to: rearLeftTop, widthM: 0.16 * BUS_STOP_MODEL_SCALE, color: [32, 40, 48, 245] },
          { id: `${f.id}-roof-right`, from: frontRightTop, to: rearRightTop, widthM: 0.16 * BUS_STOP_MODEL_SCALE, color: [32, 40, 48, 245] },
          { id: `${f.id}-bench`, from: busStopPoint(f, right, forward, -hw * 0.55, hd - 0.18 * BUS_STOP_MODEL_SCALE, 0.55 * BUS_STOP_MODEL_SCALE), to: busStopPoint(f, right, forward, hw * 0.25, hd - 0.18 * BUS_STOP_MODEL_SCALE, 0.55 * BUS_STOP_MODEL_SCALE), widthM: 0.28 * BUS_STOP_MODEL_SCALE, color: [120, 82, 46, 225] },
          { id: `${f.id}-back-glass`, from: busStopPoint(f, right, forward, -hw * 0.85, hd, 0.55 * BUS_STOP_MODEL_SCALE), to: busStopPoint(f, right, forward, hw * 0.85, hd, 2.25 * BUS_STOP_MODEL_SCALE), widthM: 0.04 * BUS_STOP_MODEL_SCALE, color: [115, 165, 205, 135] },
        )

        busStopAdPanels.push({
          id: `${f.id}-side-ad`,
          bounds: [
            busStopPoint(f, right, forward, adRight, adFront, BUS_STOP_AD_BOTTOM_M),
            busStopPoint(f, right, forward, adRight, adBack, BUS_STOP_AD_BOTTOM_M),
            busStopPoint(f, right, forward, adRight, adBack, adTop),
            busStopPoint(f, right, forward, adRight, adFront, adTop),
          ],
        })

        lamps.push({
          id: `${f.id}-flag`,
          position: busStopPoint(f, right, forward, -hw - 0.2 * BUS_STOP_MODEL_SCALE, -hd, roofZ + 0.18 * BUS_STOP_MODEL_SCALE),
          radiusM: 0.28 * BUS_STOP_MODEL_SCALE,
          color: [255, 185, 30, 230],
        })
        break
      }

      case 'crossing': {
        // Flat ground marker only — no pole
        lamps.push({
          id: `${f.id}-mark`,
          position: [lng, lat, 0.05],
          radiusM: 0.65,
          color: [240, 240, 190, 150],
        })
        break
      }

      case 'bench': {
        // Low brown stub (seat silhouette)
        poles.push({
          id: `${f.id}-seat`,
          from: [lng, lat, 0],
          to: [lng, lat, 0.48],
          widthM: 0.8,
          color: POLE_COLORS['bench'],
        })
        break
      }

      case 'bicycle-parking': {
        poles.push({
          id: `${f.id}-rack`,
          from: [lng, lat, 0],
          to: [lng, lat, 0.8],
          widthM: 0.45,
          color: POLE_COLORS['bicycle-parking'],
        })
        break
      }

      case 'pumping-station': {
        // Render a large cylindrical industrial pump station with active pulsing glow
        poles.push({
          id: `${f.id}-pump-base`,
          from: [lng, lat, 0],
          to: [lng, lat, 3.2],
          widthM: 3.4,
          color: [54, 74, 84, 255],
        })
        poles.push({
          id: `${f.id}-pump-motor`,
          from: [lng, lat, 3.2],
          to: [lng, lat, 4.4],
          widthM: 1.8,
          color: [42, 118, 142, 255],
        })
        // Pulsing status beacon
        const activePulse = 180 + Math.round(Math.sin(trafficPhaseTime * 2.8) * 75)
        lamps.push({
          id: `${f.id}-glow`,
          position: [lng, lat, 4.55],
          radiusM: 0.8,
          color: [48, 220, 160, activePulse],
        })
        break
      }

      case 'drain-grate': {
        // Flat steel grate outline
        lamps.push({
          id: `${f.id}-grate-surface`,
          position: [lng, lat, 0.04],
          radiusM: 1.25,
          color: [30, 70, 110, 190],
        })
        break
      }

      case 'bollard':
      case 'waste-bin':
      case 'atm':
      case 'subway-entrance':
      case 'taxi-stand':
      case 'charging-station':
      case 'fountain': {
        const height = f.kind === 'atm' || f.kind === 'charging-station'
          ? 1.45
          : f.kind === 'subway-entrance' || f.kind === 'taxi-stand'
            ? 2.2
            : f.kind === 'fountain'
              ? 0.35
              : 0.9
        const radius = f.kind === 'fountain' ? 0.9 : f.kind === 'waste-bin' ? 0.42 : 0.28
        poles.push({
          id: `${f.id}-${f.kind}`,
          from: [lng, lat, 0],
          to: [lng, lat, height],
          widthM: radius,
          color: POLE_COLORS[f.kind],
        })
        if (f.kind === 'subway-entrance' || f.kind === 'taxi-stand' || f.kind === 'charging-station') {
          lamps.push({
            id: `${f.id}-marker`,
            position: [lng, lat, height + 0.15],
            radiusM: 0.24,
            color: POLE_COLORS[f.kind],
          })
        }
        break
      }
    }
  }

  return [
    ...busStopAdPanels.map(panel => new BitmapLayer({
      id: `street-fixture-bus-stop-side-ad-${panel.id}`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bounds: panel.bounds as any,
      image: getBusStopAdTexture(),
      pickable: false,
      parameters: { depthTest: true },
    })),
    new PathLayer<Pole>({
      id: 'street-fixture-bus-stop-frames',
      data: busStopPaths,
      getPath: d => [d.from, d.to],
      getColor: d => d.color,
      getWidth: d => d.widthM,
      widthUnits: 'meters',
      widthMinPixels: 1,
      rounded: true,
      pickable: false,
    }),
    new PathLayer<Pole>({
      id: 'street-fixture-poles',
      data: poles,
      getPath: d => [d.from, d.to],
      getColor: d => d.color,
      getWidth: d => d.widthM,
      widthUnits: 'meters',
      widthMinPixels: 1,
      rounded: true,
      pickable: false,
    }),
    new ScatterplotLayer<LampDot>({
      id: 'street-fixture-lamps',
      data: lamps,
      getPosition: d => d.position,
      getRadius: d => d.radiusM,
      radiusUnits: 'meters',
      radiusMinPixels: 2,
      getFillColor: d => d.color,
      filled: true,
      stroked: false,
      pickable: false,
    }),
    new ScatterplotLayer<LampDot>({
      id: 'street-fixture-signal-bulbs',
      data: signalBulbs,
      getPosition: d => d.position,
      getRadius: d => d.radiusM,
      radiusUnits: 'meters',
      radiusMinPixels: 1.5,
      radiusMaxPixels: 6,
      getFillColor: d => d.color,
      filled: true,
      stroked: false,
      pickable: false,
    }),
  ]
}
