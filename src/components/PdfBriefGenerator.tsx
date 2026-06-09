'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ShareablePdfReportData } from '@/types/pdfBrief'

interface PdfBriefGeneratorProps {
  /** Optional — used for the preview header label and filename slug. */
  report?: Pick<ShareablePdfReportData, 'title'>
  buttonClassName?: string
  buttonLabel?: string
  filename?: string
  /**
   * Static PDF served by default. Bypasses live generation for now;
   * remove this prop to re-enable Gemini + /api/generate-pdf later.
   */
  staticPdfUrl?: string
  /** Total fake-loading duration before the PDF appears, in ms. */
  loadingDurationMs?: number
}

const DEFAULT_STATIC_PDF = '/mock-whitepaper.pdf'
const DEFAULT_LOADING_MS = 2400

const LOADING_STAGES: { at: number; label: string }[] = [
  { at: 0.00, label: 'Compiling agent captures' },
  { at: 0.20, label: 'Drafting media feedback' },
  { at: 0.45, label: 'Synthesising audience profile' },
  { at: 0.70, label: 'Rendering whitepaper layout' },
  { at: 0.92, label: 'Finalising PDF' },
]

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'faultline'
}

function stageFor(progress: number): string {
  let label = LOADING_STAGES[0].label
  for (const stage of LOADING_STAGES) {
    if (progress >= stage.at) label = stage.label
  }
  return label
}

export default function PdfBriefGenerator({
  report,
  buttonClassName = '',
  buttonLabel = 'Generate PDF brief',
  filename,
  staticPdfUrl = DEFAULT_STATIC_PDF,
  loadingDurationMs = DEFAULT_LOADING_MS,
}: PdfBriefGeneratorProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number>(0)

  const title = report?.title ?? 'Faultline OOH brief'
  const resolvedFilename = filename ?? `${slugify(title)}.pdf`

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const openBrief = useCallback(() => {
    if (isLoading) return
    setIsLoading(true)
    setIsPreviewOpen(true)
    setProgress(0)
    setPdfUrl(null)
    startRef.current = performance.now()

    const tick = (now: number) => {
      const elapsed = now - startRef.current
      const t = Math.min(1, elapsed / loadingDurationMs)
      // Ease-out so the bar slows toward the end — feels more like real work.
      const eased = 1 - Math.pow(1 - t, 2)
      setProgress(eased)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        rafRef.current = null
        setIsLoading(false)
        setPdfUrl(staticPdfUrl)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [isLoading, loadingDurationMs, staticPdfUrl])

  const closePreview = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    setIsPreviewOpen(false)
    setIsLoading(false)
    setProgress(0)
    setPdfUrl(null)
  }, [])

  const pct = Math.round(progress * 100)
  const stageLabel = stageFor(progress)

  return (
    <div className="bh-pdf-generator">
      <button
        type="button"
        className={buttonClassName}
        onClick={openBrief}
        disabled={isLoading}
      >
        {isLoading ? 'Generating…' : buttonLabel}
      </button>
      {isPreviewOpen && (
        <div className="bh-pdf-preview" role="dialog" aria-modal="true" aria-label="PDF brief preview">
          <div className="bh-pdf-preview__panel">
            <header className="bh-pdf-preview__header">
              <div>
                <span>PDF brief</span>
                <strong>{title}</strong>
              </div>
              <div className="bh-pdf-preview__actions">
                {pdfUrl && <a href={pdfUrl} download={resolvedFilename}>Download PDF</a>}
                <button type="button" onClick={closePreview} aria-label="Close PDF preview">
                  Close
                </button>
              </div>
            </header>
            {pdfUrl ? (
              <iframe className="bh-pdf-preview__frame" src={pdfUrl} title="PDF brief" />
            ) : (
              <div className="bh-pdf-loading" role="status" aria-live="polite">
                <div className="bh-pdf-loading__panel">
                  <div className="bh-pdf-loading__sheet" aria-hidden="true">
                    <span className="bh-pdf-loading__sheet-line bh-pdf-loading__sheet-line--title" />
                    <span className="bh-pdf-loading__sheet-line" />
                    <span className="bh-pdf-loading__sheet-line bh-pdf-loading__sheet-line--short" />
                    <span className="bh-pdf-loading__sheet-line" />
                    <span className="bh-pdf-loading__sheet-line bh-pdf-loading__sheet-line--short" />
                    <span className="bh-pdf-loading__sheet-line" />
                    <span className="bh-pdf-loading__sheet-shimmer" />
                  </div>
                  <div className="bh-pdf-loading__meta">
                    <div className="bh-pdf-loading__eyebrow">Generating brief</div>
                    <div className="bh-pdf-loading__stage">{stageLabel}</div>
                    <div className="bh-pdf-loading__bar" aria-label={`Progress ${pct}%`}>
                      <i style={{ width: `${pct}%` }} />
                    </div>
                    <div className="bh-pdf-loading__pct">{pct}%</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
