import type { AgentBehavior, AgentBehaviorState, FloodDepthCell, LatLng, PedestrianAgent, RoadSegment } from '@/types'
import { offsetLatLng } from './spawnAgents'

// --- constants ---

const METERS_PER_LAT_DEGREE = 110540
const METERS_PER_LNG_DEGREE = 111320

// wander steering (Reynolds 1999)
const WANDER_DISTANCE = 2.0      // meters ahead to project the wander circle
const WANDER_RADIUS = 1.4        // radius of the wander circle
const WANDER_JITTER = 55         // max degrees of angle change per second

// turning
const MAX_TURN_RATE = 100        // deg/s
const ANGULAR_DAMPING = 0.82     // how quickly turn rate settles (per-frame blend factor)

// separation (agents avoid overlapping)
const SEPARATION_RADIUS_M = 1.8  // meters — personal space radius
const SEPARATION_FORCE = 2.5     // heading correction strength for separation

// boundary soft zone starts at this fraction of total radius
const BOUNDARY_SOFT_FRACTION = 0.65
const BOUNDARY_TURN_BLEND = 0.9  // strength of boundary steering at the hard edge

// state timers (seconds)
const WALK_MIN = 5
const WALK_MAX = 14
const IDLE_MIN = 1.5
const IDLE_MAX = 4.0

// path-following
const WAYPOINT_REACH_M = 4.0       // distance to "arrive" at a waypoint
const CONNECT_RADIUS_M = 20.0      // max distance between road endpoints to count as connected

// suppress unused import warning — AgentBehaviorState is re-exported for consumers
export type { AgentBehavior, AgentBehaviorState }

// --- helpers ---

function distanceM(a: LatLng, b: LatLng): number {
  const dlat = (b.lat - a.lat) * METERS_PER_LAT_DEGREE
  const dlng = (b.lng - a.lng) * METERS_PER_LNG_DEGREE * Math.cos(a.lat * Math.PI / 180)
  return Math.sqrt(dlat * dlat + dlng * dlng)
}

function bearingBetween(from: LatLng, to: LatLng): number {
  const dlat = (to.lat - from.lat) * METERS_PER_LAT_DEGREE
  const dlng = (to.lng - from.lng) * METERS_PER_LNG_DEGREE * Math.cos(from.lat * Math.PI / 180)
  return ((Math.atan2(dlng, dlat) * 180 / Math.PI) + 360) % 360
}

// signed angle from a to b in [-180, 180]
function angleDiff(a: number, b: number): number {
  return ((b - a + 540) % 360) - 180
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

// --- public API ---

export function createBehavior(agentId: string, waypoints: LatLng[] = [], waypointDir: 1 | -1 = 1): AgentBehavior {
  return {
    agentId,
    state: 'walking',
    angularVel: 0,
    stateTimer: WALK_MIN + Math.random() * (WALK_MAX - WALK_MIN),
    wanderAngle: Math.random() * 360,
    waypoints,
    waypointIdx: waypointDir === 1 ? 0 : Math.max(0, waypoints.length - 1),
    waypointDir,
  }
}

export function createBehaviors(agents: PedestrianAgent[]): AgentBehavior[] {
  return agents.map(a => createBehavior(a.id))
}

function findConnectingRoad(
  endPoint: LatLng,
  roads: RoadSegment[],
  currentWaypoints: LatLng[],
): { waypoints: LatLng[]; startIdx: number; dir: 1 | -1 } | null {
  const candidates: Array<{ road: RoadSegment; fromEnd: boolean }> = []
  for (const road of roads) {
    const first = road.path[0]
    const last = road.path[road.path.length - 1]
    // Skip roads that share the same endpoints as current segment to avoid U-turns
    const curFirst = currentWaypoints[0]
    const curLast = currentWaypoints[currentWaypoints.length - 1]
    if (
      distanceM(first, curFirst) < CONNECT_RADIUS_M &&
      distanceM(last, curLast) < CONNECT_RADIUS_M
    ) continue
    if (distanceM(endPoint, first) < CONNECT_RADIUS_M) {
      candidates.push({ road, fromEnd: false })
    } else if (distanceM(endPoint, last) < CONNECT_RADIUS_M) {
      candidates.push({ road, fromEnd: true })
    }
  }
  if (candidates.length === 0) return null
  const total = candidates.reduce((s, c) => s + c.road.weight, 0)
  let r = Math.random() * total
  for (const c of candidates) {
    r -= c.road.weight
    if (r <= 0) {
      return c.fromEnd
        ? { waypoints: c.road.path, startIdx: c.road.path.length - 1, dir: -1 }
        : { waypoints: c.road.path, startIdx: 0, dir: 1 }
    }
  }
  const last = candidates[candidates.length - 1]
  return last.fromEnd
    ? { waypoints: last.road.path, startIdx: last.road.path.length - 1, dir: -1 }
    : { waypoints: last.road.path, startIdx: 0, dir: 1 }
}

/**
 * Advance all agents by dt seconds. Mutates neither input array; returns new arrays.
 *
 * @param boundaryCenter  optional soft boundary — agents steer back toward center near the edge
 * @param boundaryRadiusM radius of that boundary
 * @param roads           optional road network for intersection transitions
 */
export function tickAgents(
  agents: PedestrianAgent[],
  behaviors: AgentBehavior[],
  dt: number,
  boundaryCenter?: LatLng,
  boundaryRadiusM?: number,
  roads?: RoadSegment[],
  floodCells?: FloodDepthCell[],
): { agents: PedestrianAgent[]; behaviors: AgentBehavior[] } {
  const nextAgents = agents.map(a => ({ ...a }))
  const nextBehaviors = behaviors.map(b => ({ ...b }))

  for (let i = 0; i < nextAgents.length; i++) {
    const agent = nextAgents[i]
    const beh = nextBehaviors[i]
    if (!beh) continue

    // Sample flood depth at this agent's position
    let floodDepthM = 0
    if (floodCells && floodCells.length > 0) {
      for (const cell of floodCells) {
        if (cell.depthM < 0.04) continue
        if (Math.abs(cell.position.lat - agent.position.lat) > 0.00018) continue
        if (Math.abs(cell.position.lng - agent.position.lng) > 0.00025) continue
        const d = distanceM(agent.position, cell.position)
        if (d < 20) floodDepthM = Math.max(floodDepthM, cell.depthM * Math.max(0, (20 - d) / 20))
      }
    }
    agent.floodDepthM = floodDepthM > 0.04 ? floodDepthM : 0

    const floodSpeedFactor = floodDepthM < 0.05 ? 1.0
      : floodDepthM < 0.2 ? 0.72
      : floodDepthM < 0.5 ? 0.38
      : 0.12

    // --- path-following mode ---
    if (beh.waypoints.length >= 2) {
      const target = beh.waypoints[beh.waypointIdx]
      const dist = distanceM(agent.position, target)

      if (dist < WAYPOINT_REACH_M) {
        const nextIdx = beh.waypointIdx + beh.waypointDir
        if (nextIdx >= 0 && nextIdx < beh.waypoints.length) {
          beh.waypointIdx = nextIdx
        } else {
          // Reached end of segment — try to transition to a connecting road
          const endPoint = beh.waypoints[beh.waypointIdx]
          const connected = roads ? findConnectingRoad(endPoint, roads, beh.waypoints) : null
          if (connected) {
            beh.waypoints = connected.waypoints
            beh.waypointIdx = connected.startIdx
            beh.waypointDir = connected.dir
          } else {
            // No connection found — reverse along the same segment
            beh.waypointDir = (beh.waypointDir * -1) as 1 | -1
            beh.waypointIdx = clamp(beh.waypointIdx + beh.waypointDir, 0, beh.waypoints.length - 1)
          }
        }
      }

      let desiredHeading = bearingBetween(agent.position, beh.waypoints[beh.waypointIdx])

      // Separation: nudge heading away from nearby agents so path-followers
      // don't stack on the road centerline. Bounded so they stay close to the path.
      let nudge = 0
      let speedScale = 1
      for (let j = 0; j < nextAgents.length; j++) {
        if (j === i) continue
        const other = nextAgents[j]
        const d = distanceM(agent.position, other.position)
        if (d < SEPARATION_RADIUS_M && d > 0.01) {
          const away = bearingBetween(other.position, agent.position)
          const urgency = (SEPARATION_RADIUS_M - d) / SEPARATION_RADIUS_M
          nudge += angleDiff(desiredHeading, away) * urgency
          // slow down when crowded so trailing agents don't tailgate-collide
          speedScale = Math.min(speedScale, 1 - urgency * 0.55)
        }
      }
      desiredHeading += clamp(nudge, -55, 55)

      const headingError = angleDiff(agent.heading, desiredHeading)
      const angularForce = clamp(headingError * 4.0, -MAX_TURN_RATE, MAX_TURN_RATE)
      beh.angularVel = beh.angularVel * ANGULAR_DAMPING + angularForce * (1 - ANGULAR_DAMPING)
      beh.angularVel = clamp(beh.angularVel, -MAX_TURN_RATE, MAX_TURN_RATE)
      agent.heading = ((agent.heading + beh.angularVel * dt) + 360) % 360
      const moveRad = agent.heading * Math.PI / 180
      const speed = agent.speedMps * Math.max(0.25, speedScale) * floodSpeedFactor
      agent.position = offsetLatLng(
        agent.position,
        Math.sin(moveRad) * speed * dt,
        Math.cos(moveRad) * speed * dt,
      )
      continue
    }

    // --- free wander mode (no road assigned) ---

    beh.stateTimer -= dt

    // idle state: stand still, then pick a new heading and resume
    if (beh.state === 'idle') {
      if (beh.stateTimer <= 0) {
        beh.state = 'walking'
        beh.stateTimer = WALK_MIN + Math.random() * (WALK_MAX - WALK_MIN)
        agent.heading = (agent.heading + (Math.random() - 0.5) * 160 + 360) % 360
      }
      continue
    }

    if (beh.stateTimer <= 0) {
      beh.state = 'idle'
      beh.stateTimer = IDLE_MIN + Math.random() * (IDLE_MAX - IDLE_MIN)
      beh.angularVel = 0
      continue
    }

    // Reynolds wander: jitter the angle on a circle projected ahead of the agent
    beh.wanderAngle += (Math.random() - 0.5) * WANDER_JITTER * dt

    const headingRad = agent.heading * Math.PI / 180
    const wanderRad = (agent.heading + beh.wanderAngle) * Math.PI / 180

    const targetEast = Math.sin(headingRad) * WANDER_DISTANCE + Math.sin(wanderRad) * WANDER_RADIUS
    const targetNorth = Math.cos(headingRad) * WANDER_DISTANCE + Math.cos(wanderRad) * WANDER_RADIUS
    let desiredHeading = ((Math.atan2(targetEast, targetNorth) * 180 / Math.PI) + 360) % 360

    // boundary repulsion: steer back toward center when approaching the edge
    if (boundaryCenter && boundaryRadiusM) {
      const d = distanceM(agent.position, boundaryCenter)
      const softEdge = boundaryRadiusM * BOUNDARY_SOFT_FRACTION
      if (d > softEdge) {
        const toCenter = bearingBetween(agent.position, boundaryCenter)
        const blend = clamp((d - softEdge) / (boundaryRadiusM - softEdge), 0, 1)
        desiredHeading += angleDiff(desiredHeading, toCenter) * blend * BOUNDARY_TURN_BLEND
      }
    }

    // separation: steer away from agents inside personal-space radius
    for (let j = 0; j < nextAgents.length; j++) {
      if (j === i) continue
      const other = nextAgents[j]
      const d = distanceM(agent.position, other.position)
      if (d < SEPARATION_RADIUS_M && d > 0.01) {
        const away = bearingBetween(other.position, agent.position)
        const urgency = (SEPARATION_RADIUS_M - d) / SEPARATION_RADIUS_M
        desiredHeading += angleDiff(desiredHeading, away) * urgency * SEPARATION_FORCE
      }
    }

    // angular spring: smoothly steer toward desiredHeading
    const headingError = angleDiff(agent.heading, desiredHeading)
    const angularForce = clamp(headingError * 3.0, -MAX_TURN_RATE, MAX_TURN_RATE)
    beh.angularVel = beh.angularVel * ANGULAR_DAMPING + angularForce * (1 - ANGULAR_DAMPING)
    beh.angularVel = clamp(beh.angularVel, -MAX_TURN_RATE, MAX_TURN_RATE)

    agent.heading = ((agent.heading + beh.angularVel * dt) + 360) % 360

    // move forward
    const moveRad = agent.heading * Math.PI / 180
    agent.position = offsetLatLng(
      agent.position,
      Math.sin(moveRad) * agent.speedMps * floodSpeedFactor * dt,
      Math.cos(moveRad) * agent.speedMps * floodSpeedFactor * dt,
    )
  }

  return { agents: nextAgents, behaviors: nextBehaviors }
}
