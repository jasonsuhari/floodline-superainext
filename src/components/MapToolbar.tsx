'use client'

import { useState } from 'react'

export type MapTool = 'builder' | 'place-bus-stop' | 'place-pedestrian' | 'agent-billboard-capture' | 'dashboard' | 'settings' | 'streetview' | 'flood-planner' | 'photoreal-test' | null

interface MapToolbarProps {
  activeTool: MapTool
  onToolChange: (tool: MapTool) => void
  dashboardEnabled?: boolean
}

const ACTIVE_COLOR: Record<string, string> = {
  dashboard:          '#1040C0',
  settings:           '#F0C020',
  streetview:         '#009E73',
  'photoreal-test':   '#009E73',
  'agent-billboard-capture': '#4991FF',
}

const LABEL: Record<string, string> = {
  dashboard:          'OOH Cockpit',
  settings:           'Scene Analysis',
  streetview:         'Street View',
  'photoreal-test':   'Photoreal Test',
  'agent-billboard-capture': 'Agent Billboard Shot',
}

export default function MapToolbar({ activeTool, onToolChange, dashboardEnabled }: MapToolbarProps) {
  const toggle = (tool: Exclude<MapTool, null>) => {
    onToolChange(activeTool === tool ? null : tool)
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        left: 16,
        zIndex: 40,
        display: 'flex',
        flexDirection: 'row',
        gap: 10,
      }}
      role="toolbar"
      aria-label="Map tools"
    >
      <ToolButton
        label={LABEL.streetview}
        active={activeTool === 'streetview'}
        activeColor={ACTIVE_COLOR.streetview}
        onClick={() => toggle('streetview')}
      >
        <StreetViewIcon />
      </ToolButton>

      <ToolButton
        label={LABEL.dashboard}
        active={activeTool === 'dashboard'}
        activeColor={ACTIVE_COLOR.dashboard}
        disabled={!dashboardEnabled}
        onClick={() => toggle('dashboard')}
      >
        <DashboardIcon />
      </ToolButton>

    </div>
  )
}

interface ToolButtonProps {
  label: string
  active: boolean
  activeColor: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}

function ToolButton({ label, active, activeColor, disabled, onClick, children }: ToolButtonProps) {
  const [hovered, setHovered] = useState(false)
  const isYellow = activeColor === '#F0C020'
  const fg = active ? (isYellow ? '#121212' : '#F0F0F0') : '#121212'
  const bg = active ? activeColor : '#F0F0F0'
  const shadow = active ? '2px 2px 0 #121212' : '4px 4px 0 #121212'
  const translate = active ? 'translate(2px, 2px)' : 'translate(0, 0)'

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      {hovered && (
        <div
          style={{
            position: 'absolute',
            left: 'calc(100% + 10px)',
            top: '50%',
            transform: 'translateY(-50%)',
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
          }}
        >
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

// ── Icons ────────────────────────────────────────────────────────────────────

function StreetViewIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="4" r="3" />
      <rect x="10" y="8" width="4" height="7" />
      <ellipse cx="12" cy="20" rx="6" ry="2.5" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <line x1="10" y1="15" x2="8.5" y2="18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" />
      <line x1="14" y1="15" x2="15.5" y2="18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" />
    </svg>
  )
}

function DashboardIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="3" y="3" width="8" height="8" />
      <rect x="13" y="3" width="8" height="8" />
      <rect x="3" y="13" width="8" height="8" />
      <rect x="13" y="13" width="8" height="8" />
    </svg>
  )
}
