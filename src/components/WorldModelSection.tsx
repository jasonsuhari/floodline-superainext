'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getDepthAtLocation, depthToLabel } from '@/lib/worldModel'
import type { FloodScenarioResult, LatLng, PlannerIntervention } from '@/types'

interface Props {
  location: LatLng
  floodScenario: FloodScenarioResult | null
  interventions: PlannerIntervention[]
  googleMapsKey: string
}

type Status = 'idle' | 'loading' | 'done' | 'error'

function buildStaticUrl(location: LatLng, key: string): string {
  const { lat, lng } = location
  return `https://maps.googleapis.com/maps/api/streetview?size=832x480&location=${lat},${lng}&fov=80&pitch=0&key=${key}`
}

export default function WorldModelSection({ location, floodScenario, interventions, googleMapsKey }: Props) {
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<{ videoUrl: string; prompt: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showBase, setShowBase] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevInterventionCount = useRef(interventions.length)

  const cells = floodScenario?.improvedCells ?? floodScenario?.cells ?? []
  const depthM = getDepthAtLocation(cells, location)
  const hasIntervention = interventions.length > 0
  const depthLabel = depthToLabel(depthM)
  const isComplete = floodScenario?.phase === 'complete'

  const generate = useCallback(async () => {
    setStatus('loading')
    setError(null)
    setShowBase(false)

    const imageUrl = buildStaticUrl(location, googleMapsKey)

    try {
      const res = await fetch('/api/world-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl, depthM, hasIntervention }),
      })
      const data = await res.json() as { videoUrl?: string; prompt?: string; error?: string }
      if (!res.ok || !data.videoUrl) {
        throw new Error(data.error ?? 'Generation failed')
      }
      setResult({ videoUrl: data.videoUrl, prompt: data.prompt ?? '' })
      setStatus('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }, [location, depthM, hasIntervention, googleMapsKey])

  // Auto-regenerate when interventions are placed (debounced 2s)
  useEffect(() => {
    if (status !== 'done') return
    if (interventions.length === prevInterventionCount.current) return
    prevInterventionCount.current = interventions.length

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      generate()
    }, 2000)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [interventions.length, status, generate])

  const borderColor = '#009E73'

  return (
    <div
      style={{
        borderTop: `2px solid ${borderColor}`,
        padding: '10px',
        background: '#0a0e14',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: 9,
            letterSpacing: '0.12em',
            color: borderColor,
            textTransform: 'uppercase',
          }}
        >
          WORLD MODEL
        </span>
        {status === 'done' && (
          <button
            type="button"
            onClick={() => setShowBase(v => !v)}
            style={{
              fontFamily: 'monospace',
              fontSize: 8,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              background: 'none',
              border: `1px solid ${showBase ? '#888' : borderColor}`,
              color: showBase ? '#888' : borderColor,
              cursor: 'pointer',
              padding: '2px 6px',
            }}
          >
            {showBase ? 'BASE VIEW' : 'FLOOD VIEW'}
          </button>
        )}
      </div>

      {/* Depth info */}
      {isComplete && (
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 10,
            color: depthM < 0.01 ? '#4caf50' : depthM < 0.4 ? '#ff9800' : '#f44336',
            marginBottom: 8,
            letterSpacing: '0.04em',
          }}
        >
          {depthLabel}
          {hasIntervention && (
            <span style={{ color: '#2bb8d8', marginLeft: 6 }}>· with interventions</span>
          )}
        </div>
      )}

      {/* No sim yet */}
      {!isComplete && (
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 9,
            color: '#555',
            marginBottom: 8,
            letterSpacing: '0.04em',
          }}
        >
          Run simulation first to enable world model
        </div>
      )}

      {/* Generate button */}
      {isComplete && status !== 'loading' && (
        <button
          type="button"
          onClick={generate}
          style={{
            width: '100%',
            padding: '8px 0',
            background: status === 'done' ? '#0f1117' : borderColor,
            color: status === 'done' ? borderColor : '#031015',
            border: `2px solid ${borderColor}`,
            fontFamily: 'monospace',
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            marginBottom: status === 'done' ? 8 : 0,
          }}
        >
          {status === 'done' ? '↺ Regenerate' : '▶ Simulate World Model'}
        </button>
      )}

      {/* Loading */}
      {status === 'loading' && (
        <div
          style={{
            padding: '12px 0',
            textAlign: 'center',
            fontFamily: 'monospace',
            fontSize: 9,
            color: borderColor,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          <div style={{ marginBottom: 6, opacity: 0.6 }}>
            {interventions.length > 0 ? 'Replanning detected — re-simulating world…' : 'Rendering world model…'}
          </div>
          <LoadingBar />
        </div>
      )}

      {/* Error */}
      {status === 'error' && error && (
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 9,
            color: '#f44336',
            marginTop: 6,
            letterSpacing: '0.04em',
          }}
        >
          {error}
        </div>
      )}

      {/* Video result */}
      {status === 'done' && result && !showBase && (
        <div style={{ position: 'relative' }}>
          <video
            key={result.videoUrl}
            src={result.videoUrl}
            autoPlay
            loop
            muted
            playsInline
            controls
            style={{
              width: '100%',
              display: 'block',
              border: `2px solid ${borderColor}`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 4,
              left: 4,
              background: 'rgba(0,0,0,0.75)',
              color: borderColor,
              fontFamily: 'monospace',
              fontSize: 8,
              letterSpacing: '0.1em',
              padding: '2px 5px',
              textTransform: 'uppercase',
              pointerEvents: 'none',
            }}
          >
            WAN2.1 · SIMULATION
          </div>
        </div>
      )}

      {/* Base view */}
      {status === 'done' && showBase && (
        <div style={{ position: 'relative' }}>
          <img
            src={buildStaticUrl(location, googleMapsKey)}
            alt="Street view baseline"
            style={{
              width: '100%',
              display: 'block',
              border: '2px solid #444',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 4,
              left: 4,
              background: 'rgba(0,0,0,0.75)',
              color: '#888',
              fontFamily: 'monospace',
              fontSize: 8,
              letterSpacing: '0.1em',
              padding: '2px 5px',
              textTransform: 'uppercase',
              pointerEvents: 'none',
            }}
          >
            STREET VIEW · BASELINE
          </div>
        </div>
      )}
    </div>
  )
}

function LoadingBar() {
  return (
    <div
      style={{
        width: '100%',
        height: 2,
        background: '#1a2a1a',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '-40%',
          width: '40%',
          height: '100%',
          background: '#009E73',
          animation: 'worldmodel-slide 1.2s ease-in-out infinite',
        }}
      />
      <style>{`
        @keyframes worldmodel-slide {
          0% { left: -40%; }
          100% { left: 100%; }
        }
      `}</style>
    </div>
  )
}
