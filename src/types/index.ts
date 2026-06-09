export interface LatLng {
  lat: number
  lng: number
}

export type CityDataSource =
  | 'mapbox'
  | 'overpass'
  | 'overture'
  | 'lta'
  | 'open-meteo'
  | 'inferred'

export interface CityDataAttribution {
  source: CityDataSource
  label: string
  url?: string
}

export interface Building {
  id: string
  footprint: LatLng[]
  centroid: LatLng
  groundElevation: number
  heightM: number
  baseHeightM: number
  levels?: number
  facadeColor?: string
  roofColor?: string
  material?: string
  roofMaterial?: string
  poiCategory?: BuildingPoiCategory
  poiName?: string
  poiTags?: Record<string, string>
  sourceTags?: Record<string, string>
  status?: 'flooded' | 'at-risk' | 'safe'
  source?: CityDataSource
  confidence?: number
}

export type BuildingPoiCategory =
  | 'restaurant'
  | 'cafe'
  | 'bar'
  | 'retail'
  | 'grocery'
  | 'hotel'
  | 'office'
  | 'school'
  | 'medical'
  | 'transit'
  | 'parking'
  | 'entertainment'
  | 'worship'
  | 'residential'
  | 'industrial'

export type VegetationKind = 'tree' | 'tree-row' | 'wood' | 'park' | 'scrub' | 'grass' | 'garden'

export type StreetFixtureKind =
  | 'traffic-signal'
  | 'crossing'
  | 'bus-stop'
  | 'street-lamp'
  | 'bench'
  | 'bicycle-parking'
  | 'bollard'
  | 'waste-bin'
  | 'atm'
  | 'subway-entrance'
  | 'taxi-stand'
  | 'charging-station'
  | 'fountain'
  | 'pumping-station'
  | 'drain-grate'

export interface StreetFixture {
  id: string
  kind: StreetFixtureKind
  position: LatLng
  name?: string
  tags?: Record<string, string>
  source?: CityDataSource
  confidence?: number
}

export interface VegetationFeature {
  id: string
  kind: VegetationKind
  geometry: 'point' | 'line' | 'polygon'
  points: LatLng[]
  source?: CityDataSource
  confidence?: number
}

export interface WaterBody {
  id: string
  kind: 'water' | 'waterway' | 'coastline'
  geometry: 'line' | 'polygon'
  points: LatLng[]
  source?: CityDataSource
  confidence?: number
  tags?: Record<string, string>
}

export type BillboardFormat = 'digital' | 'static' | 'poster' | 'wallscape'
export type BillboardMaterial = 'digital-day' | 'digital-night' | 'printed-vinyl'

export interface BillboardPlacement {
  id: string
  name: string
  position: LatLng
  widthM: number
  heightM: number
  clearanceM: number
  heading: number
  format: BillboardFormat
  material: BillboardMaterial
  creativeText: string
  primaryColor: string
  secondaryColor: string
  brightness: number
  weeklyReach: number
  mediaUrl?: string
}

export interface AgentCapture {
  id: string
  agentName: string
  agentKind?: AgentKind
  billboardName: string
  imageUrl: string
  streetViewEmbedUrl?: string
  /** Mapbox static fallback used when Street View has no panorama nearby. */
  fallbackImageUrl?: string
  billboardOverlay?: {
    mediaUrl?: string
    creativeText: string
    primaryColor: string
    secondaryColor: string
    x: number
    y: number
    width: number
    height: number
    rotate: number
    skew: number
  }
  thought: string | null
  qualitativeInsight?: AgentQualitativeInsight
  timestamp: number
  /** Photorealistic composite image (data URL) produced by the photoreal-scene pipeline */
  photorealImageUrl?: string
  /** Scene-response analysis result from the photoreal composite */
  photorealAnalysis?: SceneResponseApiResponse
  /** Whether the photoreal render + analysis is currently in progress */
  photorealPending?: boolean
  /** Error message if the photoreal render failed */
  photorealError?: string
}

export type AgentInsightEvidenceTag = 'direct_quote' | 'simulated_dwell' | 'repeated_pattern' | 'creative_diagnosis'

export type AgentInsightFailureMode =
  | 'low_noticeability'
  | 'slow_read'
  | 'weak_branding'
  | 'unclear_offer'
  | 'missed_cta'
  | 'poor_relevance'
  | 'environment_clutter'
  | 'format_mismatch'

export interface AgentAttentionContext {
  mode: string
  dwellSeconds: number
  pace: string
  attentionConstraint: string
}

export interface AgentQualitativeInsight {
  quote: string
  firstNoticed: string
  remembered: string
  missed: string
  whyItMatters: string
  creativeFix: string
  failureMode: AgentInsightFailureMode
  evidenceTag: AgentInsightEvidenceTag
  context: AgentAttentionContext
}

export type OohMediaTypeCode = 'bb' | 'bs' | 'db' | 'ds' | 'mu' | 'sf' | 'tr' | string

export type OohMapPointTuple = [
  id: string,
  lng: number,
  lat: number,
  mediaTypeCode: OohMediaTypeCode,
  priceAmount: number,
  weeklyImpressions: number,
  visibilityScore: number,
  sourceUrlIndex: number,
]

export interface OohMapPoint {
  id: string
  position: LatLng
  mediaTypeCode: OohMediaTypeCode
  mediaTypeLabel: string
  priceAmount: number
  weeklyImpressions: number
  visibilityScore: number
  sourceUrlIndex: number
}

export interface OohMapApiResponse {
  metadata: {
    built_at: string
    total_points: number
    returned_points: number
    schema: string
    media_type_codes: Record<string, string>
    bbox: {
      west: number
      south: number
      east: number
      north: number
    } | null
    limited: boolean
  }
  source_urls?: string[]
  points: OohMapPointTuple[]
}

export interface WalkFrame {
  time: number
  root: [number, number, number]
  yaw: number
  bodyTilt: number
  headTilt: number
  leftArm: number
  rightArm: number
  leftLeg: number
  rightLeg: number
}

export interface WalkClip {
  source: string
  fps: number
  durationSeconds: number
  frames: WalkFrame[]
}

export type AgentKind =
  | 'walker'
  | 'commuter'
  | 'office-worker'
  | 'student'
  | 'shopper'
  | 'tourist'
  | 'senior'
  | 'parent'
  | 'child'
  | 'courier'
  | 'delivery-rider'
  | 'runner'
  | 'cyclist'
  | 'construction-worker'
  | 'service-worker'
  | 'security-guard'
  | 'nightlife'
  | 'car'

export interface PedestrianAgent {
  id: string
  name: string
  position: LatLng
  heading: number
  speedMps: number
  phaseOffsetM: number
  visual?: 'walker' | 'car'
  kind?: AgentKind
  floodDepthM?: number
}

export type AgentBehaviorState = 'walking' | 'idle'

export interface AgentBehavior {
  agentId: string
  state: AgentBehaviorState
  angularVel: number
  stateTimer: number
  wanderAngle: number
  waypoints: LatLng[]
  waypointIdx: number
  waypointDir: 1 | -1
}

export interface TrafficPoint {
  id: string
  position: LatLng
  weight: number
  category: BuildingPoiCategory | 'transit-hub'
  source?: CityDataSource
  confidence?: number
  label?: string
}

export interface CityPlace {
  id: string
  position: LatLng
  category: BuildingPoiCategory
  name?: string
  tags?: Record<string, string>
  source: CityDataSource
  confidence: number
}

export interface TransitNode {
  id: string
  position: LatLng
  kind: 'bus' | 'rail' | 'subway' | 'tram' | 'ferry' | 'taxi' | 'other'
  name?: string
  source: CityDataSource
  confidence: number
}

export interface CityWeatherContext {
  source: 'open-meteo'
  fetchedAt: string
  temperatureC?: number
  precipitationMm?: number
  cloudCoverPct?: number
  windSpeedKmh?: number
  weatherCode?: number
  isDay?: boolean
  lighting: 'day' | 'dusk' | 'night' | 'rain'
  footfallMultiplier: number
  summary: string
}

export type FloodScenarioPhase = 'idle' | 'running' | 'complete'

export type FloodInterventionKind =
  | 'flood-barrier'
  | 'retention-pond'
  | 'green-corridor'
  | 'elevated-road'
  | 'shelter-node'
  | 'protected-route'

export interface FloodDepthCell {
  id: string
  position: LatLng
  depthM: number
  arrivalMinute: number
  velocityMps: number
}

export interface BuildingOccupancy {
  buildingId: string
  buildingName: string
  category: BuildingPoiCategory | 'unknown'
  position: LatLng
  floors: number
  estimatedOccupants: number
  exposedOccupants: number
  vulnerableOccupants: number
  confidence: 'low' | 'medium' | 'high'
  depthM: number
  damageRatio: number
}

export interface IndoorAgent {
  id: string
  name: string
  originBuildingId: string
  originBuildingName: string
  position: LatLng
  destination: LatLng
  persona: {
    role: string
    riskTolerance: number
    evacuationDelayMin: number
    mobility: 'limited' | 'steady' | 'fast'
    summary: string
  }
  status: 'shelter-in-place' | 'evacuating' | 'delayed' | 'safe'
}

export interface FloodImpactSummary {
  affectedPeople: number
  exposedIndoorPeople: number
  vulnerablePeople: number
  affectedBuildings: number
  severeBuildings: number
  roadsDisrupted: number
  estimatedDamageUsd: number
  mobilityLossPct: number
  resilienceScore: number
}

export interface FloodPriorityZone {
  id: string
  position: LatLng
  label: string
  severity: number
  reason: string
  recommendedIntervention: FloodInterventionKind
}

export interface PlannerIntervention {
  id: string
  kind: FloodInterventionKind
  position: LatLng
  label: string
  radiusM: number
  effectiveness: number
  angle: number  // wall/corridor orientation in radians (0 = east-west wall, π/2 = north-south wall)
}

export interface FloodScenarioResult {
  phase: FloodScenarioPhase
  elapsedMinute: number
  cells: FloodDepthCell[]
  improvedCells: FloodDepthCell[]
  occupancy: BuildingOccupancy[]
  indoorAgents: IndoorAgent[]
  priorityZones: FloodPriorityZone[]
  interventions: PlannerIntervention[]
  summary: FloodImpactSummary
  improvedSummary: FloodImpactSummary | null
}

export type FloodReportSource = 'pub-risk-area' | 'synthetic-live-report'

export interface FloodReport {
  id: string
  title: string
  locationName: string
  position: LatLng
  severity: 1 | 2 | 3 | 4 | 5
  confidence: number
  source: FloodReportSource
  timestamp: string
  summary: string
  outletName?: string
  reporterName?: string
  articleBody?: string
  reportUrl?: string
}

export type SingaporeOohType =
  | 'billboard'
  | 'bus-shelter'
  | 'bus-stop'
  | 'mrt-station'
  | 'lrt-station'
  | 'transit-ad'
  | 'column'
  | 'screen'
  | 'other'

export interface SingaporeOohAsset {
  id: string
  position: LatLng
  type: SingaporeOohType
  name?: string
  operator?: string
  source: 'osm' | 'lta'
  tags?: Record<string, string>
}

export type RoadKind = 'footway' | 'path' | 'pedestrian' | 'residential' | 'secondary' | 'primary' | 'other'

export interface RoadSegment {
  id: string
  path: LatLng[]
  kind: RoadKind
  weight: number
  source?: CityDataSource
  confidence?: number
  label?: string
}

export interface CityEnrichmentResponse {
  metadata: {
    center: LatLng
    radiusKm: number
    mode: 'auto' | 'overture' | 'overpass'
    generatedAt: string
    attributions: CityDataAttribution[]
    errors?: string[]
  }
  buildings: Building[]
  roads: RoadSegment[]
  places: CityPlace[]
  streetFixtures: StreetFixture[]
  vegetation: VegetationFeature[]
  waterBodies: WaterBody[]
  trafficPoints: TrafficPoint[]
  transitNodes: TransitNode[]
  weather: CityWeatherContext | null
}

export type AgencyDemoEventStatus = 'queued' | 'running' | 'complete' | 'needs-approval' | 'error'

export interface AgencyDemoEvent {
  id: string
  phase: string
  actor: string
  title: string
  detail: string
  status: AgencyDemoEventStatus
  delayMs: number
  toolName?: string
}

export interface AgencyDemoCandidate {
  id: string
  name: string
  format: string
  faultlineScore: number
  monthlyEstimate: string
  estimatedWeeklyReach: number
}

export interface AgencyDemoProposal {
  recommendation: string
  budgetPlan: string
  nextActions: string[]
}

export interface AgencyDemoRun {
  sessionId: string
  agentId: string
  area: LatLng
  brief: string
  events: AgencyDemoEvent[]
  candidates: AgencyDemoCandidate[]
  proposal: AgencyDemoProposal
}

export type ManagedAgentEventStatus = 'queued' | 'running' | 'complete' | 'needs-approval' | 'error'

export interface ManagedAgentResources {
  agentId: string
  environmentId: string
}

export interface ManagedAgentDisplayEvent {
  id: string
  type: string
  actor: 'AI Agent' | 'Faultline App' | 'Managed Tool' | 'Session'
  title: string
  detail: string
  status: ManagedAgentEventStatus
  toolName?: string
  processedAt?: string | null
}

export interface ManagedAgencySession {
  mode: 'openai-managed-agents'
  sessionId: string
  agentId: string
  environmentId: string
  status: string
  area: LatLng
  brief: string
}

export interface ManagedAgencyEventsResponse {
  sessionId: string
  status: string
  events: ManagedAgentDisplayEvent[]
  rawEventCount: number
}

export interface PedestrianInterviewLine {
  role: 'interviewer' | 'pedestrian'
  text: string
}

export type PedestrianInterviewStatus = 'starting' | 'running' | 'idle' | 'error'

export interface PedestrianInterviewSession {
  sessionId: string
  sightingKey: string
  agentName: string
  billboardName: string
  startedAt: number
  status: PedestrianInterviewStatus
  transcript: PedestrianInterviewLine[]
  score?: number
  feedback?: string
  error?: string
}

export interface SceneImagePayload {
  dataUrl: string
}

export interface CapturedSceneImage {
  dataUrl: string
  capturedAt: string
}

export interface SceneResponseRequest {
  sceneImage: SceneImagePayload
  adImage?: SceneImagePayload | null
  brief?: string
  viewerProfile?: string
}

export interface SceneResponseResult {
  sceneDescription: string
  adDescription: string
  firstImpression: string
  likelyAttention: string
  likelyConfusion: string
  simpleRecommendation: string
}

export interface SceneResponseBudget {
  limitUsd: number
  spentUsd: number
  estimatedCostUsd: number
  remainingUsd: number
  inputTokens?: number
  outputTokens?: number
}

export interface SceneResponseApiResponse {
  result: SceneResponseResult
  budget: SceneResponseBudget
  model: string
}

export type CreativeFailureCategory =
  | 'low_contrast'
  | 'too_much_copy'
  | 'brand_not_registered'
  | 'cta_not_visible'
  | 'bad_fast_read'
  | 'environment_clutter'
  | 'format_mismatch'
  | 'weak_context_fit'

export interface CreativeOptimizationPlacement {
  id?: string
  name: string
  mediaType: string
  priceEstimate?: string
  weeklyImpressions?: number
}

export interface CreativeOptimizationRequest {
  sceneImage: SceneImagePayload
  adImage: SceneImagePayload
  brief: string
  viewerProfile?: string
  placement?: CreativeOptimizationPlacement
}

export interface CreativeOptimizationMetrics {
  noticeability: number
  fastRead: number
  brandRecall: number
  ctaVisibility: number
}

export interface CreativeOptimizationResult {
  failureCategory: CreativeFailureCategory
  diagnosis: string
  fixStrategy: string
  fixedCreativeUrl: string
  revisedPrompt: string
  beforeMetrics: CreativeOptimizationMetrics
  afterMetrics: CreativeOptimizationMetrics
  purchaseRecommendation: string
  model: string
}

export interface CreativeOptimizationApiResponse {
  result: CreativeOptimizationResult
}

export interface MediaCartItem {
  id: string
  placementName: string
  mediaType: string
  priceEstimate: string
  campaignDates: string
  originalCreativeUrl: string
  fixedCreativeUrl: string
  rationale: string
  expectedWeeklyImpressions: number
}

// ── Photoreal scene pipeline ─────────────────────────────────────────────────

export interface PhotorealBillboardMeta {
  name: string
  widthM: number
  heightM: number
  clearanceM?: number
  heading?: number
  distanceM?: number
  creativeText?: string
  /** Pre-resolved base64 data URL for the billboard creative */
  creativeDataUrl?: string
  /** Remote URL for the billboard creative (will be fetched server-side) */
  mediaUrl?: string
}

export interface PhotorealEnvironmentContext {
  viewerPosition?: LatLng
  billboardPosition?: LatLng
  capturedAt?: string
  weatherSummary?: string
  lightingSummary?: string
}

export interface PhotorealSceneRequest {
  /** Street-view capture as a base64 data URL */
  sceneImage: SceneImagePayload
  billboard: PhotorealBillboardMeta
  environment?: PhotorealEnvironmentContext
  brief?: string
  viewerProfile?: string
  saveToAgentScreenshots?: boolean
  captureId?: string
}

export interface PhotorealSceneApiResponse {
  /** Photorealistic composite image as a base64 data URL */
  photorealImageUrl: string
  /** Full scene-response analysis of the composite */
  analysis: SceneResponseApiResponse
  /** Public URL under /agent_screenshots when saved by the server */
  savedImageUrl?: string
  /** Repo-relative path under public/ when saved by the server */
  savedImagePath?: string
}

export interface MockCheckoutRequest {
  item: MediaCartItem
}

export interface MockCheckoutResponse {
  confirmationId: string
  status: 'confirmed'
  inquiryPacket: string
  nextSteps: string[]
}

export interface CompanyBriefIdentity {
  companyName: string
  industry: string
  description: string
  brandAdjectives: [string, string, string]
  tagline?: string
}

export interface CompanyBriefVisualSystem {
  primaryColor?: string
  secondaryColor?: string
  logoUrl?: string
  fonts?: string[]
  styleReference?: string
  avoidList?: string[]
}

export interface CompanyBriefCampaign {
  coreMessage: string
  offerOrHook?: string
  callToAction?: string
  campaignObjective?: string
}

export interface CompanyBriefAudience {
  description: string
  tone?: string
  contextWhenSeen?: string
}

export interface CompanyBrief {
  url: string
  identity: CompanyBriefIdentity
  visualSystem: CompanyBriefVisualSystem
  campaign: CompanyBriefCampaign
  audience: CompanyBriefAudience
}
