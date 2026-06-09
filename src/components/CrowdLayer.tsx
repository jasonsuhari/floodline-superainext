'use client'

/**
 * CrowdLayer — pedestrian rendering is now handled via a deck.gl
 * ScatterplotLayer inside MapCanvas's layers array, which lives in the
 * same rendering stack as all other deck.gl layers (billboards, traffic, etc).
 *
 * This stub is kept so MapCanvas doesn't need import changes.
 */

import type { PedestrianAgent } from '@/types'

interface Props {
  agentSourceRef: React.RefObject<PedestrianAgent[]>
  cursorAgentRef?: React.RefObject<PedestrianAgent[]>
  map: unknown
  maxAgents?: number
  iconMinZoom?: number
  elapsedSeconds?: number
  modelMinZoom?: number
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function CrowdLayer(_props: Props) {
  return null
}
