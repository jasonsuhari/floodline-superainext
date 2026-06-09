import type { AgentKind } from '@/types'

export type AgentAccessory =
  | 'none'
  | 'backpack'
  | 'briefcase'
  | 'shopping-bag'
  | 'cane'
  | 'child-marker'
  | 'cargo-box'
  | 'helmet'
  | 'hard-hat'
  | 'apron'
  | 'cap'
  | 'glow'
  | 'vehicle-roof'

export interface AgentAttentionProfile {
  mode: string
  dwellBaseSeconds: number
  dwellVarianceTenths: number
  pace: string
  attentionConstraint: string
  attentionBase: number
}

export interface AgentModelDefinition {
  kind: AgentKind
  label: string
  icon: string
  spawnWeight: number
  manualWeight: number
  speed: [number, number]
  map: {
    radius: number
    elevation: number
    color: [number, number, number, number]
    headColor: [number, number, number, number]
    accessory: AgentAccessory
  }
  interview: {
    shirt: number
    pants: number
    skin: number
    scale: number
    hunch: number
    stride: number
    speedMul: number
    accessory: AgentAccessory
  }
  attention: AgentAttentionProfile
}

const FIRST_NAMES = [
  'Mira', 'Diego', 'Aiko', 'Jonas', 'Priya', 'Ravi', 'Sofia', 'Lena',
  'Theo', 'Nadia', 'Omar', 'Yuki', 'Cassie', 'Hugo', 'Ines', 'Marco',
  'Noor', 'Pavel', 'Quinn', 'Rosa', 'Sven', 'Tomi', 'Uma', 'Vito',
  'Wren', 'Xiulan', 'Yael', 'Zane', 'Aria', 'Bodhi', 'Camille', 'Dax',
  'Elif', 'Finn', 'Gia', 'Hari', 'Iris', 'Jude', 'Kira', 'Leo',
  'Maya', 'Niko', 'Otis', 'Petra', 'Quincy', 'Rhea', 'Sami', 'Tova',
]

const LAST_INITIALS = [
  'K.', 'R.', 'S.', 'M.', 'L.', 'B.', 'C.', 'D.',
  'F.', 'G.', 'H.', 'J.', 'N.', 'O.', 'P.', 'T.',
  'V.', 'W.', 'Z.',
]

function hashString(input: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h
}

export function pickAgentName(seed: string): string {
  const h = hashString(seed)
  const first = FIRST_NAMES[h % FIRST_NAMES.length]
  const last = LAST_INITIALS[(h >>> 8) % LAST_INITIALS.length]
  return `${first} ${last}`
}

export const AGENT_MODEL_CATALOG: Record<AgentKind, AgentModelDefinition> = {
  walker: {
    kind: 'walker',
    label: 'Walker',
    icon: '\u{1F6B6}',
    spawnWeight: 20,
    manualWeight: 12,
    speed: [1.0, 1.55],
    map: { radius: 0.55, elevation: 1.15, color: [73, 145, 255, 240], headColor: [248, 224, 188, 250], accessory: 'none' },
    interview: { shirt: 0x4991ff, pants: 0x18181b, skin: 0xffd6ad, scale: 1, hunch: 0, stride: 1, speedMul: 1, accessory: 'none' },
    attention: { mode: 'commuter glance', dwellBaseSeconds: 1.1, dwellVarianceTenths: 10, pace: 'normal walking pace', attentionConstraint: 'phone checks and street clutter compete with the ad', attentionBase: 66 },
  },
  commuter: {
    kind: 'commuter',
    label: 'Commuter',
    icon: '\u{1F687}',
    spawnWeight: 18,
    manualWeight: 10,
    speed: [1.15, 1.75],
    map: { radius: 0.55, elevation: 1.12, color: [240, 192, 32, 245], headColor: [248, 224, 188, 250], accessory: 'backpack' },
    interview: { shirt: 0xf0c020, pants: 0x171717, skin: 0xffd6ad, scale: 1, hunch: 0.02, stride: 1.05, speedMul: 1.08, accessory: 'backpack' },
    attention: { mode: 'commute scan', dwellBaseSeconds: 0.9, dwellVarianceTenths: 8, pace: 'purposeful walking pace', attentionConstraint: 'only a high-contrast headline survives the route-focused scan', attentionBase: 62 },
  },
  'office-worker': {
    kind: 'office-worker',
    label: 'Office Worker',
    icon: '\u{1F4BC}',
    spawnWeight: 12,
    manualWeight: 8,
    speed: [1.0, 1.45],
    map: { radius: 0.56, elevation: 1.18, color: [54, 94, 170, 245], headColor: [248, 224, 188, 250], accessory: 'briefcase' },
    interview: { shirt: 0x365eaa, pants: 0x101217, skin: 0xffd6ad, scale: 1, hunch: 0, stride: 0.96, speedMul: 0.98, accessory: 'briefcase' },
    attention: { mode: 'workday pass', dwellBaseSeconds: 1.0, dwellVarianceTenths: 8, pace: 'steady office commute', attentionConstraint: 'the ad must feel relevant before attention returns to the next task', attentionBase: 64 },
  },
  student: {
    kind: 'student',
    label: 'Student',
    icon: '\u{1F393}',
    spawnWeight: 10,
    manualWeight: 8,
    speed: [0.95, 1.55],
    map: { radius: 0.52, elevation: 1.05, color: [86, 180, 233, 245], headColor: [248, 224, 188, 250], accessory: 'backpack' },
    interview: { shirt: 0x56b4e9, pants: 0x20242c, skin: 0xffd6ad, scale: 0.94, hunch: 0.03, stride: 1.05, speedMul: 1, accessory: 'backpack' },
    attention: { mode: 'social scroll glance', dwellBaseSeconds: 1.2, dwellVarianceTenths: 11, pace: 'variable campus-style pace', attentionConstraint: 'visual novelty must beat phone and peer distractions', attentionBase: 68 },
  },
  shopper: {
    kind: 'shopper',
    label: 'Shopper',
    icon: '\u{1F6CD}\u{FE0F}',
    spawnWeight: 8,
    manualWeight: 8,
    speed: [0.75, 1.15],
    map: { radius: 0.58, elevation: 1.08, color: [235, 95, 40, 245], headColor: [248, 224, 188, 250], accessory: 'shopping-bag' },
    interview: { shirt: 0xeb5f28, pants: 0x2f2f33, skin: 0xffd6ad, scale: 0.98, hunch: 0, stride: 0.82, speedMul: 0.85, accessory: 'shopping-bag' },
    attention: { mode: 'retail browse', dwellBaseSeconds: 1.8, dwellVarianceTenths: 13, pace: 'slow browsing pace', attentionConstraint: 'commercial relevance can hold attention if the offer is instantly clear', attentionBase: 74 },
  },
  tourist: {
    kind: 'tourist',
    label: 'Tourist',
    icon: '\u{1F9F3}',
    spawnWeight: 8,
    manualWeight: 8,
    speed: [0.6, 1.0],
    map: { radius: 0.56, elevation: 1.1, color: [0, 158, 115, 245], headColor: [248, 224, 188, 250], accessory: 'backpack' },
    interview: { shirt: 0x009e73, pants: 0x17201c, skin: 0xffd6ad, scale: 0.98, hunch: 0.01, stride: 0.6, speedMul: 0.7, accessory: 'backpack' },
    attention: { mode: 'wayfinding scan', dwellBaseSeconds: 2.2, dwellVarianceTenths: 12, pace: 'slow exploratory walk', attentionConstraint: 'attention is split between signage, navigation, and the street scene', attentionBase: 78 },
  },
  senior: {
    kind: 'senior',
    label: 'Senior',
    icon: '\u{1F9D3}',
    spawnWeight: 6,
    manualWeight: 7,
    speed: [0.45, 0.9],
    map: { radius: 0.54, elevation: 1.0, color: [208, 32, 32, 245], headColor: [238, 220, 196, 250], accessory: 'cane' },
    interview: { shirt: 0xd02020, pants: 0x202020, skin: 0xeedcc4, scale: 0.9, hunch: -0.26, stride: 0.55, speedMul: 0.62, accessory: 'cane' },
    attention: { mode: 'careful pass', dwellBaseSeconds: 1.9, dwellVarianceTenths: 10, pace: 'slower careful walk', attentionConstraint: 'legibility and uncluttered copy matter more than quick visual tricks', attentionBase: 70 },
  },
  parent: {
    kind: 'parent',
    label: 'Parent',
    icon: '\u{1F9D1}\u{200D}\u{1F9D2}',
    spawnWeight: 5,
    manualWeight: 7,
    speed: [0.65, 1.1],
    map: { radius: 0.58, elevation: 1.12, color: [196, 92, 170, 245], headColor: [248, 224, 188, 250], accessory: 'child-marker' },
    interview: { shirt: 0xc45caa, pants: 0x212028, skin: 0xffd6ad, scale: 1, hunch: 0.02, stride: 0.74, speedMul: 0.82, accessory: 'child-marker' },
    attention: { mode: 'supervised walk', dwellBaseSeconds: 1.0, dwellVarianceTenths: 8, pace: 'stop-start family pace', attentionConstraint: 'attention is fragmented by child supervision and path safety', attentionBase: 58 },
  },
  child: {
    kind: 'child',
    label: 'Child',
    icon: '\u{1F9D2}',
    spawnWeight: 3,
    manualWeight: 5,
    speed: [0.7, 1.25],
    map: { radius: 0.42, elevation: 0.82, color: [255, 150, 80, 245], headColor: [248, 224, 188, 250], accessory: 'none' },
    interview: { shirt: 0xff9650, pants: 0x222222, skin: 0xffd6ad, scale: 0.72, hunch: 0, stride: 0.95, speedMul: 1.1, accessory: 'none' },
    attention: { mode: 'curiosity glance', dwellBaseSeconds: 1.5, dwellVarianceTenths: 10, pace: 'short erratic steps', attentionConstraint: 'bright simple visuals register better than product details', attentionBase: 60 },
  },
  courier: {
    kind: 'courier',
    label: 'Courier',
    icon: '\u{1F4E6}',
    spawnWeight: 6,
    manualWeight: 7,
    speed: [1.35, 2.0],
    map: { radius: 0.56, elevation: 1.12, color: [128, 90, 213, 245], headColor: [248, 224, 188, 250], accessory: 'cargo-box' },
    interview: { shirt: 0x805ad5, pants: 0x18181b, skin: 0xffd6ad, scale: 0.98, hunch: 0.06, stride: 1.2, speedMul: 1.25, accessory: 'cargo-box' },
    attention: { mode: 'delivery pass', dwellBaseSeconds: 0.7, dwellVarianceTenths: 6, pace: 'urgent walking pace', attentionConstraint: 'route pressure leaves time for only the strongest visual cue', attentionBase: 50 },
  },
  'delivery-rider': {
    kind: 'delivery-rider',
    label: 'Delivery Rider',
    icon: '\u{1F6F5}',
    spawnWeight: 5,
    manualWeight: 6,
    speed: [3.5, 5.4],
    map: { radius: 0.72, elevation: 1.05, color: [255, 196, 0, 245], headColor: [248, 224, 188, 250], accessory: 'helmet' },
    interview: { shirt: 0xffc400, pants: 0x141414, skin: 0xffd6ad, scale: 0.96, hunch: 0.38, stride: 1.25, speedMul: 1.55, accessory: 'helmet' },
    attention: { mode: 'rider side glance', dwellBaseSeconds: 0.4, dwellVarianceTenths: 4, pace: 'fast delivery ride', attentionConstraint: 'message must work from peripheral motion with no reread time', attentionBase: 44 },
  },
  runner: {
    kind: 'runner',
    label: 'Runner',
    icon: '\u{1F3C3}',
    spawnWeight: 7,
    manualWeight: 7,
    speed: [2.6, 3.4],
    map: { radius: 0.55, elevation: 1.15, color: [122, 232, 96, 245], headColor: [248, 224, 188, 250], accessory: 'none' },
    interview: { shirt: 0x7ae860, pants: 0x111111, skin: 0xffd6ad, scale: 0.96, hunch: 0.08, stride: 1.4, speedMul: 1.7, accessory: 'none' },
    attention: { mode: 'rush pass', dwellBaseSeconds: 0.7, dwellVarianceTenths: 5, pace: 'fast pedestrian pace', attentionConstraint: 'only the largest visual or headline has time to register', attentionBase: 54 },
  },
  cyclist: {
    kind: 'cyclist',
    label: 'Cyclist',
    icon: '\u{1F6B4}',
    spawnWeight: 7,
    manualWeight: 7,
    speed: [4.0, 6.0],
    map: { radius: 0.7, elevation: 1.1, color: [45, 212, 191, 245], headColor: [248, 224, 188, 250], accessory: 'helmet' },
    interview: { shirt: 0x2dd4bf, pants: 0x111111, skin: 0xffd6ad, scale: 0.96, hunch: 0.45, stride: 1.2, speedMul: 1.55, accessory: 'helmet' },
    attention: { mode: 'peripheral glance', dwellBaseSeconds: 0.4, dwellVarianceTenths: 4, pace: 'cycling past', attentionConstraint: 'message must work from a side glance with almost no reread time', attentionBase: 48 },
  },
  'construction-worker': {
    kind: 'construction-worker',
    label: 'Construction Worker',
    icon: '\u{1F477}',
    spawnWeight: 4,
    manualWeight: 6,
    speed: [0.8, 1.3],
    map: { radius: 0.6, elevation: 1.16, color: [245, 158, 11, 245], headColor: [248, 224, 188, 250], accessory: 'hard-hat' },
    interview: { shirt: 0xf59e0b, pants: 0x2b2b2b, skin: 0xffd6ad, scale: 1.04, hunch: 0.02, stride: 0.9, speedMul: 0.9, accessory: 'hard-hat' },
    attention: { mode: 'worksite scan', dwellBaseSeconds: 0.9, dwellVarianceTenths: 7, pace: 'steady worksite pace', attentionConstraint: 'safety and task awareness compete heavily with ad recall', attentionBase: 52 },
  },
  'service-worker': {
    kind: 'service-worker',
    label: 'Service Worker',
    icon: '\u{1F9D1}\u{200D}\u{1F373}',
    spawnWeight: 5,
    manualWeight: 6,
    speed: [0.9, 1.4],
    map: { radius: 0.55, elevation: 1.08, color: [244, 239, 226, 245], headColor: [248, 224, 188, 250], accessory: 'apron' },
    interview: { shirt: 0xf4efe2, pants: 0x232323, skin: 0xffd6ad, scale: 0.97, hunch: 0.02, stride: 0.92, speedMul: 0.92, accessory: 'apron' },
    attention: { mode: 'between-shifts glance', dwellBaseSeconds: 0.8, dwellVarianceTenths: 7, pace: 'task-focused walking pace', attentionConstraint: 'utility or immediate relevance needs to be visible quickly', attentionBase: 56 },
  },
  'security-guard': {
    kind: 'security-guard',
    label: 'Security Guard',
    icon: '\u{1F482}',
    spawnWeight: 3,
    manualWeight: 5,
    speed: [0.55, 1.0],
    map: { radius: 0.6, elevation: 1.2, color: [36, 48, 70, 245], headColor: [248, 224, 188, 250], accessory: 'cap' },
    interview: { shirt: 0x243046, pants: 0x111827, skin: 0xffd6ad, scale: 1.03, hunch: 0, stride: 0.62, speedMul: 0.7, accessory: 'cap' },
    attention: { mode: 'stationary patrol scan', dwellBaseSeconds: 2.0, dwellVarianceTenths: 10, pace: 'slow patrol pace', attentionConstraint: 'repeated exposure can help, but the first read still needs strong hierarchy', attentionBase: 72 },
  },
  nightlife: {
    kind: 'nightlife',
    label: 'Nightlife',
    icon: '\u{1F306}',
    spawnWeight: 4,
    manualWeight: 6,
    speed: [0.75, 1.25],
    map: { radius: 0.56, elevation: 1.08, color: [217, 194, 255, 245], headColor: [248, 224, 188, 250], accessory: 'glow' },
    interview: { shirt: 0xd9c2ff, pants: 0x151515, skin: 0xffd6ad, scale: 0.98, hunch: 0.01, stride: 0.82, speedMul: 0.85, accessory: 'glow' },
    attention: { mode: 'social outing glance', dwellBaseSeconds: 1.4, dwellVarianceTenths: 12, pace: 'leisure walking pace', attentionConstraint: 'bold color and atmosphere compete with friends and venue signage', attentionBase: 69 },
  },
  car: {
    kind: 'car',
    label: 'Driver',
    icon: '\u{1F697}',
    spawnWeight: 4,
    manualWeight: 0,
    speed: [7.0, 11.0],
    map: { radius: 1.3, elevation: 1.0, color: [220, 50, 50, 245], headColor: [40, 50, 70, 235], accessory: 'vehicle-roof' },
    interview: { shirt: 0xdc3232, pants: 0x111111, skin: 0xffd6ad, scale: 1, hunch: 0, stride: 1, speedMul: 1, accessory: 'vehicle-roof' },
    attention: { mode: 'driver glance', dwellBaseSeconds: 0.5, dwellVarianceTenths: 5, pace: 'moving traffic', attentionConstraint: 'copy must resolve before the driver passes the viewing angle', attentionBase: 38 },
  },
}

export const PEDESTRIAN_AGENT_KINDS = (Object.keys(AGENT_MODEL_CATALOG) as AgentKind[])
  .filter(kind => kind !== 'car')

export function agentKindIcon(kind: AgentKind | undefined): string {
  return kind ? AGENT_MODEL_CATALOG[kind]?.icon ?? AGENT_MODEL_CATALOG.walker.icon : AGENT_MODEL_CATALOG.walker.icon
}

export function agentKindLabel(kind: AgentKind | undefined): string {
  return kind ? AGENT_MODEL_CATALOG[kind]?.label ?? AGENT_MODEL_CATALOG.walker.label : AGENT_MODEL_CATALOG.walker.label
}

export function getAgentModel(kind: AgentKind | undefined): AgentModelDefinition {
  return kind ? AGENT_MODEL_CATALOG[kind] ?? AGENT_MODEL_CATALOG.walker : AGENT_MODEL_CATALOG.walker
}

function weightedPick(items: Array<{ kind: AgentKind; weight: number }>, seed?: string): AgentKind {
  const weighted = items.filter(item => item.weight > 0)
  const total = weighted.reduce((sum, item) => sum + item.weight, 0)
  let roll = seed ? hashString(seed) % total : Math.random() * total
  for (const item of weighted) {
    roll -= item.weight
    if (roll <= 0) return item.kind
  }
  return weighted[weighted.length - 1]?.kind ?? 'walker'
}

export function pickRandomPedestrianKind(seed?: string): AgentKind {
  return weightedPick(
    PEDESTRIAN_AGENT_KINDS.map(kind => ({ kind, weight: AGENT_MODEL_CATALOG[kind].manualWeight })),
    seed,
  )
}

export function pickWeightedAgentKind({
  includeVehicles = true,
  seed,
}: {
  includeVehicles?: boolean
  seed?: string
} = {}): AgentKind {
  return weightedPick(
    (Object.keys(AGENT_MODEL_CATALOG) as AgentKind[])
      .filter(kind => includeVehicles || kind !== 'car')
      .map(kind => ({ kind, weight: AGENT_MODEL_CATALOG[kind].spawnWeight })),
    seed,
  )
}
