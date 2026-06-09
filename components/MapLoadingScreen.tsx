'use client'

import Image from 'next/image'
import React, { useEffect, useState } from 'react'

export default function MapLoadingScreen({
  ready,
  progress,
  label,
}: {
  ready: boolean
  progress: number
  label: string
}) {
  const [minTimePassed, setMinTimePassed] = useState(false)
  const [hiding, setHiding] = useState(false)
  const [hidden, setHidden] = useState(false)
  const boundedProgress = Math.max(0, Math.min(100, Math.round(progress)))

  useEffect(() => {
    const t = setTimeout(() => setMinTimePassed(true), 1600)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!ready || !minTimePassed) return
    const t1 = setTimeout(() => setHiding(true), 250)
    const t2 = setTimeout(() => setHidden(true), 1000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [ready, minTimePassed])

  if (hidden) return null

  return (
    <div
      className="map-loading-screen"
      role="status"
      aria-live="polite"
      aria-label="Loading"
      style={{
        opacity: hiding ? 0 : 1,
        transition: 'opacity 0.75s cubic-bezier(0.4,0,0.2,1)',
        pointerEvents: hiding ? 'none' : 'all',
        zIndex: 9999,
      }}
    >
      <div className="map-loading-screen__copy">
        <Image className="map-loading-screen__logo" src="/logo.png" alt="Logo" width={200} height={60} priority />
        <span>{label || 'Loading map intelligence'}</span>
      </div>
      <div
        className="map-loading-screen__bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={boundedProgress}
      >
        <span />
      </div>
    </div>
  )
}
