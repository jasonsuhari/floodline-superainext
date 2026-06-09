import type { FloodReport } from '@/types'

const updatedAt = '2026-05-28T10:00:00+08:00'

const PUB_RISK_REPORTS: FloodReport[] = [
  { id: 'sg-alexandra-jervois', title: 'Flood-prone corridor watch', locationName: 'Alexandra Road / Jervois Road', position: { lat: 1.2915, lng: 103.8153 }, severity: 4, confidence: 0.86, source: 'pub-risk-area', timestamp: updatedAt, summary: 'PUB-listed low-lying corridor used as a scenario seed for flash-flood replanning.' },
  { id: 'sg-admiralty-dock', title: 'Coastal industrial access risk', locationName: 'Admiralty Road West near Dock Road West', position: { lat: 1.4568, lng: 103.7922 }, severity: 3, confidence: 0.78, source: 'pub-risk-area', timestamp: updatedAt, summary: 'Northern waterfront road segment flagged for access disruption stress testing.' },
  { id: 'sg-beach-road', title: 'Downtown road ponding watch', locationName: 'Beach Road', position: { lat: 1.2995, lng: 103.8593 }, severity: 4, confidence: 0.84, source: 'pub-risk-area', timestamp: updatedAt, summary: 'Central road corridor with dense transit and pedestrian exposure.' },
  { id: 'sg-bedok-south', title: 'East residential flood scenario', locationName: 'Bedok South Road / Bedok South Avenue 1', position: { lat: 1.3212, lng: 103.9354 }, severity: 3, confidence: 0.8, source: 'pub-risk-area', timestamp: updatedAt, summary: 'Residential and bus access scenario seed in Bedok South.' },
  { id: 'sg-changi-chin-cheng', title: 'Changi road drainage load', locationName: 'Changi Road near Chin Cheng Avenue', position: { lat: 1.3184, lng: 103.9118 }, severity: 3, confidence: 0.76, source: 'pub-risk-area', timestamp: updatedAt, summary: 'Roadside service lane flood-prone location used for local access planning.' },
  { id: 'sg-commonwealth', title: 'Queenstown arterial runoff', locationName: 'Commonwealth Avenue / Commonwealth Drive', position: { lat: 1.3035, lng: 103.7973 }, severity: 4, confidence: 0.84, source: 'pub-risk-area', timestamp: updatedAt, summary: 'Arterial and residential interface with likely mobility tradeoffs.' },
  { id: 'sg-cte-moulmein', title: 'Expressway slip-road risk', locationName: 'CTE near slip road to Moulmein Road', position: { lat: 1.3197, lng: 103.8482 }, severity: 5, confidence: 0.74, source: 'pub-risk-area', timestamp: updatedAt, summary: 'High-impact transport disruption scenario around a central expressway connector.' },
  { id: 'sg-farrer-park', title: 'Farrer Park basin alert', locationName: 'Farrer Park Area', position: { lat: 1.3126, lng: 103.8521 }, severity: 5, confidence: 0.9, source: 'pub-risk-area', timestamp: updatedAt, summary: 'Dense mixed-use district with transit, field drainage, and evacuation constraints.' },
  { id: 'sg-hong-kah', title: 'Western catchment runoff report', locationName: 'Hong Kah Area', position: { lat: 1.3499, lng: 103.7211 }, severity: 3, confidence: 0.74, source: 'pub-risk-area', timestamp: updatedAt, summary: 'Western planning-area hotspot for broad district stress testing.' },
  { id: 'sg-indus', title: 'Bukit Merah low-lying street watch', locationName: 'Indus Road', position: { lat: 1.2889, lng: 103.8296 }, severity: 4, confidence: 0.83, source: 'pub-risk-area', timestamp: updatedAt, summary: 'Dense housing and local road exposure near the Singapore River corridor.' },
  { id: 'sg-jalan-besar', title: 'Historic shopfront flood watch', locationName: 'Jalan Besar Area', position: { lat: 1.3052, lng: 103.8553 }, severity: 5, confidence: 0.88, source: 'pub-risk-area', timestamp: updatedAt, summary: 'High-density district scenario with retail, housing, and traffic conflicts.' },
  { id: 'sg-jalan-benaan-kapal', title: 'Kallang waterfront access report', locationName: 'Jalan Benaan Kapal', position: { lat: 1.3019, lng: 103.8801 }, severity: 3, confidence: 0.78, source: 'pub-risk-area', timestamp: updatedAt, summary: 'Waterfront road segment used for access and event-area evacuation planning.' },
  { id: 'sg-jalan-mashor', title: 'Balestier low-lying road watch', locationName: 'Jalan Mashor', position: { lat: 1.3274, lng: 103.8449 }, severity: 3, confidence: 0.72, source: 'pub-risk-area', timestamp: updatedAt, summary: 'Neighborhood road-risk seed for drainage intervention testing.' },
  { id: 'sg-jalan-mat-jambol', title: 'Pasir Panjang runoff marker', locationName: 'Jalan Mat Jambol', position: { lat: 1.2769, lng: 103.7914 }, severity: 3, confidence: 0.8, source: 'pub-risk-area', timestamp: updatedAt, summary: 'Hillside-to-road runoff scenario near Pasir Panjang.' },
  { id: 'sg-jalan-taman', title: 'Bendemeer surface-water report', locationName: 'Jalan Taman', position: { lat: 1.3258, lng: 103.8645 }, severity: 3, confidence: 0.8, source: 'pub-risk-area', timestamp: updatedAt, summary: 'Urban street flooding seed for local mobility planning.' },
  { id: 'sg-king-george', title: 'Civic association access risk', locationName: "King George's Avenue", position: { lat: 1.3084, lng: 103.8616 }, severity: 4, confidence: 0.76, source: 'pub-risk-area', timestamp: updatedAt, summary: 'Central access corridor near public facilities and arterial traffic.' },
  { id: 'sg-langsat', title: 'Geylang East local flood watch', locationName: 'Langsat Road Area', position: { lat: 1.3156, lng: 103.9038 }, severity: 3, confidence: 0.82, source: 'pub-risk-area', timestamp: updatedAt, summary: 'Eastern residential street cluster for response routing.' },
  { id: 'sg-lorong-buangkok', title: 'North-east low-lying settlement watch', locationName: 'Lorong Buangkok', position: { lat: 1.3835, lng: 103.8784 }, severity: 4, confidence: 0.82, source: 'pub-risk-area', timestamp: updatedAt, summary: 'Low-lying north-east scenario with road access sensitivity.' },
  { id: 'sg-telok-kurau-h', title: 'Siglap canal corridor watch', locationName: 'Lorong H Telok Kurau', position: { lat: 1.3154, lng: 103.9073 }, severity: 4, confidence: 0.82, source: 'pub-risk-area', timestamp: updatedAt, summary: 'Canal-adjacent street scenario for drainage and evacuation tradeoffs.' },
  { id: 'sg-lower-delta', title: 'Lower Delta junction risk', locationName: 'Lower Delta Road / Alexandra Road', position: { lat: 1.2898, lng: 103.8238 }, severity: 4, confidence: 0.82, source: 'pub-risk-area', timestamp: updatedAt, summary: 'Major road junction scenario near dense housing and arterial routes.' },
  { id: 'sg-margaret-tanglin', title: 'Queenstown-Tanglin connector watch', locationName: 'Margaret Drive / Tanglin Road', position: { lat: 1.2942, lng: 103.8159 }, severity: 4, confidence: 0.82, source: 'pub-risk-area', timestamp: updatedAt, summary: 'Connector-road scenario affecting access between residential districts.' },
  { id: 'sg-meyer-fort', title: 'East Coast corridor report', locationName: 'Meyer Road / Fort Road / Arthur Road', position: { lat: 1.2981, lng: 103.8869 }, severity: 4, confidence: 0.79, source: 'pub-risk-area', timestamp: updatedAt, summary: 'Coastal road cluster used for access and drainage intervention planning.' },
  { id: 'sg-mimosa', title: 'Seletar Hills localized flood watch', locationName: 'Mimosa Walk', position: { lat: 1.3831, lng: 103.8612 }, severity: 3, confidence: 0.8, source: 'pub-risk-area', timestamp: updatedAt, summary: 'North-east neighborhood scenario for local street flooding.' },
  { id: 'sg-changi-camp', title: 'Changi camp access risk', locationName: "Mindef's Changi Camp off Farnborough Road", position: { lat: 1.3654, lng: 103.9747 }, severity: 3, confidence: 0.7, source: 'pub-risk-area', timestamp: updatedAt, summary: 'Eastern institutional access scenario based on PUB-listed flood-prone location.' },
  { id: 'sg-mountbatten-seaview', title: 'Mountbatten coastal corridor watch', locationName: 'Mountbatten Road leading to Jalan Seaview', position: { lat: 1.2998, lng: 103.8933 }, severity: 4, confidence: 0.77, source: 'pub-risk-area', timestamp: updatedAt, summary: 'Coastal-access scenario near residential and arterial routes.' },
  { id: 'sg-neo-pee-teck', title: 'Pasir Panjang lane flooding', locationName: 'Neo Pee Teck Lane', position: { lat: 1.2922, lng: 103.7687 }, severity: 3, confidence: 0.8, source: 'pub-risk-area', timestamp: updatedAt, summary: 'Western local-road flood scenario near hillside runoff paths.' },
  { id: 'sg-new-upper-changi', title: 'Tanah Merah road access watch', locationName: 'New Upper Changi Road near Tanah Merah Kechil Avenue', position: { lat: 1.3246, lng: 103.9465 }, severity: 4, confidence: 0.76, source: 'pub-risk-area', timestamp: updatedAt, summary: 'Eastern arterial access scenario with residential and transit pressure.' },
  { id: 'sg-rose-lane', title: 'Joo Chiat street flood watch', locationName: 'Rose Lane', position: { lat: 1.3101, lng: 103.8935 }, severity: 3, confidence: 0.82, source: 'pub-risk-area', timestamp: updatedAt, summary: 'Local road and shopfront exposure scenario.' },
  { id: 'sg-second-chin-bee', title: 'Jurong industrial flood watch', locationName: 'Second Chin Bee Road', position: { lat: 1.3302, lng: 103.7149 }, severity: 3, confidence: 0.82, source: 'pub-risk-area', timestamp: updatedAt, summary: 'Industrial access and logistics disruption scenario.' },
  { id: 'sg-sennett', title: 'Sennett Estate drainage stress', locationName: 'Sennett Estate', position: { lat: 1.3294, lng: 103.8703 }, severity: 4, confidence: 0.84, source: 'pub-risk-area', timestamp: updatedAt, summary: 'Residential-estate hotspot covering Puay Hee, Siang Kuang, Wan Tho, and nearby roads.' },
  { id: 'sg-tampines-teliti', title: 'Tampines service-road report', locationName: 'Service road off Tampines Road near Jalan Teliti', position: { lat: 1.3605, lng: 103.8915 }, severity: 3, confidence: 0.72, source: 'pub-risk-area', timestamp: updatedAt, summary: 'Service-road flood scenario near north-east arterial movement.' },
  { id: 'sg-stevens-balmoral', title: 'Stevens-Balmoral runoff watch', locationName: 'Stevens Road / Balmoral Road', position: { lat: 1.3162, lng: 103.8266 }, severity: 4, confidence: 0.78, source: 'pub-risk-area', timestamp: updatedAt, summary: 'Central hillside-road scenario for runoff and access planning.' },
  { id: 'sg-south-bridge', title: 'CBD canal corridor surge', locationName: 'South Bridge Road / North Canal Road', position: { lat: 1.2862, lng: 103.8470 }, severity: 5, confidence: 0.87, source: 'pub-risk-area', timestamp: updatedAt, summary: 'Central business district hotspot near canalized drainage and high footfall.' },
  { id: 'sg-upper-east-coast', title: 'Upper East Coast drainage watch', locationName: 'Upper East Coast Road near Parbury Avenue', position: { lat: 1.3164, lng: 103.9402 }, severity: 4, confidence: 0.78, source: 'pub-risk-area', timestamp: updatedAt, summary: 'Eastern residential arterial scenario for surface-water disruption.' },
  { id: 'sg-waterloo', title: 'Civic district surface flooding', locationName: 'Waterloo / Albert / Bencoolen / Prinsep', position: { lat: 1.3007, lng: 103.8510 }, severity: 5, confidence: 0.89, source: 'pub-risk-area', timestamp: updatedAt, summary: 'Dense civic and retail district scenario with high pedestrian exposure.' },
  { id: 'sg-zion', title: 'River Valley flood-prone marker', locationName: 'Zion Road', position: { lat: 1.2922, lng: 103.8310 }, severity: 4, confidence: 0.82, source: 'pub-risk-area', timestamp: updatedAt, summary: 'Road and building exposure scenario near River Valley and Alexandra corridor.' },

]

const GLOBAL_REPORTS: FloodReport[] = [
  { id: 'global-jakarta', title: 'Live report: canal overflow claims', locationName: 'Jakarta, Indonesia', position: { lat: -6.2088, lng: 106.8456 }, severity: 5, confidence: 0.61, source: 'synthetic-live-report', timestamp: updatedAt, summary: 'Synthetic live-report cluster: intense rainfall, road closures, and pump deployment requests.' },
  { id: 'global-bangkok', title: 'Live report: urban ponding', locationName: 'Bangkok, Thailand', position: { lat: 13.7563, lng: 100.5018 }, severity: 4, confidence: 0.58, source: 'synthetic-live-report', timestamp: updatedAt, summary: 'Synthetic feed item representing monsoon street flooding and transit delays.' },
  { id: 'global-manila', title: 'Live report: evacuation route pressure', locationName: 'Metro Manila, Philippines', position: { lat: 14.5995, lng: 120.9842 }, severity: 5, confidence: 0.59, source: 'synthetic-live-report', timestamp: updatedAt, summary: 'Synthetic cluster for regional flood response simulation.' },
  { id: 'global-mumbai', title: 'Live report: rail underpass flooding', locationName: 'Mumbai, India', position: { lat: 19.0760, lng: 72.8777 }, severity: 5, confidence: 0.57, source: 'synthetic-live-report', timestamp: updatedAt, summary: 'Synthetic report modeled as heavy-rain underpass flooding affecting commuter flows.' },
  { id: 'global-dhaka', title: 'Live report: low-lying ward inundation', locationName: 'Dhaka, Bangladesh', position: { lat: 23.8103, lng: 90.4125 }, severity: 5, confidence: 0.56, source: 'synthetic-live-report', timestamp: updatedAt, summary: 'Synthetic report for flood-response agent benchmarking.' },
  { id: 'global-houston', title: 'Live report: bayou road closures', locationName: 'Houston, United States', position: { lat: 29.7604, lng: -95.3698 }, severity: 4, confidence: 0.55, source: 'synthetic-live-report', timestamp: updatedAt, summary: 'Synthetic stormwater disruption report for global demo coverage.' },
  { id: 'global-nyc', title: 'Live report: subway entrance flooding', locationName: 'New York City, United States', position: { lat: 40.7128, lng: -74.0060 }, severity: 4, confidence: 0.54, source: 'synthetic-live-report', timestamp: updatedAt, summary: 'Synthetic report focused on transit access protection.' },
  { id: 'global-london', title: 'Live report: surface-water alert', locationName: 'London, United Kingdom', position: { lat: 51.5072, lng: -0.1276 }, severity: 3, confidence: 0.52, source: 'synthetic-live-report', timestamp: updatedAt, summary: 'Synthetic rainfall report used to show global flood-intel ingestion.' },
  { id: 'global-dubai', title: 'Live report: arterial ponding', locationName: 'Dubai, United Arab Emirates', position: { lat: 25.2048, lng: 55.2708 }, severity: 4, confidence: 0.5, source: 'synthetic-live-report', timestamp: updatedAt, summary: 'Synthetic high-intensity rainfall disruption scenario.' },
  { id: 'global-sydney', title: 'Live report: flash-flood road impacts', locationName: 'Sydney, Australia', position: { lat: -33.8688, lng: 151.2093 }, severity: 3, confidence: 0.5, source: 'synthetic-live-report', timestamp: updatedAt, summary: 'Synthetic coastal-city flood report for cross-city comparison.' },
]

const OUTLETS = ['Channel SG Weather Desk', 'CivicWire Singapore', 'MetroWatch Asia', 'Straits Urban Desk', 'GroundOps Bulletin', 'Resilience Live']
const REPORTERS = ['Nadia Rahim', 'Evan Lim', 'Sofia Tan', 'Marcus Lee', 'Priya Nair', 'Daniel Koh']
const INCIDENTS = [
  'ankle-deep water reported near bus stops',
  'kerbside drains running at capacity',
  'traffic slowing around a ponding cluster',
  'shopfronts placing temporary flood boards',
  'pedestrian detours forming around low-lying crossings',
  'delivery riders rerouting away from flooded lanes',
]

function hashNumber(seed: string): number {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967295
}

function offsetFrom(report: FloodReport, index: number) {
  const a = hashNumber(`${report.id}:${index}:angle`) * Math.PI * 2
  const r = 90 + hashNumber(`${report.id}:${index}:radius`) * 980
  const lngScale = 111320 * Math.cos(report.position.lat * Math.PI / 180)
  return {
    lat: report.position.lat + Math.sin(a) * r / 110540,
    lng: report.position.lng + Math.cos(a) * r / lngScale,
  }
}

function makeSingaporeMockReports(count = 1000): FloodReport[] {
  return Array.from({ length: count }, (_, index) => {
    const anchor = PUB_RISK_REPORTS[index % PUB_RISK_REPORTS.length]
    const severityJitter = hashNumber(`${anchor.id}:${index}:severity`)
    const severity = Math.max(2, Math.min(5, anchor.severity + (severityJitter > 0.82 ? 1 : severityJitter < 0.24 ? -1 : 0))) as 2 | 3 | 4 | 5
    const outletName = OUTLETS[index % OUTLETS.length]
    const reporterName = REPORTERS[(index * 3 + anchor.id.length) % REPORTERS.length]
    const incident = INCIDENTS[(index + anchor.locationName.length) % INCIDENTS.length]
    const minutesAgo = 7 + Math.floor(hashNumber(`${index}:time`) * 320)
    const timestamp = new Date(Date.parse(updatedAt) - minutesAgo * 60_000).toISOString()
    const title = severity >= 5
      ? `Flash flood response escalated around ${anchor.locationName}`
      : severity >= 4
        ? `Heavy rain causes disruption near ${anchor.locationName}`
        : `Localized ponding reported at ${anchor.locationName}`

    return {
      id: `sg-live-${String(index + 1).padStart(4, '0')}`,
      title,
      locationName: anchor.locationName,
      position: offsetFrom(anchor, index),
      severity,
      confidence: 0.48 + hashNumber(`${index}:confidence`) * 0.34,
      source: 'synthetic-live-report',
      timestamp,
      outletName,
      reporterName,
      summary: `${incident}; replanning agents should check road access, shelters, and bus diversion options.`,
      articleBody: `${outletName} received multiple field updates from the ${anchor.locationName} area after intense rainfall moved across central and eastern Singapore. Reports describe ${incident}, with commuters slowing near crossings and several service vehicles taking alternate streets. This synthetic report is generated for the demo feed so the city replanner can stress-test response priorities against a dense stream of flood intelligence.`,
      reportUrl: `https://demo.floodintel.local/reports/sg-live-${String(index + 1).padStart(4, '0')}`,
    }
  })
}

export const FLOOD_REPORTS: FloodReport[] = [
  ...PUB_RISK_REPORTS,
  ...makeSingaporeMockReports(1000),
  ...GLOBAL_REPORTS,
]

export const FLOOD_REPORT_COUNTS = {
  pubRiskAreas: PUB_RISK_REPORTS.length,
  singaporeMockReports: 1000,
  globalMockReports: GLOBAL_REPORTS.length,
  total: PUB_RISK_REPORTS.length + 1000 + GLOBAL_REPORTS.length,
}
