'use client'

import { useState } from 'react'
import type { FloodInterventionKind, FloodScenarioResult, PlannerIntervention, LatLng } from '@/types'

const INTERVENTION_OPTIONS: Array<{ kind: FloodInterventionKind; label: string; detail: string }> = [
  { kind: 'flood-barrier', label: 'Barrier', detail: 'Blocks shallow overland flow near exposed blocks.' },
  { kind: 'retention-pond', label: 'Retention', detail: 'Adds local storage and reduces peak depth.' },
  { kind: 'green-corridor', label: 'Green corridor', detail: 'Absorbs runoff along pedestrian corridors.' },
  { kind: 'elevated-road', label: 'Raised road', detail: 'Protects a mobility spine.' },
  { kind: 'shelter-node', label: 'Shelter', detail: 'Improves vertical refuge and evacuation confidence.' },
  { kind: 'protected-route', label: 'Protected route', detail: 'Keeps a path usable during shallow flooding.' },
]

function formatMoney(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${Math.round(value / 1_000)}k`
  return `$${value}`
}

function deltaText(base: number, improved: number | null | undefined, suffix = ''): string {
  if (improved == null) return 'pending'
  const delta = base - improved
  if (delta === 0) return `no change${suffix}`
  return `${delta > 0 ? '-' : '+'}${Math.abs(delta).toLocaleString()}${suffix}`
}

function phaseLabel(result: FloodScenarioResult | null): string {
  if (!result || result.phase === 'idle') return 'Ready'
  if (result.phase === 'running') {
    const min = Math.round(result.elapsedMinute)
    if (min <= 24) {
      return `Rain & Flooding: ${min} min`
    } else {
      return `Water dispersing: ${48 - min} min left`
    }
  }
  return 'Impact analysis complete'
}

interface Props {
  scenario: FloodScenarioResult | null
  selectedKind: FloodInterventionKind
  onSelectedKindChange: (kind: FloodInterventionKind) => void
  onStart: () => void
  onReset: () => void
  onApplyRecommended: () => void
  onSpawnProcedural?: (count: number) => void
  interventions: PlannerIntervention[]
  hasSelectedArea: boolean
  selectedArea: LatLng | null
  buildingsReady?: boolean
}

export default function FloodPlannerPanel({
  scenario,
  selectedKind,
  onSelectedKindChange,
  onStart,
  onReset,
  onApplyRecommended,
  onSpawnProcedural,
  interventions,
  hasSelectedArea,
  selectedArea,
  buildingsReady = true,
}: Props) {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)

  const handleGeneratePdf = async () => {
    if (!scenario || isGeneratingPdf) return
    setIsGeneratingPdf(true)
    try {
      const response = await fetch('/api/generate-city-plan-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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

      if (!response.ok) {
        throw new Error('Failed to generate PDF')
      }

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
  const summary = scenario?.summary ?? null
  const improved = scenario?.improvedSummary ?? null
  const topZone = scenario?.priorityZones[0] ?? null
  const running = scenario?.phase === 'running'
  const complete = scenario?.phase === 'complete'

  return (
    <aside className="flood-panel" aria-label="Flood replanning cockpit">
      <header className="flood-panel__header">
        <div>
          <span>FloodSight</span>
          <h2>City Replanner</h2>
        </div>
        <strong>{phaseLabel(scenario)}</strong>
      </header>

      {!hasSelectedArea && (
        <div className="flood-panel__empty">
          Click a highlighted flood zone to preview it, then click again to select it and run the simulation.
        </div>
      )}

      {hasSelectedArea && !buildingsReady && (
        <div className="flood-panel__empty">
          Rendering buildings…
        </div>
      )}

      <div className="flood-panel__actions">
        <button type="button" onClick={onStart} disabled={!hasSelectedArea || !buildingsReady || running}>
          {complete ? 'Replay rain' : running ? 'Raining...' : hasSelectedArea && !buildingsReady ? 'Loading buildings…' : 'Start rain'}
        </button>
        {onSpawnProcedural && (
          <button type="button" onClick={() => onSpawnProcedural(8)} disabled={!hasSelectedArea || !buildingsReady || running} title="Procedurally spawn 8 interventions of the selected type along roads, avoiding buildings.">
            Auto-deploy 8x
          </button>
        )}
        <button type="button" onClick={onReset} disabled={!scenario && interventions.length === 0}>
          Reset
        </button>
      </div>

      {complete && scenario && (
        <div style={{ marginTop: '10px' }}>
          <button
            type="button"
            onClick={handleGeneratePdf}
            disabled={isGeneratingPdf}
            style={{
              width: '100%',
              minHeight: '38px',
              background: '#2bb8d8',
              color: '#031015',
              fontWeight: 900,
              border: '2px solid #05070a',
              boxShadow: '3px 3px 0 #05070a',
              cursor: isGeneratingPdf ? 'not-allowed' : 'pointer',
              opacity: isGeneratingPdf ? 0.7 : 1,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontSize: '11px',
            }}
          >
            {isGeneratingPdf ? 'Generating PDF...' : 'Download PDF brief'}
          </button>
        </div>
      )}



      {topZone && (
        <section className="flood-priority">
          <span>Top improvement area</span>
          <strong>{topZone.label}</strong>
          <p>{topZone.reason}</p>
          <button type="button" onClick={onApplyRecommended}>
            Place recommended fix
          </button>
        </section>
      )}

      <section className="flood-tools" aria-label="Intervention tools">
        <div className="flood-tools__head">
          <span>Intervention tool</span>
          <strong>{interventions.length} placed</strong>
        </div>
        <div className="flood-tools__grid">
          {INTERVENTION_OPTIONS.map(option => (
            <button
              key={option.kind}
              type="button"
              className={selectedKind === option.kind ? 'is-active' : ''}
              onClick={() => onSelectedKindChange(option.kind)}
              title={option.detail}
            >
              <span>{option.label}</span>
            </button>
          ))}
        </div>
        <p>Click inside the selected zone to place the active intervention and recalculate the before/after impact.</p>
      </section>

      {scenario && (
        <section className="flood-agents">
          <span>Indoor agent sample</span>
          <div>
            {scenario.indoorAgents.slice(0, 4).map(agent => (
              <article key={agent.id}>
                <strong>{agent.persona.role}</strong>
                <p>{agent.status.replace(/-/g, ' ')} from {agent.originBuildingName}. {agent.persona.summary}</p>
              </article>
            ))}
          </div>
        </section>
      )}
    </aside>
  )
}
