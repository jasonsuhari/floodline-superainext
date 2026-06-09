'use client'

import { useState } from 'react'
import type { FloodInterventionKind, FloodScenarioResult, PlannerIntervention, LatLng } from '@/types'

interface Props {
  scenario: FloodScenarioResult | null
  selectedKind: FloodInterventionKind
  onSelectedKindChange: (kind: FloodInterventionKind) => void
  onStart: () => void
  onReset: () => void
  onSpawnProcedural?: (count: number) => void
  interventions: PlannerIntervention[]
  hasSelectedArea: boolean
  selectedArea: LatLng | null
  buildingsReady?: boolean
}

export default function FloodActionBar({
  scenario,
  onStart,
  onReset,
  onSpawnProcedural,
  interventions,
  hasSelectedArea,
  selectedArea,
  buildingsReady = true,
}: Props) {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)

  const running = scenario?.phase === 'running'
  const complete = scenario?.phase === 'complete'

  const handleGeneratePdf = async () => {
    if (!scenario || isGeneratingPdf) return
    setIsGeneratingPdf(true)
    try {
      const response = await fetch('/api/generate-city-plan-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Singapore City Flood Replanning Brief',
          districtName: 'Singapore Focus Area',
          preparedFor: 'Urban Resilience Planning Team',
          preparedBy: 'Faultline Intelligence',
          generatedAt: new Date().toISOString(),
          scenarioLabel: '24-minute pluvial flood simulation',
          areaCenter: selectedArea ?? { lat: 1.30423, lng: 103.83178 },
          radiusKm: 1,
          scenario,
        }),
      })
      if (!response.ok) throw new Error('Failed to generate PDF')
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'singapore-flood-replanning-brief.pdf'
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('PDF Generation Error:', error)
      alert('Failed to generate PDF report. Please try again.')
    } finally {
      setIsGeneratingPdf(false)
    }
  }

  const rainLabel = complete ? 'Replay rain' : running ? 'Raining…' : 'Start rain'

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        left: 140,
        zIndex: 40,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 10,
      }}
      role="toolbar"
      aria-label="Flood simulation controls"
    >
      <ActionButton
        label={rainLabel}
        disabled={!hasSelectedArea || !buildingsReady || running}
        onClick={onStart}
        active={running}
        activeColor="#2bb8d8"
      >
        <RainIcon />
      </ActionButton>

      {onSpawnProcedural && (
        <ActionButton
          label="Auto-deploy 8×"
          disabled={!hasSelectedArea || !buildingsReady || running}
          onClick={() => onSpawnProcedural(8)}
        >
          <AutoDeployIcon />
        </ActionButton>
      )}

      <ActionButton
        label="Reset"
        disabled={!scenario && interventions.length === 0}
        onClick={onReset}
      >
        <ResetIcon />
      </ActionButton>

      {complete && (
        <ActionButton
          label={isGeneratingPdf ? 'Generating…' : 'PDF Brief'}
          disabled={isGeneratingPdf}
          onClick={handleGeneratePdf}
          activeColor="#2bb8d8"
        >
          <PdfIcon />
        </ActionButton>
      )}
    </div>
  )
}

// ── Action FAB button ─────────────────────────────────────────────────────────

interface ActionButtonProps {
  label: string
  active?: boolean
  activeColor?: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}

function ActionButton({ label, active = false, activeColor = '#F0F0F0', disabled, onClick, children }: ActionButtonProps) {
  const [hovered, setHovered] = useState(false)
  const fg = active ? '#031015' : '#121212'
  const bg = active ? activeColor : '#F0F0F0'
  const shadow = active ? '2px 2px 0 #121212' : '4px 4px 0 #121212'
  const translate = active ? 'translate(2px, 2px)' : 'translate(0, 0)'

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      {hovered && (
        <div style={{
          position: 'absolute',
          bottom: 'calc(100% + 10px)',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#121212',
          color: '#F0F0F0',
          fontSize: 12,
          fontFamily: 'monospace',
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          padding: '4px 8px',
          border: '2px solid #F0F0F0',
          pointerEvents: 'none',
          zIndex: 50,
        }}>
          {label}
        </div>
      )}
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: 52,
          height: 52,
          border: '3px solid #121212',
          borderRadius: 0,
          background: bg,
          color: fg,
          boxShadow: shadow,
          transform: translate,
          transition: 'transform 0.08s, box-shadow 0.08s, background 0.1s',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.3 : 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          flexShrink: 0,
        }}
      >
        {children}
      </button>
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function RainIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 19a5 5 0 0 1-.46-9.97A7 7 0 1 1 18.92 14H18a4 4 0 0 1 0 8H6a4 4 0 0 1 0-8Z" fillOpacity={0} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
      <line x1="8" y1="19" x2="7" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="square"/>
      <line x1="12" y1="19" x2="11" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="square"/>
      <line x1="16" y1="19" x2="15" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="square"/>
    </svg>
  )
}

function AutoDeployIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="5" r="2"/>
      <circle cx="12" cy="5" r="2"/>
      <circle cx="19" cy="5" r="2"/>
      <circle cx="5" cy="12" r="2"/>
      <circle cx="12" cy="12" r="2"/>
      <circle cx="19" cy="12" r="2"/>
      <circle cx="5" cy="19" r="2"/>
      <circle cx="12" cy="19" r="2"/>
      <path d="M17 19l2-2 2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="square" fill="none"/>
      <line x1="19" y1="17" x2="19" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="square"/>
    </svg>
  )
}

function ResetIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8"/>
      <polyline points="3 3 3 8 8 8"/>
    </svg>
  )
}

function PdfIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="8" y1="13" x2="16" y2="13"/>
      <line x1="8" y1="17" x2="16" y2="17"/>
    </svg>
  )
}
