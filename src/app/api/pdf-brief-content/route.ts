/**
 * /api/pdf-brief-content
 *
 * Takes a seed ShareablePdfReportData and uses Gemini to expand it into
 * the rich PdfWhitepaperRequest shape consumed by /api/generate-pdf.
 *
 * Gemini fills in the qualitative sections (media feedback narratives,
 * full audience demographic breakdown, interview transcripts, final
 * recommendation, next actions). Hard facts that already exist in the
 * seed report (assets, listings, headline numbers) are passed through
 * deterministically so the model cannot fabricate prices or reach.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createGeminiResponse } from '@/lib/gemini'
import type { ShareablePdfReportData } from '@/types/pdfBrief'
import type {
  PdfWhitepaperRequest,
  MediaAsset,
  MediaListing,
  MediaFeedbackItem,
  AudienceProfile,
  InterviewSubject,
  DemographicSegment,
} from '../generate-pdf/route'

const MODEL_ENV = 'GEMINI_PDF_BRIEF_MODEL'
const DEFAULT_MODEL = 'gemini-2.0-flash'

const SYSTEM = `You are a senior media strategist writing a confidential out-of-home (OOH) advertising brief for a buyer.
You will receive a seed report containing the campaign title, market, score, asset list, listing prices/reach, and short qualitative signals.
Expand it into a richer brief by writing the qualitative sections only. Do not change prices, reach numbers, or asset titles.
Output ONLY valid JSON — no markdown fences, no commentary. Be concrete and specific. Avoid generic marketing platitudes.`

const SCHEMA = `{
  "mediaFeedback": [
    {
      "captureId": "string (use the matching seed signal id)",
      "agentName": "string (a plausible pedestrian persona name, e.g. 'Pedestrian 014')",
      "billboardName": "string (the top placement location)",
      "sceneDescription": "2-3 sentences describing the street-level context, lighting, foot traffic, faultlines",
      "adDescription": "1-2 sentences describing the creative as it appears in this scene",
      "firstImpression": "1-2 sentences on what registers in the first ~2 seconds",
      "likelyAttention": "1-2 sentences on which audience moments retain gaze and why",
      "likelyConfusion": "1-2 sentences on the comprehension risk; say 'No major comprehension risk identified' if none",
      "simpleRecommendation": "1 concrete sentence the media buyer can act on"
    }
  ],
  "audience": {
    "audienceSummary": "1-2 sentence summary of the audience exposed to the top placement",
    "ageBreakdown": [{ "label": "18-24", "value": 0, "unit": "%", "color": "#RRGGBB", "detail": "..." }],
    "genderSplit":  [{ "label": "Female", "value": 0, "unit": "%", "color": "#RRGGBB" }],
    "dwellTimeByContext": [{ "label": "Walking", "value": 0, "unit": "s", "color": "#RRGGBB" }],
    "attentionByPersona": [{ "label": "Pedestrian commute", "value": 0, "unit": "%", "color": "#RRGGBB", "detail": "..." }],
    "peakHours": [{ "label": "8 AM", "value": 0, "unit": "idx", "color": "#RRGGBB" }],
    "topInterests": ["string", "string", "string", "string", "string"]
  },
  "interviews": [
    {
      "name": "string (plausible local name for the market)",
      "age": 0,
      "occupation": "string",
      "neighbourhood": "string",
      "commute": "string",
      "gender": "string",
      "billboardSeen": "string (the top placement location)",
      "score": 0,
      "feedback": "2-3 sentence summary of recall, attention, and likely behaviour",
      "transcript": [
        { "role": "interviewer", "text": "..." },
        { "role": "pedestrian",  "text": "..." }
      ]
    }
  ],
  "recommendation": "3-5 sentence final recommendation that synthesises the above and states the lead placement clearly",
  "nextActions": ["string", "string", "string", "string", "string"]
}`

interface GeminiOutput {
  mediaFeedback?: MediaFeedbackItem[]
  audience?: AudienceProfile
  interviews?: InterviewSubject[]
  recommendation?: string
  nextActions?: string[]
}

function parseScore(value: string, fallback: number): number {
  const m = value.replace(/,/g, '').match(/\d+(?:\.\d+)?/)
  return m ? Number(m[0]) : fallback
}

function parseReach(value: string): number {
  return parseScore(value, 0)
}

function statusFor(index: number): MediaListing['status'] {
  return index === 0 ? 'available' : index === 1 ? 'reserved' : 'sold'
}

function buildDeterministicScaffold(report: ShareablePdfReportData): {
  mediaAssets: MediaAsset[]
  listings: MediaListing[]
  topPlacement: string | undefined
  topPlacementScore: number
  companyName: string
} {
  const companyName = report.title.split(' ')[0] || 'Faultline'
  const top = report.purchaseDetails[0]

  return {
    companyName,
    topPlacement: top?.location,
    topPlacementScore: top ? parseScore(top.score, report.score) : report.score,
    mediaAssets: report.mediaAssets.map(asset => ({
      id: asset.id,
      name: asset.title,
      format: asset.kind,
      location: asset.caption,
      imageUrl: asset.imageUrl,
      weeklyReach: top ? parseReach(top.reach) : undefined,
      visibilityScore: report.score,
    })),
    listings: report.purchaseDetails.map((detail, index) => ({
      id: detail.id,
      name: detail.listing,
      format: detail.format,
      location: detail.location,
      priceMonthly: detail.price,
      weeklyImpressions: parseReach(detail.reach),
      faultlineScore: parseScore(detail.score, report.score),
      status: statusFor(index),
    })),
  }
}

function parseJson(raw: string): GeminiOutput {
  try {
    return JSON.parse(raw) as GeminiOutput
  } catch {
    const fence = raw.match(/```(?:json)?\s*([\s\S]+?)```/)
    if (fence) return JSON.parse(fence[1]) as GeminiOutput
    throw new Error(`Could not parse Gemini response as JSON: ${raw.slice(0, 400)}`)
  }
}

function ensureColor(seg: DemographicSegment, fallback: string): DemographicSegment {
  if (!seg.color || !/^#?[0-9a-fA-F]{6}$/.test(seg.color.replace(/^#/, ''))) {
    return { ...seg, color: fallback }
  }
  return { ...seg, color: seg.color.startsWith('#') ? seg.color : `#${seg.color}` }
}

const PALETTE = ['#D02020', '#1040C0', '#3A8A50', '#C89B00', '#7B5EA7', '#2A8A8A']

function normaliseAudience(audience: AudienceProfile | undefined, fallbackSummary: string): AudienceProfile {
  const a = audience ?? {
    ageBreakdown: [],
    genderSplit: [],
    dwellTimeByContext: [],
    attentionByPersona: [],
    peakHours: [],
    topInterests: [],
    audienceSummary: fallbackSummary,
  }
  const colorise = (segments: DemographicSegment[] = []) =>
    segments.map((s, i) => ensureColor(s, PALETTE[i % PALETTE.length]))
  return {
    audienceSummary: a.audienceSummary || fallbackSummary,
    ageBreakdown: colorise(a.ageBreakdown),
    genderSplit: colorise(a.genderSplit),
    dwellTimeByContext: colorise(a.dwellTimeByContext),
    attentionByPersona: colorise(a.attentionByPersona),
    peakHours: colorise(a.peakHours),
    topInterests: a.topInterests ?? [],
  }
}

export async function POST(req: NextRequest) {
  let report: ShareablePdfReportData
  try {
    const body = (await req.json()) as { report?: ShareablePdfReportData } | ShareablePdfReportData
    report = ('report' in body && body.report ? body.report : body) as ShareablePdfReportData
    if (!report || typeof report.title !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid report payload' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const scaffold = buildDeterministicScaffold(report)

  const seed = {
    title: report.title,
    subtitle: report.subtitle,
    market: report.market,
    campaign: report.campaign,
    overallScore: report.score,
    topPlacement: scaffold.topPlacement,
    purchaseDetails: report.purchaseDetails,
    mediaAssets: report.mediaAssets,
    mediaFeedbackSignals: report.mediaFeedback,
    audienceSignals: report.audienceAnalysis,
    interviewSeeds: report.interviews,
    finalRecommendationSeed: report.finalRecommendation,
  }

  const userMessage = [
    'Seed report (JSON):',
    JSON.stringify(seed, null, 2),
    '',
    `Return a JSON object that exactly matches this schema. Use the seed signals to ground every section in the actual placement (${scaffold.topPlacement ?? 'top listing'}) and market (${report.market}). Produce one mediaFeedback entry per seed mediaFeedbackSignal (${report.mediaFeedback.length} total) and one interview per interviewSeed (${report.interviews.length} total). Use the top placement's location as billboardName / billboardSeen. Distribute colors across PALETTE so each segment chart reads cleanly.`,
    '',
    `Schema:\n${SCHEMA}`,
  ].join('\n')

  let parsed: GeminiOutput
  try {
    const raw = await createGeminiResponse({
      model: process.env[MODEL_ENV] || DEFAULT_MODEL,
      maxOutputTokens: 4096,
      temperature: 0.6,
      instructions: SYSTEM,
      messages: [{ role: 'user', content: userMessage }],
    })
    parsed = parseJson(raw)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gemini request failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }

  // Stitch Gemini output into the deterministic scaffold and return the
  // full PdfWhitepaperRequest payload that /api/generate-pdf expects.
  const payload: PdfWhitepaperRequest = {
    brand: {
      primaryColor: '#D02020',
      secondaryColor: '#1040C0',
      styleReference: 'High-contrast Faultline cockpit report with bold data panels and direct buyer recommendations.',
    },
    reportTitle: report.title,
    companyName: scaffold.companyName,
    industry: 'Out-of-home media',
    tagline: report.subtitle,
    campaignObjective: report.campaign,
    preparedFor: `${scaffold.companyName} media team`,
    preparedBy: 'Faultline Intelligence',
    campaignDates: '4-week campaign flight',
    mediaAssets: scaffold.mediaAssets,
    listings: scaffold.listings,
    mediaFeedback: (parsed.mediaFeedback ?? []).map((item, i) => ({
      ...item,
      captureId: item.captureId || report.mediaFeedback[i]?.id || `cap-${i + 1}`,
      billboardName: item.billboardName || scaffold.topPlacement || 'Selected placement',
    })),
    audience: normaliseAudience(parsed.audience, report.subtitle),
    interviews: (parsed.interviews ?? []).map(interview => ({
      ...interview,
      billboardSeen: interview.billboardSeen || scaffold.topPlacement || 'Selected placement',
    })),
    recommendation: parsed.recommendation || report.finalRecommendation,
    topPlacement: scaffold.topPlacement,
    topPlacementScore: scaffold.topPlacementScore,
    nextActions: parsed.nextActions ?? [
      'Share the generated PDF with the media buyer.',
      'Confirm inventory availability and production specifications.',
      'Hold the recommended placement pending final creative approval.',
    ],
    confidenceLevel: report.score,
  }

  return NextResponse.json({ payload })
}
