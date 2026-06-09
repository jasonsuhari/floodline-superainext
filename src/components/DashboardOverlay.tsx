'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import PolaroidStream from '@/components/PolaroidStream'
import PdfBriefGenerator from '@/components/PdfBriefGenerator'
import type { AgentCapture, AgentInsightFailureMode, BillboardPlacement, OohMapPoint, PedestrianAgent } from '@/types'

const PDF_BRIEF_UNLOCK_THRESHOLD = 3

// ── DAG layout ────────────────────────────────────────────────────────────────
// ViewBox 730 × 220. Each node is 140 × 56, centered at (cx, cy).

const DAG_NODES = [
  { id: 'ingest_news',  label: 'ingest_news',  detail: 'CNA · ST · LTA · Reddit',     state: 'running', index: '01', cx: 80,  cy: 110 },
  { id: 'normalize',    label: 'normalize',    detail: 'dedupe · merge · rank',        state: 'running', index: '02', cx: 272, cy: 110 },
  { id: 'llm_embed',    label: 'llm_embed',    detail: 'text-embedding-3-large',       state: 'queued',  index: '03', cx: 460, cy: 55  },
  { id: 'geo_match',    label: 'geo_match',    detail: 'OOH · billboard match',        state: 'running', index: '04', cx: 460, cy: 165 },
  { id: 'persist_db',   label: 'persist_db',   detail: 'Supabase · Pinecone',          state: 'success', index: '05', cx: 650, cy: 110 },
] as const

const DAG_EDGES = [
  { id: 'e1', state: 'running', d: 'M 150 110 L 202 110' },
  { id: 'e2', state: 'queued',  d: 'M 342 110 C 370 110 370 55  390 55'  },
  { id: 'e3', state: 'running', d: 'M 342 110 C 370 110 370 165 390 165' },
  { id: 'e4', state: 'queued',  d: 'M 530 55  C 558 55  558 110 580 110' },
  { id: 'e5', state: 'running', d: 'M 530 165 C 558 165 558 110 580 110' },
] as const

// ── Source feeds ──────────────────────────────────────────────────────────────

const SOURCE_FEEDS = [
  { name: 'CNA breaking',    count: 48,  freshness: '18s', status: 'polling'   },
  { name: 'Straits Times',   count: 31,  freshness: '42s', status: 'indexed'   },
  { name: 'LTA traffic',     count: 84,  freshness: '9s',  status: 'streaming' },
  { name: 'Reddit / X',      count: 126, freshness: '1m',  status: 'triage'    },
] as const

const DATA_STORES = [
  { label: 'raw_articles',    value: '2,418 rows' },
  { label: 'geo_events',      value: '684 rows'   },
  { label: 'report_snapshots',value: '97 docs'    },
] as const

// ── Live log templates ────────────────────────────────────────────────────────

const LOG_TEMPLATES = [
  'scrapers     | Crawled PUB list-of-flood-prone-areas-as-at-apr-2025.pdf (182ms)',
  'doc_parser   | Parsing PUB report section 4 [Low-Lying Hotspots]...',
  'hotspot_det  | Spotted potential hotspot candidate: "Lorong Buangkok" (confidence 0.98)',
  'coordinate_lk| Querying OneMap API for "Lorong Buangkok" address string...',
  'geo_resolver | Match found! Lorong Buangkok → [1.3812, 103.8824]',
  'persist_db   | Upserted resolved hotspot [Lorong Buangkok] → geo_events table (latency 42ms)',
  'scrapers     | NEA weather API returned active heavy rain warning for Central/North (n={n})',
  'doc_parser   | Parsing active news article CNA "Flash flood warning at Orchard Road"...',
  'hotspot_det  | Spotted potential hotspot candidate: "Orchard Rd / Paterson Rd Junction"',
  'coordinate_lk| Querying SLA coordinate DB for "Paterson Rd Junction"...',
  'geo_resolver | Match found! Paterson Rd Junction → [1.3048, 103.8319]',
  'scrapers     | Reddit SG crawler fetched 4 active flood discussion threads',
  'doc_parser   | Parsing social sentiment text for localized flooding reports...',
  'hotspot_det  | Spotted potential hotspot candidate: "Craig Road / Tanjong Pagar"',
  'coordinate_lk| Querying OneMap API for "Craig Road"...',
  'geo_resolver | Match found! Craig Road → [1.2779, 103.8436]',
  'persist_db   | Supabase write: geo_events row inserted (type=flood_hotspot)',
  'analytics    | Calculated inundation risk index for Orchard Rd corridor: High (0.87)',
  'scrapers     | Crawled MSS daily weather bulletin (latency 212ms)',
  'doc_parser   | Parsing climatological rainfall data charts...',
  'geo_resolver | Match found! Bukit Timah Canal → [1.3325, 103.7944]'
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatFailureMode(value: AgentInsightFailureMode): string {
  return value.replace(/_/g, ' ')
}

function summarizeInsightPatterns(captures: AgentCapture[]) {
  const insights = captures
    .map(c => c.qualitativeInsight)
    .filter((i): i is NonNullable<AgentCapture['qualitativeInsight']> => !!i)
  if (insights.length === 0) return null
  const modeCounts = insights.reduce<Record<string, number>>((acc, i) => {
    acc[i.failureMode] = (acc[i.failureMode] ?? 0) + 1
    return acc
  }, {})
  const topMode = Object.entries(modeCounts).sort((a, b) => b[1] - a[1])[0]
  const avgDwell = insights.reduce((s, i) => s + i.context.dwellSeconds, 0) / insights.length
  const rememberedCount = insights.filter(i => !/unclear|none|not sure|forgot/i.test(i.remembered)).length
  return {
    total: insights.length,
    topFailureMode: topMode?.[0] as AgentInsightFailureMode | undefined,
    topFailureCount: topMode?.[1] ?? 0,
    avgDwell,
    rememberedCount,
    latestFix: insights[0]?.creativeFix,
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void
  captures: AgentCapture[]
  billboards?: BillboardPlacement[]
  oohPoints?: OohMapPoint[]
  mapboxToken?: string
  agentsRef?: React.RefObject<PedestrianAgent[]>
}

export default function DashboardOverlay({ onClose, captures }: Props) {
  const logScrollRef = useRef<HTMLElement | null>(null)
  const logLineCounter = useRef(1000)
  const [selectedCaptureId, setSelectedCaptureId] = useState<string | null>(null)
  const [liveLogLines, setLiveLogLines] = useState<string[]>([])

  const orderedCaptures = useMemo(() => [...captures].reverse(), [captures])
  const insightSummary = useMemo(() => summarizeInsightPatterns(orderedCaptures), [orderedCaptures])
  const pipelineStats = useMemo(() => {
    const n = captures.length
    return {
      runId: `dagrun_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_sg_${String(n + 17).padStart(3, '0')}`,
      sourceCount: SOURCE_FEEDS.reduce((s, f) => s + f.count, 0) + n * 3,
      writeCount: 319 + n * 11,
      matchCount: 42 + n * 2,
    }
  }, [captures.length])

  // Escape key
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  // Live log ticker
  useEffect(() => {
    const tick = () => {
      logLineCounter.current += Math.floor(Math.random() * 13) + 1
      const template = LOG_TEMPLATES[Math.floor(Math.random() * LOG_TEMPLATES.length)]
      const line = template.replace(/{n}/g, String(logLineCounter.current))
      const now = new Date()
      const ts = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
      setLiveLogLines(prev => [`${ts}  ${line}`, ...prev].slice(0, 30))
    }
    tick()
    const id = setInterval(tick, 400)
    return () => clearInterval(id)
  }, [])

  return (
    <div
      className="bh-overlay-backdrop"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      role="presentation"
    >
      <div className="bh-overlay-dialog" role="dialog" aria-modal="true" aria-label="Faultline Intelligence Cockpit">

        <header className="bh-cockpit-header">
          <div className="bh-cockpit-header__identity">
            <span className="bh-cockpit-header__brand">Faultline Intelligence</span>
            <span className="bh-cockpit-header__divider" />
            <span className="bh-cockpit-header__title">Live Market Intelligence Cockpit</span>
            <span className="bh-cockpit-header__run">{pipelineStats.runId}</span>
          </div>
          <div className="bh-cockpit-header__actions">
            {captures.length >= PDF_BRIEF_UNLOCK_THRESHOLD && (
              <PdfBriefGenerator
                buttonClassName="bh-pdf-btn"
                buttonLabel="Generate PDF brief"
                filename="faultline-brief.pdf"
              />
            )}
            <button className="bh-close-btn" onClick={onClose} aria-label="Close dashboard">x</button>
          </div>
        </header>

        <main className="bh-dash">
          <section
            className="bh-dash__left bh-cockpit-log"
            ref={logScrollRef as React.RefObject<HTMLElement>}
            aria-label="Intelligence workflow and agent observation log"
          >
            <div className="bh-cockpit-log__header">
              <span className="bh-cockpit-log__eyebrow">Live</span>
              <span className="bh-cockpit-log__title">News + Street Signal Workflow</span>
              <span className="bh-cockpit-log__count">{pipelineStats.sourceCount} source events</span>
            </div>

            <section className="bh-workflow" aria-label="Live data ingestion workflow">



              {/* ── Source feeds ── */}
              <div className="bh-workflow__feeds">
                {SOURCE_FEEDS.map(feed => (
                  <div className={`bh-source-feed bh-source-feed--${feed.status}`} key={feed.name}>
                    <span>{feed.name}</span>
                    <strong>{feed.count}</strong>
                    <em>{feed.status} · {feed.freshness}</em>
                  </div>
                ))}
              </div>

              {/* ── Data stores ── */}
              <div className="bh-workflow__stores" aria-label="Database persistence targets">
                {DATA_STORES.map(store => (
                  <div key={store.label}>
                    <span>{store.label}</span>
                    <strong>{store.value}</strong>
                  </div>
                ))}
              </div>

              {/* ── Horizontally scrollable Reports & News container ── */}
              <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#666', fontWeight: 'bold' }}>Flood Intelligence & Bulletins</span>
                  <span style={{ fontSize: '9px', background: '#D02020', color: '#fff', padding: '1px 6px', fontWeight: 'bold' }}>LIVE ALERTS</span>
                </div>
                <div style={{
                  display: 'flex',
                  gap: '12px',
                  overflowX: 'auto',
                  paddingBottom: '8px',
                  scrollSnapType: 'x mandatory',
                  scrollbarWidth: 'thin'
                }}>
                  {[
                    { title: "PUB list of Flood Prone Areas (April 2025)", category: "Report", source: "PUB Singapore", time: "Official PDF", desc: "Official designated flood prone areas and low-lying hotspots in Singapore.", url: "https://www.pub.gov.sg/-/media/PUB/PDF/Flood-Management/List-of-Flood-Prone-Areas-as-at-Apr-2025.pdf" },
                    { title: "NEA Weather Forecast & Rain Alerts", category: "Data Feed", source: "National Environment Agency", time: "Live API", desc: "Real-time rain area alerts, 2-hour forecasts, and heavy rain warnings.", url: "https://www.weather.gov.sg" },
                    { title: "PUB Flash Flood Alerts Portal", category: "Bulletin", source: "PUB Singapore", time: "Real-time", desc: "Subcribe to real-time SMS alerts and check active flash floods in low-lying areas.", url: "https://www.pub.gov.sg/FloodSafety/Subscribe" },
                    { title: "CNA: Heavy rain causes flash floods in several areas", category: "News", source: "Channel NewsAsia", time: "Archived News", desc: "Comprehensive reports on heavy downpours leading to flash flood activations.", url: "https://www.channelnewsasia.com/singapore" },
                    { title: "MSS Rainfall and Weather Bulletins", category: "Data Feed", source: "Meteorological Service Singapore", time: "Daily", desc: "Detailed localized rainfall data, climatological reports, and safety advisories.", url: "https://www.weather.gov.sg/climate-past-climate-trends" },
                    { title: "SG_Flood_Bot: Somerset MRT Level -0.4m", category: "Social Feed", source: "Telegram Channel", time: "2m ago", desc: "User reports Somerset area drainage canals are reaching maximum retention capacity.", url: "" },
                    { title: "Flood Risk Assessment: Lor Buangkok", category: "Agent Report", source: "Faultline Analyzer", time: "5m ago", desc: "Risk index high for Low-Lying Kampong corridor due to continuous high tide.", url: "" },
                    { title: "Reddit SG: Anyone stuck in Bukit Timah?", category: "Social Feed", source: "Reddit r/singapore", time: "10m ago", desc: "Thread detailing vehicle detours and active standing water around Dunearn Road.", url: "" },
                    { title: "Drainage Infrastructure Sensor Network", category: "Data Feed", source: "SLA IoT Grid", time: "15m ago", desc: "Telemetry monitoring active flow velocity and debris blockages in major canal conduits.", url: "" }
                  ].map((report, idx) => {
                    const CardComponent = report.url ? 'a' : 'div'
                    const extraProps = report.url ? {
                      href: report.url,
                      target: "_blank",
                      rel: "noopener noreferrer"
                    } : {}

                    return (
                      <CardComponent
                        key={idx}
                        {...extraProps}
                        style={{
                          flex: '0 0 240px',
                          scrollSnapAlign: 'start',
                          border: '2px solid #121212',
                          background: '#fff',
                          padding: '10px',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: '6px',
                          textDecoration: 'none',
                          color: 'inherit',
                          cursor: report.url ? 'pointer' : 'default',
                          transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                        }}
                        onMouseEnter={e => {
                          if (report.url) {
                            e.currentTarget.style.transform = 'translateY(-2px)'
                            e.currentTarget.style.boxShadow = '4px 4px 0px #121212'
                          }
                        }}
                        onMouseLeave={e => {
                          if (report.url) {
                            e.currentTarget.style.transform = 'none'
                            e.currentTarget.style.boxShadow = 'none'
                          }
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <span style={{
                            fontSize: '8px',
                            background: report.category === 'Report' || report.category === 'Agent Report' ? '#D02020' : report.category === 'News' ? '#B08A00' : '#16804A',
                            color: '#fff',
                            padding: '1px 4px',
                            fontWeight: 'bold',
                            textTransform: 'uppercase'
                          }}>{report.category}</span>
                          <span style={{ fontSize: '8px', color: '#888' }}>{report.time}</span>
                        </div>
                        <h4 style={{ fontSize: '11px', fontWeight: 'bold', margin: '2px 0 0', color: '#121212', lineHeight: '1.2' }}>{report.title}</h4>
                        <p style={{ fontSize: '9px', color: '#555', margin: 0, lineHeight: '1.3' }}>{report.desc}</p>
                        <div style={{ fontSize: '8px', color: '#888', borderTop: '1px solid #eee', paddingTop: '4px', marginTop: '2px', display: 'flex', justifyContent: 'space-between' }}>
                          <span>Source: <strong>{report.source}</strong></span>
                          {report.url && <span style={{ color: '#D02020', fontWeight: 'bold' }}>GO →</span>}
                        </div>
                      </CardComponent>
                    )
                  })}
                </div>
              </div>

              {/* ── Live log ── */}
              <div className="bh-live-log" aria-label="Live pipeline log">
                <div className="bh-live-log__label">
                  <span className="bh-live-log__dot" aria-hidden="true" />
                  Pipeline log
                </div>
                <div className="bh-live-log__scroll">
                  {liveLogLines.map((line, i) => (
                    <div key={i} className={`bh-live-log__line${i === 0 ? ' bh-live-log__line--fresh' : ''}`}>
                      {line}
                    </div>
                  ))}
                </div>
              </div>

            </section>

            {orderedCaptures.length > 0 && (
              <>
                {insightSummary && (
                  <div className="bh-insight-summary" aria-label="Aggregated agent insight patterns">
                    <div>
                      <span>Repeated pattern</span>
                      <strong>
                        {insightSummary.topFailureMode
                          ? `${formatFailureMode(insightSummary.topFailureMode)} in ${insightSummary.topFailureCount}/${insightSummary.total} sightings`
                          : `${insightSummary.total} qualitative sightings`}
                      </strong>
                    </div>
                    <div>
                      <span>Recall check</span>
                      <strong>{insightSummary.rememberedCount}/{insightSummary.total} remembered brand/category</strong>
                    </div>
                    <div>
                      <span>Viewing constraint</span>
                      <strong>{insightSummary.avgDwell.toFixed(1)}s avg simulated dwell</strong>
                    </div>
                    <p>{insightSummary.latestFix}</p>
                  </div>
                )}
                <PolaroidStream
                  className="polaroids-stream--cockpit"
                  scrollRootRef={logScrollRef}
                  liveCaptures={orderedCaptures}
                  includePlaceholderItems={false}
                  onSelectAgent={(capture) => setSelectedCaptureId(capture.id)}
                  selectedAgentId={selectedCaptureId}
                />
              </>
            )}
          </section>
        </main>
      </div>
    </div>
  )
}
