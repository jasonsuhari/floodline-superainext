'use client'

/**
 * PhotorealTestPanel
 *
 * A standalone test harness for the /api/photoreal-scene pipeline.
 * Lets you manually specify a street-view position, billboard metadata,
 * and a creative — then fires the full render + analysis without needing
 * any pedestrian agents on the map.
 *
 * Accessible via the toolbar "Photoreal Test" button (flask icon).
 */

import { useCallback, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { CompanyBrief, PhotorealSceneApiResponse, SceneResponseResult } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface FormState {
  // Street-view position
  lat: string
  lng: string
  heading: string
  pitch: string
  fov: string
  // Billboard metadata
  billboardName: string
  widthM: string
  heightM: string
  clearanceM: string
  distanceM: string
  creativeText: string
  // Brief / viewer profile
  brief: string
  viewerProfile: string
}

type RunState =
  | { status: 'idle' }
  | { status: 'fetching-scene' }
  | { status: 'generating-creative' }
  | { status: 'rendering' }
  | { status: 'analysing' }
  | { status: 'done'; photorealUrl: string; analysis: SceneResponseResult; rawSceneUrl: string }
  | { status: 'error'; message: string }

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_FORM: FormState = {
  lat: '1.3521',
  lng: '103.8198',
  heading: '180',
  pitch: '0',
  fov: '90',
  billboardName: 'Test Billboard',
  widthM: '14',
  heightM: '6',
  clearanceM: '3',
  distanceM: '30',
  creativeText: 'Move Better. GymCo.',
  brief: 'Evaluate billboard visibility and creative impact for a fitness brand.',
  viewerProfile: 'urban pedestrian with short dwell time and partial phone distraction',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Google Maps key is read from the environment variable injected by Next.js at build time.
// We keep this as a module-level constant so the Street View URL builder can access it.
const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ''

function buildStreetViewUrl(form: FormState): string {
  const key = GOOGLE_MAPS_KEY
  const params = new URLSearchParams({
    size: '640x400',
    location: `${form.lat},${form.lng}`,
    heading: form.heading,
    pitch: form.pitch,
    fov: form.fov,
    key,
    source: 'outdoor',
  })
  return `https://maps.googleapis.com/maps/api/streetview?${params}`
}

async function fetchAsDataUrl(url: string): Promise<string> {
  const res = await fetch(`/api/proxy-image?url=${encodeURIComponent(url)}`)
  if (!res.ok) throw new Error(`Could not fetch street-view image (${res.status})`)
  const contentType = res.headers.get('content-type') ?? 'image/jpeg'
  const mime = contentType.split(';')[0].trim()
  const buf = await res.arrayBuffer()
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
  return `data:${mime};base64,${b64}`
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

function buildCreativeBrief(form: FormState): CompanyBrief {
  const companyName = form.billboardName.trim() || 'Faultline Demo Brand'
  const message = form.creativeText.trim() || 'Own the moment'

  return {
    url: 'https://faultline.local/photoreal-test',
    identity: {
      companyName,
      industry: 'out-of-home advertising campaign',
      description: `${companyName} campaign creative for a premium urban billboard placement.`,
      brandAdjectives: ['bold', 'legible', 'urban'],
      tagline: message,
    },
    visualSystem: {
      primaryColor: '#009E73',
      secondaryColor: '#F0F0F0',
      styleReference: 'premium high-contrast out-of-home advertising, clean commercial photography, dramatic product focal point',
      avoidList: ['tiny text', 'cluttered layout', 'mobile app screenshot collage'],
    },
    campaign: {
      coreMessage: message,
      callToAction: message,
      campaignObjective: 'Be readable from a moving pedestrian viewpoint in under two seconds.',
    },
    audience: {
      description: 'urban pedestrians and commuters moving through a dense street environment',
      contextWhenSeen: 'short dwell time, partial phone distraction, outdoor glare and clutter',
    },
  }
}

async function generateCreativeDataUrl(form: FormState): Promise<string> {
  const widthM = parseFloat(form.widthM) || 14
  const heightM = parseFloat(form.heightM) || 6
  const promptOverride = [
    `Draw a billboard-ready OOH creative for ${form.billboardName || 'a city campaign'}.`,
    `Main message: ${form.creativeText || 'Own the moment'}.`,
    'Make it high contrast, premium, instantly readable, and built for a real street placement.',
    'Use one dominant visual idea, large simple headline space, and no tiny body copy.',
  ].join(' ')

  const res = await fetch('/api/generate-creative', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      brief: buildCreativeBrief(form),
      widthM,
      heightM,
      mode: 'image',
      promptOverride,
    }),
  })

  if (!res.ok) {
    const errData = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(errData.error ?? `Creative generation returned ${res.status}`)
  }

  const data = await res.json() as { url?: string; creatives?: Array<{ url?: string }> }
  const creativeUrl = data.url ?? data.creatives?.[0]?.url
  if (!creativeUrl) throw new Error('Creative generation did not return an image.')
  return creativeUrl
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', marginBottom: 3 }}>
      {children}
    </div>
  )
}

function Field({
  label,
  name,
  value,
  onChange,
  placeholder,
  type = 'text',
  half = false,
}: {
  label: string
  name: keyof FormState
  value: string
  onChange: (name: keyof FormState, value: string) => void
  placeholder?: string
  type?: string
  half?: boolean
}) {
  return (
    <div style={{ flex: half ? '1 1 calc(50% - 4px)' : '1 1 100%', minWidth: 0 }}>
      <Label>{label}</Label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(name, e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          background: 'rgba(255,255,255,0.06)',
          border: '1.5px solid rgba(255,255,255,0.15)',
          color: '#F0F0F0',
          fontSize: 10,
          fontFamily: 'monospace',
          fontWeight: 600,
          padding: '4px 7px',
          outline: 'none',
        }}
      />
    </div>
  )
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: '0.12em', color: '#009E73', textTransform: 'uppercase', borderBottom: '1px solid rgba(0,158,115,0.25)', paddingBottom: 4, marginBottom: 8 }}>
      {children}
    </div>
  )
}

function AnalysisRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 6, fontSize: 9, lineHeight: 1.5 }}>
      <span style={{ fontWeight: 900, color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap', minWidth: 80 }}>{label}</span>
      <span style={{ color: 'rgba(255,255,255,0.85)' }}>{value}</span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PhotorealTestPanel({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [creativeDataUrl, setCreativeDataUrl] = useState<string | null>(null)
  const [creativeFileName, setCreativeFileName] = useState<string | null>(null)
  const [generatedCreativeUrl, setGeneratedCreativeUrl] = useState<string | null>(null)
  const [runState, setRunState] = useState<RunState>({ status: 'idle' })
  const fileInputRef = useRef<HTMLInputElement>(null)

  const setField = useCallback((name: keyof FormState, value: string) => {
    setForm(prev => ({ ...prev, [name]: value }))
  }, [])

  const handleCreativeFile = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const dataUrl = await fileToDataUrl(file)
      setCreativeDataUrl(dataUrl)
      setCreativeFileName(file.name)
      setGeneratedCreativeUrl(null)
    } catch {
      setCreativeDataUrl(null)
      setCreativeFileName(null)
      setGeneratedCreativeUrl(null)
    }
  }, [])

  const handleRun = useCallback(async () => {
    setRunState({ status: 'fetching-scene' })

    try {
      // 1. Build and proxy the Street View URL
      const svUrl = buildStreetViewUrl(form)
      let sceneDataUrl: string
      try {
        sceneDataUrl = await fetchAsDataUrl(svUrl)
      } catch (err) {
        throw new Error(`Street View fetch failed: ${err instanceof Error ? err.message : String(err)}`)
      }

      let resolvedCreativeDataUrl = creativeDataUrl
      if (!resolvedCreativeDataUrl) {
        setRunState({ status: 'generating-creative' })
        resolvedCreativeDataUrl = await generateCreativeDataUrl(form)
        setGeneratedCreativeUrl(resolvedCreativeDataUrl)
        setCreativeDataUrl(resolvedCreativeDataUrl)
        setCreativeFileName('GPT Image 2 generated creative')
      }

      setRunState({ status: 'rendering' })

      // 2. Call /api/photoreal-scene
      const body: Record<string, unknown> = {
        sceneImage: { dataUrl: sceneDataUrl },
        billboard: {
          name: form.billboardName || 'Test Billboard',
          widthM: parseFloat(form.widthM) || 14,
          heightM: parseFloat(form.heightM) || 6,
          clearanceM: parseFloat(form.clearanceM) || 3,
          distanceM: parseFloat(form.distanceM) || 30,
          heading: parseFloat(form.heading) || 0,
          creativeText: form.creativeText || undefined,
          creativeDataUrl: resolvedCreativeDataUrl,
        },
        brief: form.brief || undefined,
        viewerProfile: form.viewerProfile || undefined,
      }

      const res = await fetch('/api/photoreal-scene', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })

      setRunState({ status: 'analysing' })

      if (!res.ok) {
        const errData = await res.json() as { error?: string }
        throw new Error(errData.error ?? `Server returned ${res.status}`)
      }

      const data = await res.json() as PhotorealSceneApiResponse

      setRunState({
        status: 'done',
        photorealUrl: data.photorealImageUrl,
        analysis: data.analysis.result,
        rawSceneUrl: sceneDataUrl,
      })
    } catch (err) {
      setRunState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }, [form, creativeDataUrl])

  const isRunning = runState.status === 'fetching-scene' || runState.status === 'generating-creative' || runState.status === 'rendering' || runState.status === 'analysing'

  const statusLabel: Record<RunState['status'], string> = {
    idle: 'Run Pipeline',
    'generating-creative': '2/4  Generating GPT Image creative...',
    'fetching-scene': '1/3  Fetching street view…',
    rendering: '3/4  Rendering photoreal composite...',
    analysing: '4/4  Analysing scene...',
    done: 'Run Again',
    error: 'Retry',
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Photoreal Pipeline Test"
        style={{
          width: 820,
          maxWidth: '96vw',
          maxHeight: '92vh',
          background: '#0e0e0e',
          border: '3px solid #F0F0F0',
          boxShadow: '8px 8px 0 #121212',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <header style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: '3px solid #F0F0F0',
          flexShrink: 0,
          background: '#121212',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: '#009E73', width: 8, height: 8, flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', color: '#F0F0F0', textTransform: 'uppercase' }}>
              Photoreal Pipeline Test
            </span>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.06em' }}>
              No pedestrian agents required
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}
          >
            ×
          </button>
        </header>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

          {/* Left: form */}
          <div style={{
            width: 300,
            flexShrink: 0,
            borderRight: '3px solid rgba(255,255,255,0.1)',
            overflowY: 'auto',
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}>

            {/* Street View Position */}
            <div>
              <SectionHead>Street View Position</SectionHead>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <Field label="Latitude" name="lat" value={form.lat} onChange={setField} placeholder="1.3521" half />
                <Field label="Longitude" name="lng" value={form.lng} onChange={setField} placeholder="103.8198" half />
                <Field label="Heading (°)" name="heading" value={form.heading} onChange={setField} placeholder="0–360" half />
                <Field label="Pitch (°)" name="pitch" value={form.pitch} onChange={setField} placeholder="-90–90" half />
                <Field label="FOV (°)" name="fov" value={form.fov} onChange={setField} placeholder="20–120" half />
              </div>
            </div>

            {/* Billboard Metadata */}
            <div>
              <SectionHead>Billboard Metadata</SectionHead>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <Field label="Name" name="billboardName" value={form.billboardName} onChange={setField} placeholder="My Billboard" />
                <Field label="Width (m)" name="widthM" value={form.widthM} onChange={setField} placeholder="14" half />
                <Field label="Height (m)" name="heightM" value={form.heightM} onChange={setField} placeholder="6" half />
                <Field label="Clearance (m)" name="clearanceM" value={form.clearanceM} onChange={setField} placeholder="3" half />
                <Field label="Distance (m)" name="distanceM" value={form.distanceM} onChange={setField} placeholder="30" half />
              </div>
            </div>

            {/* Creative */}
            <div>
              <SectionHead>Billboard Creative</SectionHead>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Field label="Creative text / tagline" name="creativeText" value={form.creativeText} onChange={setField} placeholder="Your tagline here" />

                <div>
                  <Label>Upload creative image (optional)</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleCreativeFile}
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      background: creativeDataUrl ? 'rgba(0,158,115,0.15)' : 'rgba(255,255,255,0.06)',
                      border: `1.5px solid ${creativeDataUrl ? '#009E73' : 'rgba(255,255,255,0.15)'}`,
                      color: creativeDataUrl ? '#009E73' : 'rgba(255,255,255,0.5)',
                      fontSize: 9,
                      fontWeight: 900,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    {creativeFileName ? `✓ ${creativeFileName}` : 'Choose PNG / JPEG / WebP…'}
                  </button>
                  {creativeDataUrl && (
                    <div style={{ marginTop: 6, position: 'relative' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={creativeDataUrl} alt="Creative preview" style={{ width: '100%', maxHeight: 80, objectFit: 'contain', border: '1px solid rgba(255,255,255,0.1)', background: '#1a1a1a', display: 'block' }} />
                      {generatedCreativeUrl === creativeDataUrl && (
                        <div style={{ marginTop: 4, fontSize: 8, fontWeight: 900, letterSpacing: '0.08em', color: '#009E73', textTransform: 'uppercase' }}>
                          Generated by GPT Image 2
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => { setCreativeDataUrl(null); setCreativeFileName(null); setGeneratedCreativeUrl(null) }}
                        style={{ position: 'absolute', top: 3, right: 3, background: 'rgba(0,0,0,0.7)', border: 'none', color: '#fff', fontSize: 10, cursor: 'pointer', padding: '1px 5px', lineHeight: 1.4 }}
                        aria-label="Remove creative"
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Analysis context */}
            <div>
              <SectionHead>Analysis Context</SectionHead>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>
                  <Label>Campaign brief</Label>
                  <textarea
                    value={form.brief}
                    onChange={e => setField('brief', e.target.value)}
                    rows={2}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1.5px solid rgba(255,255,255,0.15)',
                      color: '#F0F0F0',
                      fontSize: 10,
                      fontFamily: 'monospace',
                      fontWeight: 600,
                      padding: '4px 7px',
                      outline: 'none',
                      resize: 'vertical',
                    }}
                  />
                </div>
                <div>
                  <Label>Viewer profile</Label>
                  <textarea
                    value={form.viewerProfile}
                    onChange={e => setField('viewerProfile', e.target.value)}
                    rows={2}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1.5px solid rgba(255,255,255,0.15)',
                      color: '#F0F0F0',
                      fontSize: 10,
                      fontFamily: 'monospace',
                      fontWeight: 600,
                      padding: '4px 7px',
                      outline: 'none',
                      resize: 'vertical',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Run button */}
            <button
              type="button"
              onClick={() => void handleRun()}
              disabled={isRunning}
              style={{
                padding: '10px 0',
                background: isRunning ? 'rgba(0,158,115,0.25)' : '#009E73',
                border: `2px solid ${isRunning ? 'rgba(0,158,115,0.4)' : '#009E73'}`,
                color: isRunning ? 'rgba(255,255,255,0.5)' : '#000',
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                cursor: isRunning ? 'not-allowed' : 'pointer',
                flexShrink: 0,
              }}
            >
              {statusLabel[runState.status]}
            </button>

          </div>

          {/* Right: results */}
          <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>

            {runState.status === 'idle' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, opacity: 0.3 }}>
                <FlaskIcon />
                <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', color: '#F0F0F0', textTransform: 'uppercase' }}>
                  Configure inputs and run the pipeline
                </div>
              </div>
            )}

            {isRunning && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
                <SpinnerIcon />
                <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', color: '#009E73', textTransform: 'uppercase' }}>
                  {statusLabel[runState.status]}
                </div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', maxWidth: 260, textAlign: 'center', lineHeight: 1.5 }}>
                  {runState.status === 'fetching-scene' && 'Proxying the Google Street View Static image…'}
                  {runState.status === 'generating-creative' && 'GPT Image 2 is generating a billboard-ready creative for this placement...'}
                  {runState.status === 'rendering' && 'GPT Image 2 is compositing the billboard into the scene with realistic lighting and perspective…'}
                  {runState.status === 'analysing' && 'Running scene-response analysis on the photoreal composite…'}
                </div>
              </div>
            )}

            {runState.status === 'error' && (
              <div style={{ padding: 14, background: 'rgba(208,32,32,0.1)', border: '2px solid #D02020' }}>
                <div style={{ fontSize: 9, fontWeight: 900, color: '#D02020', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Pipeline Error</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5, fontFamily: 'monospace' }}>{runState.message}</div>
              </div>
            )}

            {runState.status === 'done' && (
              <>
                {/* Image comparison */}
                <div>
                  <SectionHead>Scene Comparison</SectionHead>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 5 }}>
                        Raw Street View
                      </div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={runState.rawSceneUrl}
                        alt="Raw street view"
                        style={{ width: '100%', display: 'block', border: '2px solid rgba(255,255,255,0.1)' }}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: '0.08em', color: '#009E73', textTransform: 'uppercase', marginBottom: 5 }}>
                        Photoreal Composite ✓
                      </div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={runState.photorealUrl}
                        alt="Photoreal composite"
                        style={{ width: '100%', display: 'block', border: '2px solid #009E73' }}
                      />
                    </div>
                  </div>

                  {/* Download button */}
                  <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                    <a
                      href={runState.photorealUrl}
                      download="photoreal-composite.png"
                      style={{
                        display: 'inline-block',
                        padding: '5px 14px',
                        background: 'rgba(0,158,115,0.15)',
                        border: '1.5px solid #009E73',
                        color: '#009E73',
                        fontSize: 9,
                        fontWeight: 900,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        textDecoration: 'none',
                      }}
                    >
                      Download Composite
                    </a>
                    <a
                      href={runState.rawSceneUrl}
                      download="raw-street-view.jpg"
                      style={{
                        display: 'inline-block',
                        padding: '5px 14px',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1.5px solid rgba(255,255,255,0.2)',
                        color: 'rgba(255,255,255,0.5)',
                        fontSize: 9,
                        fontWeight: 900,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        textDecoration: 'none',
                      }}
                    >
                      Download Raw
                    </a>
                  </div>
                </div>

                {/* Analysis */}
                <div>
                  <SectionHead>AI Scene Analysis</SectionHead>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'rgba(255,255,255,0.03)', border: '1.5px solid rgba(255,255,255,0.08)', padding: 12 }}>
                    <AnalysisRow label="Scene" value={runState.analysis.sceneDescription} />
                    <AnalysisRow label="Ad" value={runState.analysis.adDescription} />
                    <AnalysisRow label="First Impression" value={runState.analysis.firstImpression} />
                    <AnalysisRow label="Likely Attention" value={runState.analysis.likelyAttention} />
                    <AnalysisRow label="Confusion Risk" value={runState.analysis.likelyConfusion} />
                    <AnalysisRow label="Recommendation" value={runState.analysis.simpleRecommendation} />
                  </div>
                </div>

                {/* Raw JSON for debugging */}
                <details style={{ marginTop: 4 }}>
                  <summary style={{ fontSize: 8, fontWeight: 900, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}>
                    Raw JSON
                  </summary>
                  <pre style={{
                    marginTop: 8,
                    padding: 10,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'rgba(255,255,255,0.55)',
                    fontSize: 9,
                    fontFamily: 'monospace',
                    overflowX: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}>
                    {JSON.stringify(runState.analysis, null, 2)}
                  </pre>
                </details>
              </>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}

// ── Inline icons ──────────────────────────────────────────────────────────────

function FlaskIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true">
      <path d="M9 3h6M9 3v7l-5 9h16l-5-9V3" />
      <line x1="6" y1="16" x2="18" y2="16" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#009E73" strokeWidth="2.5" strokeLinecap="square" aria-hidden="true">
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} .spin-g{transform-origin:12px 12px;animation:spin 0.9s linear infinite}`}</style>
      <g className="spin-g">
        <path d="M12 2v4" strokeOpacity="1" />
        <path d="M12 18v4" strokeOpacity="0.3" />
        <path d="M4.93 4.93l2.83 2.83" strokeOpacity="0.85" />
        <path d="M16.24 16.24l2.83 2.83" strokeOpacity="0.2" />
        <path d="M2 12h4" strokeOpacity="0.7" />
        <path d="M18 12h4" strokeOpacity="0.15" />
        <path d="M4.93 19.07l2.83-2.83" strokeOpacity="0.5" />
        <path d="M16.24 7.76l2.83-2.83" strokeOpacity="0.1" />
      </g>
    </svg>
  )
}
