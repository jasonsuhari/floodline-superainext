'use client'

import type { FloodScenarioResult } from '@/types'

interface Props {
  scenario: FloodScenarioResult | null
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`
  return `$${n}`
}

const DASH = '—'

export default function FloodMetricsBar({ scenario }: Props) {
  const cells = scenario?.cells ?? []
  const summary = scenario?.summary ?? null
  const hasData = cells.length > 0

  const floodedCells = cells.filter(c => c.depthM > 0.05)
  const peakDepthM = floodedCells.length > 0
    ? Math.max(...floodedCells.map(c => c.depthM))
    : null
  const inundationPct = cells.length > 0
    ? Math.round((floodedCells.length / cells.length) * 100)
    : null
  const arrivalMin = floodedCells.length > 0
    ? Math.min(...floodedCells.map(c => c.arrivalMinute))
    : null

  const depthColor =
    peakDepthM == null ? 'text-slate-100'
    : peakDepthM >= 0.6 ? 'text-rose-400'
    : peakDepthM >= 0.3 ? 'text-amber-400'
    : 'text-emerald-400'

  type Metric = {
    label: string
    value: string
    valueClass?: string
    sub?: string
  }

  const metrics: Metric[] = [
    {
      label: 'Peak Depth',
      value: peakDepthM != null ? `${peakDepthM.toFixed(2)} m` : DASH,
      valueClass: depthColor,
      sub: peakDepthM != null
        ? peakDepthM >= 0.6 ? 'vehicle hazard'
        : peakDepthM >= 0.3 ? 'walking hazard'
        : 'safe level'
        : undefined,
    },
    {
      label: 'Inundated',
      value: inundationPct != null ? `${inundationPct}%` : DASH,
      sub: inundationPct != null ? `of selected area` : undefined,
    },
    {
      label: 'People at Risk',
      value: summary ? summary.affectedPeople.toLocaleString() : DASH,
      sub: summary ? `${summary.exposedIndoorPeople.toLocaleString()} indoors` : undefined,
    },
    {
      label: 'Vulnerable Pop',
      value: summary ? summary.vulnerablePeople.toLocaleString() : DASH,
      valueClass: summary && summary.vulnerablePeople > 0 ? 'text-amber-400' : 'text-slate-100',
      sub: summary ? `medical · schools · elderly` : undefined,
    },
    {
      label: 'Flood Arrival',
      value: arrivalMin != null ? `${arrivalMin} min` : DASH,
      sub: arrivalMin != null ? 'response window' : undefined,
    },
    {
      label: 'Est. Damage',
      value: summary ? fmtMoney(summary.estimatedDamageUsd) : DASH,
      valueClass: summary && summary.estimatedDamageUsd > 0 ? 'text-rose-400' : 'text-slate-100',
      sub: summary ? `${summary.affectedBuildings} bldgs · ${summary.mobilityLossPct}% mobility loss` : undefined,
    },
  ]

  return (
    <div
      className="fixed bottom-0 left-1/2 -translate-x-1/2 z-[1500] pointer-events-none select-none animate-slide-up"
      style={{ filter: 'drop-shadow(0 -4px 24px rgba(0,0,0,0.55))' }}
    >
      <div
        className="bg-slate-950/92 border-t-2 border-cyan-500/70 backdrop-blur-md flex items-stretch divide-x divide-slate-800/80"
        style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }}
      >
        {/* Status pill */}
        <div className="flex flex-col items-center justify-center px-5 py-3 gap-1 min-w-[80px]">
          <div className={`w-2 h-2 rounded-full ${hasData ? 'bg-cyan-400' : 'bg-slate-600'} ${hasData ? 'shadow-[0_0_6px_rgba(34,211,238,0.8)]' : ''}`} />
          <span className="text-[8px] font-black tracking-[0.16em] uppercase text-slate-500">
            {hasData ? 'live' : 'pending'}
          </span>
        </div>

        {/* Metric columns */}
        {metrics.map(m => (
          <div key={m.label} className="flex flex-col justify-center px-5 py-3 min-w-[110px]">
            <span className="text-[9px] font-bold tracking-[0.1em] uppercase text-slate-500 whitespace-nowrap">
              {m.label}
            </span>
            <span className={`text-[17px] font-extrabold tracking-tight leading-none mt-1 whitespace-nowrap ${m.valueClass ?? 'text-slate-100'}`}>
              {m.value}
            </span>
            {m.sub && (
              <span className="text-[9px] text-slate-600 mt-0.5 whitespace-nowrap font-medium">
                {m.sub}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
