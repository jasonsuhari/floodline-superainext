import React from 'react'
import {
  Circle,
  Document,
  Image,
  Line,
  Page,
  Path,
  Polyline,
  Rect,
  StyleSheet,
  Svg,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer'
import type {
  FloodImpactSummary,
  FloodInterventionKind,
  FloodPriorityZone,
  FloodScenarioResult,
  LatLng,
  PlannerIntervention,
} from '@/types'

export interface CityPlanPdfMeasure {
  id: string
  kind: FloodInterventionKind
  label: string
  position: LatLng
  radiusM: number
  effectiveness: number
  rationale?: string
  streetViewImageUrl?: string
  outsideNominalZone?: boolean
}

export interface CityPlanPdfZone {
  id: string
  name: string
  position: LatLng
  radiusM?: number
  severity?: number
  reason?: string
  mapImageUrl?: string
  measures: CityPlanPdfMeasure[]
}

export interface CityPlanPdfRequest {
  title?: string
  districtName?: string
  preparedFor?: string
  preparedBy?: string
  generatedAt?: string
  scenarioLabel?: string
  areaCenter: LatLng
  radiusKm: number
  scenario?: FloodScenarioResult
  summary?: {
    baseline: FloodImpactSummary
    replanned?: FloodImpactSummary | null
  }
  zones?: CityPlanPdfZone[]
  notes?: string[]
}

const C = {
  ink: '#111827',
  muted: '#5f6875',
  rule: '#d8dde6',
  paper: '#ffffff',
  panel: '#f4f7fb',
  flood: '#49b8d8',
  deepFlood: '#1769aa',
  priority: '#d02020',
  green: '#238b57',
  yellow: '#ffcf5c',
  orange: '#ff8240',
  purple: '#8a6dff',
}

const S = StyleSheet.create({
  page: {
    paddingTop: 38,
    paddingBottom: 34,
    paddingHorizontal: 42,
    backgroundColor: C.paper,
    color: C.ink,
    fontFamily: 'Helvetica',
  },
  cover: {
    padding: 0,
    backgroundColor: '#07111f',
    color: '#ffffff',
    fontFamily: 'Helvetica',
  },
  coverContent: {
    position: 'absolute',
    left: 46,
    right: 46,
    bottom: 42,
  },
  eyebrow: {
    fontSize: 8,
    color: '#8be5ff',
    letterSpacing: 2.2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  coverTitle: {
    fontSize: 33,
    lineHeight: 1.08,
    fontFamily: 'Helvetica-Bold',
    maxWidth: 430,
  },
  coverMeta: {
    flexDirection: 'row',
    gap: 26,
    marginTop: 24,
  },
  coverMetaLabel: {
    fontSize: 7,
    color: '#9fb1c7',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  coverMetaValue: {
    fontSize: 10,
    color: '#ffffff',
  },
  header: {
    position: 'absolute',
    top: 16,
    left: 42,
    right: 42,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 0.75,
    borderBottomColor: C.rule,
    paddingBottom: 7,
  },
  headerText: {
    fontSize: 7,
    color: C.muted,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  footer: {
    position: 'absolute',
    bottom: 14,
    left: 42,
    right: 42,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.75,
    borderTopColor: C.rule,
    paddingTop: 7,
  },
  footerText: {
    fontSize: 7,
    color: C.muted,
  },
  h1: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    lineHeight: 1.14,
    marginBottom: 4,
  },
  h2: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    marginTop: 12,
    marginBottom: 6,
  },
  body: {
    fontSize: 9,
    lineHeight: 1.5,
    color: '#303846',
  },
  small: {
    fontSize: 7.5,
    lineHeight: 1.35,
    color: C.muted,
  },
  rule: {
    width: 34,
    height: 3,
    backgroundColor: C.priority,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  card: {
    backgroundColor: C.panel,
    borderWidth: 0.75,
    borderColor: C.rule,
    padding: 10,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  metric: {
    width: '31.5%',
    backgroundColor: '#ffffff',
    borderWidth: 0.75,
    borderColor: C.rule,
    padding: 9,
  },
  metricLabel: {
    fontSize: 7,
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
  },
  metricDelta: {
    fontSize: 8,
    color: C.green,
    marginTop: 4,
  },
  zoneMap: {
    width: '100%',
    height: 250,
    borderWidth: 0.75,
    borderColor: '#b7c3d0',
    backgroundColor: '#edf3f8',
    marginTop: 10,
  },
  measureCard: {
    borderWidth: 0.75,
    borderColor: C.rule,
    backgroundColor: '#ffffff',
    marginBottom: 10,
    padding: 9,
  },
  badge: {
    fontSize: 7,
    color: '#111827',
    paddingVertical: 3,
    paddingHorizontal: 5,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    fontFamily: 'Helvetica-Bold',
  },
  imageFrame: {
    width: 214,
    height: 132,
    borderWidth: 0.75,
    borderColor: '#aab6c4',
    backgroundColor: '#e5ebf2',
    overflow: 'hidden',
  },
})

function money(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${Math.round(value / 1_000)}k`
  return `$${value}`
}

function delta(base: number, improved: number | null | undefined, suffix = ''): string {
  if (improved == null) return 'Pending'
  const diff = base - improved
  if (diff === 0) return `No change${suffix}`
  return `${diff > 0 ? '-' : '+'}${Math.abs(diff).toLocaleString()}${suffix}`
}

function metersBetween(a: LatLng, b: LatLng): number {
  const lngScale = 111320 * Math.cos(a.lat * Math.PI / 180)
  const dx = (b.lng - a.lng) * lngScale
  const dy = (b.lat - a.lat) * 110540
  return Math.sqrt(dx * dx + dy * dy)
}

function offset(center: LatLng, eastM: number, northM: number): LatLng {
  const lngScale = 111320 * Math.cos(center.lat * Math.PI / 180)
  return {
    lat: center.lat + northM / 110540,
    lng: center.lng + eastM / lngScale,
  }
}

function interventionLabel(kind: FloodInterventionKind): string {
  const labels: Record<FloodInterventionKind, string> = {
    'flood-barrier': 'Deployable flood barrier',
    'retention-pond': 'Retention basin',
    'green-corridor': 'Sponge green corridor',
    'elevated-road': 'Raised road segment',
    'shelter-node': 'Vertical shelter node',
    'protected-route': 'Protected evacuation route',
  }
  return labels[kind]
}

function interventionColor(kind: FloodInterventionKind): string {
  const colors: Record<FloodInterventionKind, string> = {
    'flood-barrier': C.yellow,
    'retention-pond': '#3db4ff',
    'green-corridor': '#34d284',
    'elevated-road': C.orange,
    'shelter-node': '#f6f7fb',
    'protected-route': C.purple,
  }
  return colors[kind]
}

function interventionRationale(kind: FloodInterventionKind): string {
  const values: Record<FloodInterventionKind, string> = {
    'flood-barrier': 'Blocks shallow overland flow before it reaches the most exposed frontage.',
    'retention-pond': 'Adds local storage and cuts downstream peak depth during the first flood wave.',
    'green-corridor': 'Introduces a sponge corridor along pedestrian and drainage desire lines.',
    'elevated-road': 'Keeps a key mobility spine usable above modelled flood depth.',
    'shelter-node': 'Creates vertical refuge and a visible evacuation anchor for delayed occupants.',
    'protected-route': 'Maintains a passable evacuation path through shallow flood conditions.',
  }
  return values[kind]
}

function projectComplexity(kind: FloodInterventionKind): string {
  const values: Record<FloodInterventionKind, string> = {
    'flood-barrier': 'Medium - temporary works, access control, storage, maintenance.',
    'retention-pond': 'High - land take, drainage tie-in, excavation, permits.',
    'green-corridor': 'Medium - streetscape works, utilities coordination, planting.',
    'elevated-road': 'High - civil works, traffic staging, structural design.',
    'shelter-node': 'Medium - building access, operations protocol, wayfinding.',
    'protected-route': 'Low-medium - kerb works, signage, local drainage checks.',
  }
  return values[kind]
}

function summaryFor(data: CityPlanPdfRequest): { baseline: FloodImpactSummary; replanned: FloodImpactSummary | null } {
  if (data.summary) return { baseline: data.summary.baseline, replanned: data.summary.replanned ?? null }
  if (data.scenario) return { baseline: data.scenario.summary, replanned: data.scenario.improvedSummary }
  throw new Error('City plan PDF requires summary or scenario data.')
}

function nearestZoneForMeasure(measure: PlannerIntervention, zones: FloodPriorityZone[]) {
  return zones
    .map(zone => ({ zone, distance: metersBetween(measure.position, zone.position) }))
    .sort((a, b) => a.distance - b.distance)[0]
}

function zonesFromScenario(scenario: FloodScenarioResult): CityPlanPdfZone[] {
  const priorityZones = scenario.priorityZones.length > 0
    ? scenario.priorityZones
    : [{
        id: 'zone-focus',
        position: scenario.interventions[0]?.position ?? scenario.cells[0]?.position ?? { lat: 0, lng: 0 },
        label: 'Selected focus zone',
        severity: 3,
        reason: 'Generated from the selected flood scenario focus area.',
        recommendedIntervention: 'flood-barrier' as FloodInterventionKind,
      }]

  const zones = priorityZones.slice(0, 6).map((zone, index): CityPlanPdfZone => ({
    id: zone.id,
    name: zone.label || `Priority zone ${index + 1}`,
    position: zone.position,
    radiusM: 350,
    severity: zone.severity,
    reason: zone.reason,
    measures: [],
  }))

  for (const intervention of scenario.interventions) {
    const nearest = nearestZoneForMeasure(intervention, priorityZones)
    const target = zones.find(zone => zone.id === nearest?.zone.id) ?? zones[0]
    const outsideNominalZone = target.radiusM != null && metersBetween(intervention.position, target.position) > target.radiusM
    target.measures.push({
      ...intervention,
      rationale: interventionRationale(intervention.kind),
      outsideNominalZone,
    })
  }

  return zones.filter(zone => zone.measures.length > 0 || zones.length <= 3)
}

function normalizedZones(data: CityPlanPdfRequest): CityPlanPdfZone[] {
  if (data.zones && data.zones.length > 0) return data.zones
  if (data.scenario) return zonesFromScenario(data.scenario)
  throw new Error('City plan PDF requires zones or scenario data.')
}

function RunningHeader({ data, section }: { data: CityPlanPdfRequest; section: string }) {
  return (
    <View style={S.header} fixed>
      <Text style={S.headerText}>Faultline District Replanning Brief</Text>
      <Text style={S.headerText}>{data.districtName ?? 'Selected district'} / {section}</Text>
    </View>
  )
}

function Footer() {
  return (
    <View style={S.footer} fixed>
      <Text style={S.footerText}>Planning-use simulation output. Validate with survey and hydraulic modelling before capital commitment.</Text>
      <Text style={S.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  )
}

function pointToZoneMap(point: LatLng, zone: CityPlanPdfZone, width: number, height: number) {
  const radiusM = zone.radiusM ?? 350
  const lngScale = 111320 * Math.cos(zone.position.lat * Math.PI / 180)
  const dx = (point.lng - zone.position.lng) * lngScale
  const dy = (point.lat - zone.position.lat) * 110540
  return {
    x: width / 2 + (dx / radiusM) * (width * 0.32),
    y: height / 2 - (dy / radiusM) * (height * 0.32),
  }
}

function ZoneMap({ zone }: { zone: CityPlanPdfZone }) {
  const width = 510
  const height = 250
  if (zone.mapImageUrl) {
    return <Image src={zone.mapImageUrl} style={S.zoneMap} />
  }

  return (
    <View style={S.zoneMap}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Rect x={0} y={0} width={width} height={height} fill="#e8eef5" />
        {Array.from({ length: 11 }).map((_, i) => (
          <Line key={`v-${i}`} x1={i * 52 - 10} y1={0} x2={i * 52 + 28} y2={height} stroke="#cbd5df" strokeWidth={1} />
        ))}
        {Array.from({ length: 7 }).map((_, i) => (
          <Line key={`h-${i}`} x1={0} y1={i * 42 + 8} x2={width} y2={i * 42 - 20} stroke="#d6dee8" strokeWidth={1} />
        ))}
        <Polyline points="20,185 90,160 132,175 208,129 282,138 338,92 490,78" stroke="#7d8794" strokeWidth={6} fill="none" />
        <Polyline points="46,70 116,92 190,81 258,101 344,74 462,106" stroke="#9aa6b5" strokeWidth={3} fill="none" />
        <Circle cx={width / 2} cy={height / 2} r={86} fill={C.flood} opacity={0.24} />
        <Circle cx={width / 2 + 34} cy={height / 2 - 16} r={58} fill={C.deepFlood} opacity={0.22} />
        <Circle cx={width / 2} cy={height / 2} r={92} fill="none" stroke={C.priority} strokeWidth={2.5} strokeDasharray="7 5" />
        <Circle cx={width / 2} cy={height / 2} r={4} fill={C.priority} />
        <Text x={width / 2 + 9} y={height / 2 - 7} fill={C.priority} style={{ fontSize: 8, fontFamily: 'Helvetica-Bold' }}>ZONE CENTER</Text>
        {zone.measures.map((measure, index) => {
          const p = pointToZoneMap(measure.position, zone, width, height)
          return (
            <React.Fragment key={measure.id}>
              <Circle cx={p.x} cy={p.y} r={Math.max(16, measure.radiusM / 10)} fill={interventionColor(measure.kind)} opacity={0.2} />
              <Circle cx={p.x} cy={p.y} r={7} fill={interventionColor(measure.kind)} stroke="#111827" strokeWidth={1.4} />
              <Text x={p.x + 10} y={p.y + 2} fill="#111827" style={{ fontSize: 8, fontFamily: 'Helvetica-Bold' }}>M{index + 1}</Text>
            </React.Fragment>
          )
        })}
        <Rect x={14} y={14} width={160} height={48} fill="#ffffff" opacity={0.9} />
        <Text x={24} y={31} fill="#111827" style={{ fontSize: 9, fontFamily: 'Helvetica-Bold' }}>2D zone map</Text>
        <Text x={24} y={46} fill="#5f6875" style={{ fontSize: 7 }}>
          Circle radius {Math.round(zone.radiusM ?? 350)}m / {zone.position.lat.toFixed(5)}, {zone.position.lng.toFixed(5)}
        </Text>
      </Svg>
    </View>
  )
}

function StreetViewConceptOverlay({ measure }: { measure: CityPlanPdfMeasure }) {
  const color = interventionColor(measure.kind)
  return (
    <Svg width={214} height={132} viewBox="0 0 214 132">
      <Rect x={0} y={0} width={214} height={132} fill="#dce6ef" />
      <Rect x={0} y={0} width={214} height={54} fill="#b7cbe0" />
      <Rect x={10} y={25} width={42} height={50} fill="#8e9bac" />
      <Rect x={62} y={17} width={34} height={61} fill="#a3adbb" />
      <Rect x={154} y={28} width={46} height={46} fill="#94a1b2" />
      <Path d="M0 132 L78 74 L136 74 L214 132 Z" fill="#59616c" />
      <Path d="M72 132 L96 74 L118 74 L142 132 Z" fill="#2d333d" opacity={0.5} />
      <Line x1={0} y1={95} x2={214} y2={95} stroke="#f2f5f8" strokeWidth={2} opacity={0.7} />
      {measure.kind === 'flood-barrier' && (
        <>
          <Rect x={56} y={82} width={102} height={18} fill={color} opacity={0.9} />
          {Array.from({ length: 6 }).map((_, i) => <Line key={i} x1={62 + i * 18} y1={82} x2={70 + i * 18} y2={100} stroke="#111827" strokeWidth={1} />)}
        </>
      )}
      {measure.kind === 'retention-pond' && (
        <>
          <Circle cx={110} cy={93} r={31} fill={color} opacity={0.7} />
          <Circle cx={110} cy={93} r={22} fill="#1769aa" opacity={0.35} />
        </>
      )}
      {measure.kind === 'green-corridor' && (
        <>
          <Path d="M54 126 C78 96 88 90 104 76 C124 88 136 99 170 126 Z" fill={color} opacity={0.85} />
          {Array.from({ length: 9 }).map((_, i) => <Circle key={i} cx={66 + i * 13} cy={106 - (i % 3) * 8} r={5} fill="#116b3c" />)}
        </>
      )}
      {measure.kind === 'elevated-road' && (
        <>
          <Path d="M34 104 L94 76 L184 99 L174 112 L94 92 L42 120 Z" fill={color} opacity={0.9} />
          <Line x1={68} y1={105} x2={68} y2={126} stroke="#333" strokeWidth={4} />
          <Line x1={144} y1={100} x2={144} y2={124} stroke="#333" strokeWidth={4} />
        </>
      )}
      {measure.kind === 'shelter-node' && (
        <>
          <Rect x={93} y={52} width={32} height={58} fill={color} stroke="#111827" strokeWidth={2} />
          <Path d="M88 52 L109 34 L130 52 Z" fill={C.priority} />
          <Text x={101} y={78} fill="#111827" style={{ fontSize: 10, fontFamily: 'Helvetica-Bold' }}>S</Text>
        </>
      )}
      {measure.kind === 'protected-route' && (
        <>
          <Path d="M42 116 C76 83 112 82 172 98" fill="none" stroke={color} strokeWidth={12} opacity={0.78} />
          <Path d="M42 116 C76 83 112 82 172 98" fill="none" stroke="#ffffff" strokeWidth={2} strokeDasharray="7 5" />
        </>
      )}
      <Rect x={8} y={8} width={92} height={21} fill="#07131f" opacity={0.82} />
      <Text x={14} y={22} fill="#ffffff" style={{ fontSize: 7, fontFamily: 'Helvetica-Bold' }}>{measure.label.toUpperCase()}</Text>
    </Svg>
  )
}

function MeasureStreetView({ measure }: { measure: CityPlanPdfMeasure }) {
  return (
    <View style={S.imageFrame}>
      {measure.streetViewImageUrl ? (
        <Image src={measure.streetViewImageUrl} style={{ width: 214, height: 132 }} />
      ) : (
        <StreetViewConceptOverlay measure={measure} />
      )}
    </View>
  )
}

function CoverPage({ data, zones }: { data: CityPlanPdfRequest; zones: CityPlanPdfZone[] }) {
  return (
    <Page size="A4" style={S.cover}>
      <Image src="/cover_page.png" style={{ position: 'absolute', top: 0, left: 0, width: 595, height: 842 }} />
      <View style={S.coverContent}>
        <Text style={S.eyebrow}>Faultline / Zone-Based Planning Packet</Text>
        <Text style={S.coverTitle}>{data.title ?? 'District Flood Replanning Brief'}</Text>
        <View style={S.coverMeta}>
          <View>
            <Text style={S.coverMetaLabel}>District</Text>
            <Text style={S.coverMetaValue}>{data.districtName ?? 'Selected focus area'}</Text>
          </View>
          <View>
            <Text style={S.coverMetaLabel}>Zones</Text>
            <Text style={S.coverMetaValue}>{zones.length} mapped zones</Text>
          </View>
          <View>
            <Text style={S.coverMetaLabel}>Generated</Text>
            <Text style={S.coverMetaValue}>{new Date(data.generatedAt ?? Date.now()).toLocaleDateString('en-GB')}</Text>
          </View>
        </View>
      </View>
    </Page>
  )
}

function DecisionSummaryPage({ data, zones }: { data: CityPlanPdfRequest; zones: CityPlanPdfZone[] }) {
  const { baseline, replanned } = summaryFor(data)
  const protectedPeople = replanned ? Math.max(0, baseline.affectedPeople - replanned.affectedPeople) : 0
  const damageAvoided = replanned ? Math.max(0, baseline.estimatedDamageUsd - replanned.estimatedDamageUsd) : 0
  const measureCount = zones.reduce((sum, zone) => sum + zone.measures.length, 0)

  return (
    <Page size="A4" style={S.page}>
      <RunningHeader data={data} section="Decision summary" />
      <Footer />
      <Text style={S.h1}>Decision Summary</Text>
      <View style={S.rule} />
      <Text style={S.body}>
        This brief packages the selected flood scenario into specific circular planning zones. Each zone page shows
        exactly where interventions are proposed and provides a street-level concept view for each prevention measure.
      </Text>
      <View style={S.metricGrid}>
        <Metric label="Zones mapped" value={String(zones.length)} delta="Specific circular focus areas" />
        <Metric label="Measures placed" value={String(measureCount)} delta="Grouped by nearest zone" />
        <Metric label="People protected" value={protectedPeople.toLocaleString()} delta={delta(baseline.affectedPeople, replanned?.affectedPeople)} />
        <Metric label="Damage avoided" value={money(damageAvoided)} delta={replanned ? `${money(damageAvoided)} reduction` : 'Pending'} />
        <Metric label="Mobility loss" value={`${baseline.mobilityLossPct}%`} delta={delta(baseline.mobilityLossPct, replanned?.mobilityLossPct, ' pts')} />
        <Metric label="Resilience score" value={String(replanned?.resilienceScore ?? baseline.resilienceScore)} delta={replanned ? `+${Math.max(0, replanned.resilienceScore - baseline.resilienceScore)} points` : 'Baseline'} />
      </View>
      <Text style={S.h2}>Zone Register</Text>
      {zones.map((zone, index) => (
        <View key={zone.id} style={[S.card, { marginBottom: 7 }]}>
          <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold' }}>
            {index + 1}. {zone.name} / {zone.position.lat.toFixed(5)}, {zone.position.lng.toFixed(5)}
          </Text>
          <Text style={S.small}>
            Radius {Math.round(zone.radiusM ?? 350)}m / severity {zone.severity?.toFixed(1) ?? 'n/a'} / {zone.measures.length} improvement plan{zone.measures.length === 1 ? '' : 's'}
          </Text>
        </View>
      ))}
    </Page>
  )
}

function Metric({ label, value, delta: deltaValue }: { label: string; value: string; delta: string }) {
  return (
    <View style={S.metric}>
      <Text style={S.metricLabel}>{label}</Text>
      <Text style={S.metricValue}>{value}</Text>
      <Text style={S.metricDelta}>{deltaValue}</Text>
    </View>
  )
}

function MeasureCard({ measure, index }: { measure: CityPlanPdfMeasure; index: number }) {
  const color = interventionColor(measure.kind)
  return (
    <View style={S.measureCard}>
      <View style={S.row}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 5 }}>
            <Text style={[S.badge, { backgroundColor: color }]}>M{index + 1}</Text>
            <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold' }}>{measure.label}</Text>
          </View>
          <Text style={S.small}>
            {measure.position.lat.toFixed(6)}, {measure.position.lng.toFixed(6)} / {Math.round(measure.radiusM)}m influence radius / {(measure.effectiveness * 100).toFixed(0)}% peak effectiveness
          </Text>
          {measure.outsideNominalZone && (
            <Text style={{ ...S.small, color: C.priority, marginTop: 3 }}>Outside nominal zone radius; attached to nearest priority zone.</Text>
          )}
          <Text style={{ ...S.body, marginTop: 7 }}>{measure.rationale ?? interventionRationale(measure.kind)}</Text>
          <Text style={{ ...S.small, marginTop: 5 }}>Implementation: {projectComplexity(measure.kind)}</Text>
        </View>
        <MeasureStreetView measure={measure} />
      </View>
    </View>
  )
}

function ZonePage({ data, zone, index }: { data: CityPlanPdfRequest; zone: CityPlanPdfZone; index: number }) {
  return (
    <Page size="A4" style={S.page}>
      <RunningHeader data={data} section={`Zone ${index + 1}`} />
      <Footer />
      <Text style={S.h1}>
        Zone {index + 1}: {zone.name}
      </Text>
      <Text style={S.small}>
        {zone.position.lat.toFixed(6)}, {zone.position.lng.toFixed(6)} / circular focus radius {Math.round(zone.radiusM ?? 350)}m / severity {zone.severity?.toFixed(1) ?? 'n/a'}
      </Text>
      <View style={S.rule} />
      {zone.reason && <Text style={S.body}>{zone.reason}</Text>}
      <ZoneMap zone={zone} />
      <Text style={S.h2}>Improvement Plans</Text>
      {zone.measures.length > 0 ? (
        zone.measures.map((measure, measureIndex) => (
          <MeasureCard key={measure.id} measure={measure} index={measureIndex} />
        ))
      ) : (
        <View style={S.card}>
          <Text style={S.body}>No prevention measures are currently assigned to this zone.</Text>
        </View>
      )}
    </Page>
  )
}

function CaveatsPage({ data }: { data: CityPlanPdfRequest }) {
  const notes = data.notes ?? [
    'Zone circles are planning focus areas, not cadastral or statutory boundaries.',
    'Street-view panels are concept views for discussion and site validation; they are not final engineering renders.',
    'Flood surface, occupancy, and damage estimates are generated for rapid planning triage.',
    'Use this packet to prioritize site survey, drainage-network checks, utility review, and detailed hydraulic modelling.',
  ]
  return (
    <Page size="A4" style={S.page}>
      <RunningHeader data={data} section="Validation checklist" />
      <Footer />
      <Text style={S.h1}>Validation Checklist</Text>
      <View style={S.rule} />
      {notes.map(note => (
        <Text key={note} style={{ ...S.body, marginBottom: 7 }}>- {note}</Text>
      ))}
      <View style={{ ...S.card, marginTop: 14 }}>
        <Text style={S.h2}>Planner Follow-Up</Text>
        <Text style={S.body}>1. Confirm each zone with field survey and known drainage assets.</Text>
        <Text style={S.body}>2. Validate intervention footprints with utilities, ownership, traffic staging, and accessibility constraints.</Text>
        <Text style={S.body}>3. Replace concept street-view panels with survey photography before procurement.</Text>
        <Text style={S.body}>4. Run high-resolution hydraulic modelling on shortlisted packages.</Text>
      </View>
    </Page>
  )
}

function buildDocument(data: CityPlanPdfRequest) {
  const zones = normalizedZones(data)
  return (
    <Document
      title={data.title ?? 'District Flood Replanning Brief'}
      author="Faultline"
      subject="Zone-based city flood replanning action packet"
      creator="Faultline"
    >
      <CoverPage data={data} zones={zones} />
      {zones.map((zone, index) => <ZonePage key={zone.id} data={data} zone={zone} index={index} />)}
      <CaveatsPage data={data} />
    </Document>
  )
}

function makeMeasure(id: string, kind: FloodInterventionKind, position: LatLng, radiusM: number, effectiveness: number): CityPlanPdfMeasure {
  return {
    id,
    kind,
    position,
    radiusM,
    effectiveness,
    label: interventionLabel(kind),
    rationale: interventionRationale(kind),
  }
}

export function makeMockCityPlanData(): CityPlanPdfRequest {
  const center = { lat: 1.30423, lng: 103.83178 }
  return {
    title: 'Orchard District Flood Replanning Brief',
    districtName: 'Orchard Road / Somerset focus area',
    preparedFor: 'Urban resilience planning team',
    preparedBy: 'Faultline Intelligence',
    generatedAt: new Date().toISOString(),
    scenarioLabel: '24-minute intense rainfall / pluvial flood simulation',
    areaCenter: center,
    radiusKm: 1,
    summary: {
      baseline: {
        affectedPeople: 6420,
        exposedIndoorPeople: 5890,
        vulnerablePeople: 884,
        affectedBuildings: 67,
        severeBuildings: 18,
        roadsDisrupted: 42,
        estimatedDamageUsd: 58_400_000,
        mobilityLossPct: 41,
        resilienceScore: 38,
      },
      replanned: {
        affectedPeople: 3610,
        exposedIndoorPeople: 3250,
        vulnerablePeople: 492,
        affectedBuildings: 41,
        severeBuildings: 9,
        roadsDisrupted: 23,
        estimatedDamageUsd: 32_900_000,
        mobilityLossPct: 22,
        resilienceScore: 64,
      },
    },
    zones: [
      {
        id: 'zone-crossing',
        name: 'Critical pedestrian crossing',
        position: offset(center, 150, 84),
        radiusM: 360,
        severity: 4.8,
        reason: 'High-footfall crossing and retail frontage exposed to the deepest modelled flow path. The first package protects pedestrians before water reaches the curb line.',
        measures: [
          makeMeasure('measure-barrier-crossing', 'flood-barrier', offset(center, 164, 92), 220, 0.48),
          makeMeasure('measure-protected-crossing-route', 'protected-route', offset(center, 82, -46), 190, 0.28),
        ],
      },
      {
        id: 'zone-retail-frontage',
        name: 'Retail-office frontage basin',
        position: offset(center, -214, 136),
        radiusM: 340,
        severity: 4.1,
        reason: 'Repeated shallow flooding accumulates at the retail-office frontage. The package adds storage and absorption before runoff reaches the interior arcade.',
        measures: [
          makeMeasure('measure-green-corridor', 'green-corridor', offset(center, -210, 136), 250, 0.24),
          makeMeasure('measure-retention-basin', 'retention-pond', offset(center, -318, 208), 300, 0.34),
        ],
      },
      {
        id: 'zone-evacuation-spine',
        name: 'Evacuation spine and shelter access',
        position: offset(center, 72, -248),
        radiusM: 380,
        severity: 3.7,
        reason: 'Primary pedestrian route intersects flood depth above 0.35m and delays mobility-limited occupants. The package keeps a visible route and refuge point usable.',
        measures: [
          makeMeasure('measure-protected-route', 'protected-route', offset(center, 84, -240), 190, 0.28),
          makeMeasure('measure-shelter-node', 'shelter-node', offset(center, -44, -178), 210, 0.22),
        ],
      },
    ],
  }
}

export function cityPlanPdfFilename(data: CityPlanPdfRequest): string {
  const slug = (data.districtName ?? 'district-plan')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${slug || 'district-plan'}-flood-replanning-brief.pdf`
}

export async function renderCityPlanPdfBuffer(data: CityPlanPdfRequest): Promise<Buffer> {
  return await renderToBuffer(buildDocument(data))
}
