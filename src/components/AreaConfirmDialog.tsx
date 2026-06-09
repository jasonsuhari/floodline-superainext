'use client'

interface Props {
  billboardCount: number
  radiusKm: number
  allowEmpty?: boolean
  countLabel?: string
  emptyMessage?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function AreaConfirmDialog({
  billboardCount,
  radiusKm,
  allowEmpty = false,
  countLabel = 'Billboards',
  emptyMessage = 'Area must include at least one billboard.',
  onConfirm,
  onCancel,
}: Props) {
  const canConfirm = allowEmpty || billboardCount > 0

  return (
    <div
      style={{
        position: 'fixed',
        right: '32px',
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 1000,
        width: '240px',
        background: '#F0F0F0',
        border: '4px solid #121212',
        boxShadow: '5px 5px 0 0 #121212',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        fontFamily: 'var(--font-outfit, Outfit, system-ui, sans-serif)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ width: '10px', height: '10px', background: '#D02020', border: '2px solid #121212', flexShrink: 0 }} />
        <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#121212' }}>
          Confirm selection
        </span>
      </div>

      {/* Divider */}
      <div style={{ height: '3px', background: '#121212' }} />

      {/* Stats */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#121212', opacity: 0.45 }}>Radius</span>
          <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#121212' }}>{radiusKm > 0 ? `${radiusKm} km` : 'Lasso Custom'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#121212', opacity: 0.45 }}>{countLabel}</span>
          <span style={{ fontSize: '1.6rem', fontWeight: 900, color: canConfirm ? '#D02020' : '#777', lineHeight: 1 }}>{billboardCount.toLocaleString()}</span>
        </div>
      </div>

      {/* Sub-label */}
      <p style={{ margin: 0, fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.05em', color: '#121212', opacity: 0.4, textTransform: 'uppercase' }}>
        {canConfirm ? 'Apply focus blur to this area?' : emptyMessage}
      </p>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
        <button
          onClick={onCancel}
          style={{
            flex: 1,
            padding: '9px 0',
            background: '#fff',
            border: '3px solid #121212',
            boxShadow: '2px 2px 0 0 #121212',
            fontSize: '0.6rem',
            fontWeight: 700,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: '#121212',
            cursor: 'pointer',
            transition: 'transform 0.08s, box-shadow 0.08s',
          }}
          onMouseDown={e => { (e.currentTarget.style.transform = 'translate(2px,2px)'); (e.currentTarget.style.boxShadow = 'none') }}
          onMouseUp={e => { (e.currentTarget.style.transform = ''); (e.currentTarget.style.boxShadow = '2px 2px 0 0 #121212') }}
          onMouseLeave={e => { (e.currentTarget.style.transform = ''); (e.currentTarget.style.boxShadow = '2px 2px 0 0 #121212') }}
        >
          Cancel
        </button>
        <button
          disabled={!canConfirm}
          onClick={onConfirm}
          style={{
            flex: 1,
            padding: '9px 0',
            background: canConfirm ? '#D02020' : '#777',
            border: '3px solid #121212',
            boxShadow: '2px 2px 0 0 #121212',
            fontSize: '0.6rem',
            fontWeight: 700,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: '#fff',
            cursor: canConfirm ? 'pointer' : 'not-allowed',
            opacity: canConfirm ? 1 : 0.65,
            transition: 'transform 0.08s, box-shadow 0.08s',
          }}
          onMouseDown={e => { if (canConfirm) { (e.currentTarget.style.transform = 'translate(2px,2px)'); (e.currentTarget.style.boxShadow = 'none') } }}
          onMouseUp={e => { if (canConfirm) { (e.currentTarget.style.transform = ''); (e.currentTarget.style.boxShadow = '2px 2px 0 0 #121212') } }}
          onMouseLeave={e => { if (canConfirm) { (e.currentTarget.style.transform = ''); (e.currentTarget.style.boxShadow = '2px 2px 0 0 #121212') } }}
        >
          Apply
        </button>
      </div>
    </div>
  )
}
