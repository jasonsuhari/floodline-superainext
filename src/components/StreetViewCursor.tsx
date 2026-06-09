'use client'

interface StreetViewCursorProps {
  x: number
  y: number
}

export default function StreetViewCursor({ x, y }: StreetViewCursorProps) {
  return (
    <div
      style={{
        position: 'fixed',
        left: x,
        top: y,
        pointerEvents: 'none',
        zIndex: 60,
        transform: 'translate(-50%, -100%)',
      }}
    >
      {/* Two staggered pulse rings emanating from the pin base */}
      <div
        style={{
          position: 'absolute',
          bottom: -2,
          left: '50%',
          width: 20,
          height: 10,
          borderRadius: '50%',
          border: '2px solid #009E73',
          animation: 'sv-ring-pulse 1.6s ease-out infinite',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: -2,
          left: '50%',
          width: 20,
          height: 10,
          borderRadius: '50%',
          border: '2px solid #009E73',
          animation: 'sv-ring-pulse 1.6s ease-out infinite 0.8s',
        }}
      />

      {/* Pin */}
      <svg width="30" height="38" viewBox="0 0 30 38" fill="none" aria-hidden="true">
        <defs>
          <filter id="sv-pin-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Teardrop body */}
        <path
          d="M15 2C9.477 2 5 6.477 5 12c0 7.5 10 24 10 24S25 19.5 25 12C25 6.477 20.523 2 15 2Z"
          fill="#009E73"
          fillOpacity="0.82"
          stroke="#00FF9D"
          strokeWidth="1.5"
          filter="url(#sv-pin-glow)"
        />

        {/* Inner dot */}
        <circle cx="15" cy="12" r="4.5" fill="white" fillOpacity="0.92" />
      </svg>
    </div>
  )
}
