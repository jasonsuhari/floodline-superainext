import { PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import type { LatLng, PedestrianAgent, WalkFrame } from '@/types'

interface AgentPath {
  id: string
  path: [number, number, number][]
  color: [number, number, number, number]
  width: number
}

interface AgentPoint {
  id: string
  position: [number, number, number]
  color: [number, number, number, number]
  radius: number
}

interface AgentLabel {
  id: string
  name: string
  position: [number, number, number]
}

const METERS_PER_LAT_DEGREE = 110540
const METERS_PER_LNG_DEGREE = 111320
const LOOP_LENGTH_M = 14

const SKIN: [number, number, number, number] = [255, 20, 147, 255]
const SHIRT: [number, number, number, number] = [48, 145, 255, 255]
const PANTS: [number, number, number, number] = [5, 5, 5, 255]
const SHADOW: [number, number, number, number] = [8, 12, 18, 105]

function offsetLatLng(origin: LatLng, eastM: number, northM: number): LatLng {
  const lngScale = METERS_PER_LNG_DEGREE * Math.cos(origin.lat * Math.PI / 180)
  return {
    lat: origin.lat + northM / METERS_PER_LAT_DEGREE,
    lng: origin.lng + eastM / lngScale,
  }
}

function bearingVector(degrees: number) {
  const radians = degrees * Math.PI / 180
  return {
    east: Math.sin(radians),
    north: Math.cos(radians),
  }
}

function getLoopOffset(agent: PedestrianAgent, elapsedSeconds: number) {
  return ((elapsedSeconds * agent.speedMps + agent.phaseOffsetM) % LOOP_LENGTH_M) - LOOP_LENGTH_M / 2
}

function makeLocalProjector(agent: PedestrianAgent, elapsedSeconds: number, bobM: number) {
  const forward = bearingVector(agent.heading)
  const right = bearingVector(agent.heading + 90)
  const loopOffset = getLoopOffset(agent, elapsedSeconds)

  return (rightM: number, forwardM: number, upM: number): [number, number, number] => {
    const east = right.east * rightM + forward.east * (forwardM + loopOffset)
    const north = right.north * rightM + forward.north * (forwardM + loopOffset)
    const point = offsetLatLng(agent.position, east, north)
    return [point.lng, point.lat, upM + bobM]
  }
}

function buildAgentGeometry(agent: PedestrianAgent, frame: WalkFrame, elapsedSeconds: number) {
  const bobM = Math.max(0, frame.root[1] * 0.96)
  const project = makeLocalProjector(agent, elapsedSeconds, bobM)
  const bodyLean = frame.bodyTilt * 0.24
  const headLean = frame.headTilt * 0.15

  const pelvis = project(0, 0, 8.5)
  const chest = project(0, bodyLean, 16.0)
  const head = project(0, bodyLean + headLean, 20.0)

  const leftShoulder = project(-3.4, bodyLean, 15.6)
  const rightShoulder = project(3.4, bodyLean, 15.6)
  const leftHand = project(-4.1, Math.sin(frame.leftArm) * 4.5, 9.2)
  const rightHand = project(4.1, Math.sin(frame.rightArm) * 4.5, 9.2)

  const leftHip = project(-1.9, 0, 8.5)
  const rightHip = project(1.9, 0, 8.5)
  const leftFoot = project(-2.1, Math.sin(frame.leftLeg) * 5.5, 0.5)
  const rightFoot = project(2.1, Math.sin(frame.rightLeg) * 5.5, 0.5)
  const ground = project(0, 0, 0.25)
  const label = project(0, 0, 25.0)

  const paths: AgentPath[] = [
    { id: `${agent.id}-torso`, path: [pelvis, chest], color: SHIRT, width: 4.8 },
    { id: `${agent.id}-left-arm`, path: [leftShoulder, leftHand], color: SHIRT, width: 1.6 },
    { id: `${agent.id}-right-arm`, path: [rightShoulder, rightHand], color: SHIRT, width: 1.6 },
    { id: `${agent.id}-left-leg`, path: [leftHip, leftFoot], color: PANTS, width: 1.9 },
    { id: `${agent.id}-right-leg`, path: [rightHip, rightFoot], color: PANTS, width: 1.9 },
  ]

  const points: AgentPoint[] = [
    { id: `${agent.id}-shadow`, position: ground, color: SHADOW, radius: 8 },
    { id: `${agent.id}-head`, position: head, color: SKIN, radius: 4 },
    { id: `${agent.id}-left-foot`, position: leftFoot, color: PANTS, radius: 2 },
    { id: `${agent.id}-right-foot`, position: rightFoot, color: PANTS, radius: 2 },
  ]

  const labels: AgentLabel[] = [{
    id: `${agent.id}-label`,
    name: agent.name,
    position: label,
  }]

  return { paths, points, labels }
}

export function makePedestrianAgentLayers(
  agents: PedestrianAgent[],
  frame: WalkFrame | null,
  elapsedSeconds: number,
) {
  if (!frame || agents.length === 0) return []

  const geometry = agents.map(agent => buildAgentGeometry(agent, frame, elapsedSeconds))
  const paths = geometry.flatMap(item => item.paths)
  const points = geometry.flatMap(item => item.points)
  const labels = geometry.flatMap(item => item.labels)

  return [
    new ScatterplotLayer<AgentPoint>({
      id: 'pedestrian-agent-points',
      data: points,
      getPosition: point => point.position,
      getRadius: point => point.radius,
      radiusUnits: 'meters',
      radiusMinPixels: 3,
      radiusMaxPixels: 18,
      getFillColor: point => point.color,
      getLineColor: [255, 255, 255, 160],
      lineWidthMinPixels: 1,
      stroked: true,
      filled: true,
      pickable: false,
    }),
    new PathLayer<AgentPath>({
      id: 'pedestrian-agent-body',
      data: paths,
      getPath: path => path.path,
      getColor: path => path.color,
      getWidth: path => path.width,
      widthUnits: 'meters',
      widthMinPixels: 2,
      rounded: false,
      pickable: false,
    }),
    new TextLayer<AgentLabel>({
      id: 'pedestrian-agent-labels',
      data: labels,
      getPosition: label => label.position,
      getText: label => label.name,
      getColor: [245, 250, 255, 235],
      getSize: 10,
      sizeUnits: 'pixels',
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'bottom',
      background: true,
      getBackgroundColor: [9, 12, 18, 210],
      backgroundPadding: [5, 3],
      pickable: false,
    }),
  ]
}
