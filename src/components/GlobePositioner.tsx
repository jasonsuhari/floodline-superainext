'use client'

import { useState } from 'react'

export interface GlobeSettings {
  size: number    // vmin — actual canvas square (direct, no CSS scaling)
  zoom: number    // Mapbox zoom level — controls globe detail & apparent size
  centerX: number // vw  — globe-center X (100 = right edge, 110 = 10% past right)
  centerY: number // vh  — globe-center Y (100 = bottom edge)
}

export const DEFAULT_GLOBE: GlobeSettings = {
  size: 160,
  zoom: 3,
  centerX: 87.5,
  centerY: 88.5,
}

/** Inline style that positions the globe-area div. No CSS transform — avoids pixel-upscaling blur. */
export function globeStyle(s: GlobeSettings): React.CSSProperties {
  return {
    position: 'absolute',
    width: `${s.size}vmin`,
    height: `${s.size}vmin`,
    left: `calc(${s.centerX}vw - ${s.size / 2}vmin)`,
    top: `calc(${s.centerY}vh - ${s.size / 2}vmin)`,
    zIndex: 1,
  }
}

export function exportString(s: GlobeSettings) {
  return `size=${s.size}vmin zoom=${s.zoom} centerX=${s.centerX}vw centerY=${s.centerY}vh`
}

interface Props {
  settings: GlobeSettings
  onChange: (s: GlobeSettings) => void
}

const row: React.CSSProperties = { marginBottom: '0.55rem' }
const lbl: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', marginBottom: 2 }

export default function GlobePositioner({ settings: s, onChange }: Props) {
  const [copied, setCopied] = useState(false)
  const set = (patch: Partial<GlobeSettings>) => onChange({ ...s, ...patch })

  const copy = () => {
    navigator.clipboard.writeText(exportString(s))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{
      position: 'fixed', bottom: '1.25rem', left: '1.25rem', zIndex: 9999,
      width: 260, background: '#0e0e0e', border: '3px solid #D02020',
      boxShadow: '4px 4px 0 0 #D02020', padding: '1rem 1.1rem 0.85rem',
      fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#e8e8e8', userSelect: 'none',
    }}>
      <div style={{ fontWeight: 700, letterSpacing: '0.18em', color: '#F0C020', marginBottom: '0.8rem' }}>
        ◈ GLOBE POSITIONER
      </div>

      <div style={row}>
        <div style={lbl}><span>SIZE</span><span style={{ color: '#F0C020' }}>{s.size} vmin</span></div>
        <input type="range" min={80} max={220} step={1} value={s.size}
          onChange={e => set({ size: +e.target.value })}
          style={{ width: '100%', accentColor: '#D02020' }} />
      </div>

      <div style={row}>
        <div style={lbl}><span>ZOOM</span><span style={{ color: '#F0C020' }}>{s.zoom.toFixed(2)}</span></div>
        <input type="range" min={0.3} max={3.0} step={0.05} value={s.zoom}
          onChange={e => set({ zoom: +e.target.value })}
          style={{ width: '100%', accentColor: '#F0C020' }} />
      </div>

      <div style={row}>
        <div style={lbl}><span>CENTER X</span><span style={{ color: '#F0C020' }}>{s.centerX} vw</span></div>
        <input type="range" min={20} max={150} step={0.5} value={s.centerX}
          onChange={e => set({ centerX: +e.target.value })}
          style={{ width: '100%', accentColor: '#1040C0' }} />
      </div>

      <div style={row}>
        <div style={lbl}><span>CENTER Y</span><span style={{ color: '#F0C020' }}>{s.centerY} vh</span></div>
        <input type="range" min={20} max={150} step={0.5} value={s.centerY}
          onChange={e => set({ centerY: +e.target.value })}
          style={{ width: '100%', accentColor: '#1040C0' }} />
      </div>

      <div style={{ background: '#1a1a1a', padding: '0.4rem 0.5rem', margin: '0.3rem 0 0.5rem', color: '#aaa', fontSize: 10, lineHeight: 1.5, wordBreak: 'break-all' }}>
        {exportString(s)}
      </div>

      <button onClick={copy} style={{
        width: '100%', padding: '0.45rem', background: copied ? '#009E73' : '#D02020',
        color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700,
        fontFamily: 'inherit', letterSpacing: '0.12em', fontSize: 11, transition: 'background 0.18s',
      }}>
        {copied ? '✓ COPIED' : 'COPY VALUES'}
      </button>
    </div>
  )
}
