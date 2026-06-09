'use client'

import type { FloodScenarioResult } from '@/types'

interface Props {
  scenario: FloodScenarioResult | null
}

function formatMoney(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${Math.round(value / 1_000)}k`
  return `$${value}`
}

function deltaText(base: number, improved: number | null | undefined, suffix = ''): string {
  if (improved == null) return 'pending'
  const delta = base - improved
  if (delta === 0) return `0${suffix}`
  return `${delta > 0 ? '-' : '+'}${Math.abs(delta).toLocaleString()}${suffix}`
}

export default function MetricsDock({ scenario }: Props) {
  if (!scenario) return null

  const summary = scenario.summary
  const improved = scenario.improvedSummary

  const affectedPeopleDelta = improved ? summary.affectedPeople - improved.affectedPeople : 0
  const buildingsSaved = improved ? summary.affectedBuildings - improved.affectedBuildings : 0
  const damageAvoided = improved ? summary.estimatedDamageUsd - improved.estimatedDamageUsd : 0
  const scoreDelta = improved ? Math.max(0, improved.resilienceScore - summary.resilienceScore) : 0

  return (
    <div 
      className="w-full bg-slate-950/90 border-t-4 border-cyan-500/80 backdrop-blur-md px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 select-none animate-slide-up z-[2000] relative"
      style={{
        boxShadow: '0 -10px 25px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
      }}
    >
      {/* Resilience Score Section */}
      <div className="flex items-center gap-4 border-r border-slate-800 pr-6 min-w-[220px]">
        <div className="flex flex-col">
          <span className="text-xs text-cyan-400 font-black tracking-widest uppercase">Resilience Score</span>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-extrabold text-white tracking-tight">
              {improved?.resilienceScore ?? summary.resilienceScore}
            </span>
            <span className="text-xs text-slate-400">/ 100</span>
          </div>
        </div>
        {improved && scoreDelta > 0 && (
          <div className="bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 px-2 py-1 rounded text-xs font-bold flex items-center gap-1">
            ▲ +{scoreDelta} pts
          </div>
        )}
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1 px-4">
        {/* Affected People */}
        <div className="flex flex-col">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Affected People</span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-lg font-black text-slate-100">{summary.affectedPeople.toLocaleString()}</span>
            {improved && affectedPeopleDelta > 0 && (
              <span className="text-xs text-emerald-400 font-bold">-{affectedPeopleDelta.toLocaleString()} saved</span>
            )}
          </div>
        </div>

        {/* Buildings Hit */}
        <div className="flex flex-col">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Buildings Flooded</span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-lg font-black text-slate-100">{summary.affectedBuildings.toLocaleString()}</span>
            {improved && buildingsSaved > 0 && (
              <span className="text-xs text-emerald-400 font-bold">-{buildingsSaved.toLocaleString()} saved</span>
            )}
          </div>
        </div>

        {/* Mobility Loss */}
        <div className="flex flex-col">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Mobility Disruption</span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-lg font-black text-slate-100">{summary.mobilityLossPct}%</span>
            {improved && (
              <span className="text-xs text-emerald-400 font-bold">
                {deltaText(summary.mobilityLossPct, improved.mobilityLossPct, '%')}
              </span>
            )}
          </div>
        </div>

        {/* Estimated Damage */}
        <div className="flex flex-col">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Projected Damage Cost</span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-lg font-black text-rose-500">{formatMoney(summary.estimatedDamageUsd)}</span>
            {improved && damageAvoided > 0 && (
              <span className="text-xs text-emerald-400 font-bold">-{formatMoney(damageAvoided)} avoided</span>
            )}
          </div>
        </div>
      </div>

      {/* Active Interventions Status */}
      {improved && (
        <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded flex flex-col items-end min-w-[180px]">
          <span className="text-[9px] text-slate-500 font-extrabold uppercase tracking-wider">Replanning Status</span>
          <span className="text-xs font-black text-cyan-400 mt-0.5 animate-pulse">OPTIMIZED PLAN INSTALLED</span>
        </div>
      )}
    </div>
  )
}
