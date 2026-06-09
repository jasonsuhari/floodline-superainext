import type { AgencyDemoRun, LatLng } from '@/types'

interface CreateAgencyDemoRunInput {
  area: LatLng
  brief?: string
}

function areaSeed(area: LatLng): string {
  return `${Math.abs(Math.round(area.lat * 10000))}${Math.abs(Math.round(area.lng * 10000))}`
}

export function createAgencyDemoRun({ area, brief = '' }: CreateAgencyDemoRunInput): AgencyDemoRun {
  const seed = areaSeed(area)

  return {
    sessionId: `session-${seed.slice(0, 6)}`,
    agentId: `agent-ooh-${seed.slice(-5)}`,
    area,
    brief,
    events: [
      {
        id: 'evt_brief',
        phase: 'Discovery',
        actor: 'Faultline App',
        title: 'Campaign brief parsed',
        detail: 'Audience, budget, timeline, and geography were extracted from the client brief.',
        status: 'complete',
        delayMs: 350,
        toolName: 'brief_parser',
      },
      {
        id: 'evt_inventory',
        phase: 'Inventory',
        actor: 'Managed Tool',
        title: 'Nearby OOH inventory scanned',
        detail: 'Candidate billboard and street-level media locations were generated around the selected area.',
        status: 'complete',
        delayMs: 600,
        toolName: 'inventory_search',
      },
      {
        id: 'evt_faultline',
        phase: 'Simulation',
        actor: 'Faultline App',
        title: 'Faultline context evaluated',
        detail: 'Buildings, terrain, roads, and mapped greenery were checked for likely visibility constraints.',
        status: 'complete',
        delayMs: 700,
        toolName: 'faultline_simulation',
      },
      {
        id: 'evt_inquiry_approval',
        phase: 'Approval',
        actor: 'OpenAI Agent',
        title: 'Vendor inquiry requires approval',
        detail: 'The agent prepared a vendor inquiry packet and paused before contacting media owners.',
        status: 'needs-approval',
        delayMs: 650,
      },
      {
        id: 'evt_proposal',
        phase: 'Proposal',
        actor: 'OpenAI Agent',
        title: 'Client-ready recommendation generated',
        detail: 'The top-ranked sites were packaged into a budget-aware launch recommendation.',
        status: 'complete',
        delayMs: 600,
        toolName: 'proposal_writer',
      },
    ],
    candidates: [
      {
        id: 'cand-premium-junction',
        name: 'Premium junction digital panel',
        format: 'Large-format DOOH near commuter and ride-hail traffic',
        faultlineScore: 91,
        monthlyEstimate: 'SGD 8.4k',
        estimatedWeeklyReach: 142000,
      },
      {
        id: 'cand-transit-shelter',
        name: 'Transit shelter network',
        format: 'Street furniture package with repeated pedestrian exposure',
        faultlineScore: 84,
        monthlyEstimate: 'SGD 5.8k',
        estimatedWeeklyReach: 97000,
      },
      {
        id: 'cand-mall-approach',
        name: 'Mall approach static billboard',
        format: 'Static roadside face near retail and office ingress',
        faultlineScore: 78,
        monthlyEstimate: 'SGD 4.9k',
        estimatedWeeklyReach: 76000,
      },
    ],
    proposal: {
      recommendation: 'Prioritize the premium junction panel, then use the transit shelter network to extend frequency across pedestrian routes.',
      budgetPlan: 'Allocate SGD 14.2k to media, SGD 3.1k to creative adaptation, and keep SGD 2.7k for vendor hold fees and contingency.',
      nextActions: [
        'Confirm media-owner availability for the top two sites.',
        'Request latest proof-of-play and illumination photos.',
        'Run final obstruction validation before insertion order approval.',
      ],
    },
  }
}
