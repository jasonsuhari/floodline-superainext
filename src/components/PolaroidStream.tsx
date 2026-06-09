'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'
import type { AgentCapture } from '@/types'
import { agentKindIcon, agentKindLabel, getAgentModel } from '@/lib/agentIdentity'

type PolaroidItem = {
  id: string
  username: string
  text: string[]
  rotation: number
  shift: number
  reverse: boolean
  size: 'compact' | 'standard' | 'large'
  colors: [string, string, string]
  avatar: string
}

const INITIAL_ITEMS = 14
const LOAD_MORE_COUNT = 8

const usernames = [
  '@mika.frames',
  '@citygrain',
  '@northlens',
  '@studio.row',
  '@lightnotes',
  '@orbitwalk',
  '@paperhour',
  '@slowarchive',
]

const textSnippets = [
  ["didn't really catch my eye", 'walked right past it', 'not sure what it was even for'],
  ['too much going on, couldn\'t read it in time', 'probably wasn\'t the target audience anyway'],
  ['noticed it but forgot it immediately', 'the colors blended into everything else'],
  ['genuinely couldn\'t tell what they were selling', 'bold design, but nothing landed'],
  ['barely registered it', 'something about the layout felt off'],
  ['okay concept, not sure it worked at this size', 'couldn\'t read the small text at all'],
  ['walked by too fast to take it in', 'maybe if I\'d slowed down'],
  ['would\'ve had to stop to actually read it', 'I didn\'t stop'],
]

const palettes: Array<[string, string, string]> = [
  ['#f7d86a', '#f06449', '#263238'],
  ['#85d7d0', '#3157d5', '#fff6d8'],
  ['#f3a6b2', '#1f7a5b', '#151515'],
  ['#b8d95f', '#eb5f28', '#f9f4e7'],
  ['#f4efe2', '#2f7de1', '#d91f32'],
  ['#d9c2ff', '#ffcb47', '#20242c'],
]

const sizeVariants: PolaroidItem['size'][] = ['standard', 'compact', 'large', 'standard']

function hashMetric(seed: string, min: number, max: number): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return min + (h % (max - min + 1))
}

function metricsForCapture(capture: AgentCapture) {
  const seed = `${capture.id}:${capture.agentName}:${capture.billboardName}`
  const kind = capture.agentKind ?? 'walker'
  const profile = getAgentModel(kind).attention
  const dwellBase = Math.round(profile.dwellBaseSeconds)
  const attentionBase = profile.attentionBase
  const hasAnalysis = !!capture.photorealAnalysis?.result
  const hasThought = !!capture.thought
  const fastReadBoost = capture.billboardOverlay ? 8 : 0

  return [
    {
      label: 'Attention',
      value: `${Math.min(96, attentionBase + hashMetric(seed, -7, 12) + (hasAnalysis ? 5 : 0))}%`,
    },
    {
      label: 'Dwell',
      value: capture.qualitativeInsight
        ? `${capture.qualitativeInsight.context.dwellSeconds.toFixed(1)}s`
        : `${Math.max(2, dwellBase + hashMetric(`${seed}:dwell`, -2, 5)).toFixed(0)}s`,
    },
    {
      label: 'Recall',
      value: `${Math.min(94, 42 + hashMetric(`${seed}:recall`, 0, 28) + (hasThought ? 10 : 0))}%`,
    },
    {
      label: 'Fast read',
      value: `${Math.min(98, 50 + hashMetric(`${seed}:fast`, 0, 24) + fastReadBoost)}%`,
    },
  ]
}

function formatFailureMode(value: string): string {
  return value.replace(/_/g, ' ')
}

function createPolaroidItem(index: number): PolaroidItem {
  const palette = palettes[index % palettes.length]

  return {
    id: `polaroid-${index}`,
    username: usernames[index % usernames.length],
    text: textSnippets[index % textSnippets.length],
    rotation: ((index * 7) % 17) - 8,
    shift: ((index * 19) % 44) - 18,
    reverse: index % 2 === 1,
    size: sizeVariants[index % sizeVariants.length],
    colors: palette,
    avatar: palette[(index + 1) % palette.length],
  }
}

function PolaroidCard({ item }: { item: PolaroidItem }) {
  const cardStyle = {
    '--polaroid-rotation': `${item.rotation}deg`,
    '--polaroid-shift': `${item.shift}px`,
    '--photo-a': item.colors[0],
    '--photo-b': item.colors[1],
    '--photo-c': item.colors[2],
    '--avatar-color': item.avatar,
  } as CSSProperties

  return (
    <figure className={`polaroid-card is-${item.size}`} style={cardStyle}>
      <div className="polaroid-photo" aria-hidden="true">
        <span />
      </div>
      <figcaption className="polaroid-meta">
        <span className="polaroid-avatar" aria-hidden="true" />
        <strong>{item.username}</strong>
      </figcaption>
    </figure>
  )
}

function TextStack({ item }: { item: PolaroidItem }) {
  return (
    <div className="polaroid-copy">
      {item.text.map((line, lineIndex) => (
        <p className={`polaroid-copy__line line-${lineIndex + 1}`} key={`${item.id}-${line}`}>
          {line}
        </p>
      ))}
    </div>
  )
}

function LivePolaroidRow({
  capture,
  index,
  onSelectAgent,
  isSelected,
}: {
  capture: AgentCapture
  index: number
  onSelectAgent?: (capture: AgentCapture) => void
  isSelected?: boolean
}) {
  const reverse = index % 2 === 1
  const rotation = ((index * 11) % 11) - 5
  const shift = ((index * 13) % 20) - 10
  const palette = palettes[index % palettes.length]
  const [showPhotoreal, setShowPhotoreal] = useState(false)
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null)

  const cardStyle = {
    '--polaroid-rotation': `${rotation}deg`,
    '--polaroid-shift': `${shift}px`,
    '--photo-a': palette[0],
    '--photo-b': palette[1],
    '--photo-c': palette[2],
    '--avatar-color': '#4991FF',
  } as CSSProperties

  // Determine which image to display
  const baseUrl = failedImageUrl === capture.imageUrl && capture.fallbackImageUrl
    ? capture.fallbackImageUrl
    : capture.imageUrl
  const displayUrl = showPhotoreal && capture.photorealImageUrl
    ? capture.photorealImageUrl
    : baseUrl

  const analysis = capture.photorealAnalysis?.result
  const overlay = !showPhotoreal ? capture.billboardOverlay : undefined
  const showStreetViewEmbed = !showPhotoreal &&
    !!capture.streetViewEmbedUrl &&
    !!capture.fallbackImageUrl &&
    displayUrl === capture.fallbackImageUrl
  const metrics = metricsForCapture(capture)
  const insight = capture.qualitativeInsight

  return (
    <article className={`polaroid-row${reverse ? ' is-reversed' : ''}`}>
      <div className="polaroid-copy">
        {capture.thought == null ? (
          <p className="polaroid-copy__line line-1" style={{ opacity: 0.45, fontStyle: 'italic' }}>thinking…</p>
        ) : (
          <p className="polaroid-copy__line line-1">{capture.thought}</p>
        )}
        <p className="polaroid-copy__line line-2" style={{ opacity: 0.6 }}>{capture.billboardName}</p>
        {insight && (
          <div className="polaroid-evidence" aria-label={`${capture.agentName} qualitative evidence`}>
            <div>
              <span>First noticed</span>
              <strong>{insight.firstNoticed}</strong>
            </div>
            <div>
              <span>Missed</span>
              <strong>{insight.missed}</strong>
            </div>
            <div>
              <span>Fix</span>
              <strong>{insight.creativeFix}</strong>
            </div>
            <p>
              <span>{formatFailureMode(insight.failureMode)}</span>
              <span>{insight.evidenceTag.replace(/_/g, ' ')}</span>
              <span>{insight.context.mode}</span>
            </p>
          </div>
        )}
        <div className="polaroid-metrics" aria-label={`${capture.agentName} observation metrics`}>
          {metrics.map(metric => (
            <div className="polaroid-metric" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </div>
          ))}
        </div>

        {/* Photoreal status / toggle */}
        {capture.photorealPending && (
          <p className="polaroid-copy__line line-3" style={{ opacity: 0.5, fontSize: 9, fontStyle: 'italic', marginTop: 4 }}>
            ⧗ rendering photoreal…
          </p>
        )}
        {capture.photorealError && (
          <p className="polaroid-copy__line line-3" style={{ opacity: 0.55, fontSize: 9, color: '#D02020', marginTop: 4 }}>
            render failed
          </p>
        )}
        {capture.photorealImageUrl && !capture.photorealPending && (
          <button
            type="button"
            onClick={() => setShowPhotoreal(v => !v)}
            style={{
              marginTop: 6,
              background: showPhotoreal ? '#009E73' : 'rgba(0,158,115,0.15)',
              border: '1.5px solid #009E73',
              color: showPhotoreal ? '#000' : '#009E73',
              fontSize: 8,
              fontWeight: 900,
              letterSpacing: '0.1em',
              padding: '2px 8px',
              cursor: 'pointer',
              textTransform: 'uppercase',
            }}
          >
            {showPhotoreal ? 'PHOTOREAL ✓' : 'VIEW PHOTOREAL'}
          </button>
        )}

        {/* Inline AI analysis from the photoreal composite */}
        {showPhotoreal && analysis && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: '0.1em', color: '#009E73', textTransform: 'uppercase' }}>
              AI Analysis
            </div>
            {[
              { label: 'Scene', value: analysis.sceneDescription },
              { label: 'Ad', value: analysis.adDescription },
              { label: 'Impression', value: analysis.firstImpression },
              { label: 'Attention', value: analysis.likelyAttention },
              { label: 'Confusion', value: analysis.likelyConfusion },
              { label: 'Rec.', value: analysis.simpleRecommendation },
            ].map(({ label, value }) => (
              <div key={label} style={{ fontSize: 8, lineHeight: 1.4 }}>
                <span style={{ fontWeight: 900, color: 'rgba(255,255,255,0.6)', marginRight: 4 }}>{label}:</span>
                <span style={{ color: 'rgba(255,255,255,0.85)' }}>{value}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <figure className="polaroid-card is-standard" style={cardStyle}>
        <div className={displayUrl ? 'polaroid-photo polaroid-photo--live' : 'polaroid-photo'} aria-hidden="true">
          {displayUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={displayUrl}
              alt=""
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
              onError={() => {
                // Street View returned no panorama within the search radius — fall back to Mapbox.
                if (failedImageUrl !== capture.imageUrl && displayUrl === capture.imageUrl && capture.fallbackImageUrl) {
                  const failed = capture.imageUrl
                  console.warn('[street-view] static image failed to load:', failed)
                  // Re-fetch the failing URL to surface Google's actual error body.
                  fetch(failed)
                    .then(async r => {
                      const body = await r.text().catch(() => '')
                      console.warn('[street-view] static endpoint response:', r.status, body.slice(0, 400))
                    })
                    .catch(err => console.warn('[street-view] re-fetch threw:', err))
                  setFailedImageUrl(failed)
                }
              }}
            />
          ) : (
            <span />
          )}
          {showStreetViewEmbed && (
            <iframe
              key={capture.streetViewEmbedUrl}
              src={capture.streetViewEmbedUrl}
              title=""
              aria-hidden="true"
              tabIndex={-1}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                border: 'none',
                pointerEvents: 'none',
              }}
              referrerPolicy="no-referrer-when-downgrade"
            />
          )}
          {overlay && (
            <div
              style={{
                position: 'absolute',
                left: `${overlay.x * 100}%`,
                top: `${overlay.y * 100}%`,
                width: `${overlay.width * 100}%`,
                height: `${overlay.height * 100}%`,
                transform: `translate(-50%, -50%) rotate(${overlay.rotate}deg) skewY(${overlay.skew}deg)`,
                transformOrigin: '50% 50%',
                border: '2px solid rgba(10,10,10,0.72)',
                boxShadow: '0 8px 20px rgba(0,0,0,0.45), inset 0 0 0 2px rgba(255,255,255,0.12)',
                overflow: 'hidden',
                background: overlay.secondaryColor,
                filter: 'brightness(0.9) contrast(1.08) saturate(0.9)',
              }}
            >
              {overlay.mediaUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={overlay.mediaUrl}
                  alt=""
                  style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    padding: 6,
                    background: `linear-gradient(135deg, ${overlay.secondaryColor}, ${overlay.primaryColor})`,
                    color: '#f8f4e7',
                    fontSize: 9,
                    fontWeight: 900,
                    lineHeight: 1,
                    textTransform: 'uppercase',
                    overflow: 'hidden',
                  }}
                >
                  {overlay.creativeText}
                </div>
              )}
            </div>
          )}
          {/* Photoreal badge */}
          {showPhotoreal && capture.photorealImageUrl && (
            <div style={{
              position: 'absolute', bottom: 4, left: 4,
              background: 'rgba(0,158,115,0.9)',
              color: '#000',
              fontSize: 7, fontWeight: 900, letterSpacing: '0.1em',
              padding: '1px 5px',
              textTransform: 'uppercase',
            }}>
              PHOTOREAL
            </div>
          )}
        </div>
        <figcaption className="polaroid-meta">
          <span className="polaroid-avatar polaroid-avatar--kind" aria-hidden="true">
            {agentKindIcon(capture.agentKind)}
          </span>
          {onSelectAgent ? (
            <button
              type="button"
              className={`polaroid-username-btn${isSelected ? ' is-selected' : ''}`}
              onClick={() => onSelectAgent(capture)}
              aria-label={`Load ${capture.agentName}, ${agentKindLabel(capture.agentKind)}, profile`}
            >
              <strong>{capture.agentName}</strong>
              <span className="polaroid-kind-label">{agentKindLabel(capture.agentKind)}</span>
            </button>
          ) : (
            <span className="polaroid-name-stack">
              <strong>{capture.agentName}</strong>
              <span className="polaroid-kind-label">{agentKindLabel(capture.agentKind)}</span>
            </span>
          )}
        </figcaption>
      </figure>
    </article>
  )
}

export default function PolaroidStream({
  className = '',
  scrollRootRef,
  liveCaptures = [],
  includePlaceholderItems = true,
  onSelectAgent,
  selectedAgentId,
}: {
  className?: string
  scrollRootRef?: RefObject<HTMLElement | null>
  liveCaptures?: AgentCapture[]
  includePlaceholderItems?: boolean
  onSelectAgent?: (capture: AgentCapture) => void
  selectedAgentId?: string | null
}) {
  const [itemCount, setItemCount] = useState(INITIAL_ITEMS)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const loadingRef = useRef(false)
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const items = useMemo(
    () => includePlaceholderItems ? Array.from({ length: itemCount }, (_, index) => createPolaroidItem(index)) : [],
    [includePlaceholderItems, itemCount]
  )

  useEffect(() => {
    if (!includePlaceholderItems) {
      return undefined
    }

    const sentinel = sentinelRef.current

    if (!sentinel) {
      return undefined
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || loadingRef.current) {
          return
        }

        loadingRef.current = true
        setItemCount((current) => current + LOAD_MORE_COUNT)

        loadingTimerRef.current = setTimeout(() => {
          loadingRef.current = false
        }, 180)
      },
      {
        root: scrollRootRef?.current ?? null,
        rootMargin: '560px 0px',
        threshold: 0,
      }
    )

    observer.observe(sentinel)

    return () => {
      observer.disconnect()

      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current)
      }
    }
  }, [includePlaceholderItems, scrollRootRef])

  return (
    <section className={`polaroids-stream ${className}`} aria-label="Polaroid stream">
      {liveCaptures.map((capture, i) => (
        <LivePolaroidRow
          key={capture.id}
          capture={capture}
          index={i}
          onSelectAgent={onSelectAgent}
          isSelected={selectedAgentId === capture.id}
        />
      ))}
      {items.map((item) => (
        <article className={`polaroid-row ${item.reverse ? 'is-reversed' : ''}`} key={item.id}>
          <TextStack item={item} />
          <PolaroidCard item={item} />
        </article>
      ))}

      {includePlaceholderItems && <div className="polaroids-sentinel" ref={sentinelRef} aria-hidden="true" />}
    </section>
  )
}
