/**
 * /api/generate-pdf
 *
 * Generates a professional white-paper OOH Media Brief as a multi-page PDF.
 *
 * Structure:
 *   Page I    – Cover Page
 *   Page II   – Media Assets
 *   Page III  – Purchase Details (Locations, Listings, Prices)
 *   Section A – Media Feedback  (1+ pages, one analysis per agent capture)
 *   Section B – Audience Analysis (bento demographic grid, 1–2 pages)
 *   Section C – User Interviews  (1 page per interviewee)
 *   Page X    – Final Recommendation
 */

import { NextRequest, NextResponse } from 'next/server'
import React from 'react'
import {
  renderToBuffer,
  Document,
  Page,
  Text,
  View,
  Image,
  Svg,
  Rect,
  Circle,
  Line,
  Path,
  StyleSheet,
  Font,
} from '@react-pdf/renderer'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface MediaAsset {
  id: string
  name: string
  format: string
  location: string
  imageUrl?: string
  /** Mapbox static-map URL or similar */
  mapUrl?: string
  widthM?: number
  heightM?: number
  heading?: number
  weeklyReach?: number
  visibilityScore?: number
}

export interface MediaListing {
  id: string
  name: string
  format: string
  location: string
  priceMonthly: string
  weeklyImpressions: number
  faultlineScore: number
  status: 'available' | 'reserved' | 'sold'
}

export interface MediaFeedbackItem {
  captureId: string
  agentName: string
  billboardName: string
  captureImageUrl?: string
  sceneDescription: string
  adDescription: string
  firstImpression: string
  likelyAttention: string
  likelyConfusion: string
  simpleRecommendation: string
  timestamp?: number
}

export interface DemographicSegment {
  label: string
  value: number
  unit: string
  color: string
  detail?: string
}

export interface AudienceProfile {
  ageBreakdown: DemographicSegment[]
  genderSplit: DemographicSegment[]
  dwellTimeByContext: DemographicSegment[]
  attentionByPersona: DemographicSegment[]
  peakHours: DemographicSegment[]
  topInterests: string[]
  audienceSummary: string
}

export interface InterviewLine {
  role: 'interviewer' | 'pedestrian'
  text: string
}

export interface InterviewSubject {
  name: string
  age: number
  occupation: string
  neighbourhood: string
  commute: string
  gender: string
  profileImageUrl?: string
  billboardSeen: string
  score?: number
  feedback?: string
  transcript: InterviewLine[]
}

/**
 * Brand visual identity — matches CompanyBrief.visualSystem from /api/company-brief.
 * Pass the full visualSystem object returned by the URL analysis flow.
 */
export interface BrandVisualSystem {
  primaryColor?: string   // e.g. '#D02020'
  secondaryColor?: string // e.g. '#1040C0'
  logoUrl?: string
  fonts?: string[]
  styleReference?: string
  avoidList?: string[]
}

export interface PdfWhitepaperRequest {
  /**
   * Brand identity from the URL analysis flow (CompanyBrief.visualSystem).
   * When provided, primaryColor drives the accent / cover theme;
   * secondaryColor drives charts and data highlights.
   */
  brand?: BrandVisualSystem

  // Cover
  reportTitle?: string
  companyName?: string
  industry?: string
  tagline?: string
  campaignObjective?: string
  preparedFor?: string
  preparedBy?: string

  // Media Assets
  mediaAssets?: MediaAsset[]
  listings?: MediaListing[]

  // Campaign period (no budget)
  campaignDates?: string
  totalBudget?: string

  // Section A – Media Feedback
  mediaFeedback?: MediaFeedbackItem[]

  // Section B – Audience Analysis
  audience?: AudienceProfile

  // Section C – User Interviews
  interviews?: InterviewSubject[]

  // Final Recommendation
  recommendation?: string
  topPlacement?: string
  topPlacementScore?: number
  nextActions?: string[]
  confidenceLevel?: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens  (white-paper: white background, dark ink)
// ─────────────────────────────────────────────────────────────────────────────

/** Base palette — used as fallback when no brand colors are provided */
const C = {
  white:      '#FFFFFF',
  offwhite:   '#F7F7F5',
  rule:       '#E2E2DF',
  muted:      '#9A9A96',
  body:       '#2C2C2A',
  heading:    '#111110',
  accent:     '#D02020',   // signal red
  blue:       '#3d7fb8',
  green:      '#3a8a50',
  yellow:     '#C89B00',
  purple:     '#7B5EA7',
  teal:       '#2A8A8A',
  orange:     '#C05A20',
  cover_text: '#F7F7F5',
}

// ─────────────────────────────────────────────────────────────────────────────
// Theme resolver — derives per-document palette from brand.visualSystem
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensure a hex color has sufficient contrast against a dark background.
 * Very light colors (luminance > 0.7) are darkened slightly for legibility.
 */
function ensureContrastOnDark(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  if (luminance > 0.85) {
    // Too light for dark bg — darken by 30%
    const darken = (v: number) => Math.round(v * 0.7).toString(16).padStart(2, '0')
    return `#${darken(r)}${darken(g)}${darken(b)}`
  }
  return hex
}

export interface PdfTheme {
  accent: string        // primary brand color — bars, badges, rules, callout borders
  secondary: string     // secondary brand color — charts, data highlights
  // The rest are fixed neutrals
  white: string
  offwhite: string
  rule: string
  muted: string
  body: string
  heading: string
  cover_text: string
  blue: string
  green: string
  yellow: string
  purple: string
  teal: string
  orange: string
}

function resolveTheme(brand?: BrandVisualSystem): PdfTheme {
  const primary = brand?.primaryColor ?? C.accent
  const secondary = brand?.secondaryColor ?? C.blue

  // Validate hex — fall back to defaults if malformed
  const hexRe = /^#[0-9A-Fa-f]{6}$/
  const safeAccent = hexRe.test(primary) ? primary : C.accent
  const safeSecondary = hexRe.test(secondary) ? secondary : C.blue

  return {
    accent:      safeAccent,
    secondary:   safeSecondary,
    // fixed neutrals
    white:      C.white,
    offwhite:   C.offwhite,
    rule:       C.rule,
    muted:      C.muted,
    body:       C.body,
    heading:    C.heading,
    cover_text: C.cover_text,
    blue:       safeSecondary,
    green:      C.green,
    yellow:     C.yellow,
    purple:     C.purple,
    teal:       C.teal,
    orange:     C.orange,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  // ── Pages ──────────────────────────────────────────────────────────────────
  coverPage: {
    backgroundColor: C.white,
    padding: 0,
    position: 'relative',
  },
  bodyPage: {
    backgroundColor: C.white,
    paddingTop: 52,
    paddingBottom: 52,
    paddingHorizontal: 52,
    fontFamily: 'Helvetica',
  },
  sectionDividerPage: {
    backgroundColor: C.white,
    padding: 0,
    position: 'relative',
  },

  // ── Running header / footer ────────────────────────────────────────────────
  runningHeader: {
    position: 'absolute',
    top: 18,
    left: 52,
    right: 52,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: C.rule,
    paddingBottom: 8,
  },
  runningHeaderLeft: {
    fontSize: 7,
    color: C.muted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontFamily: 'Helvetica',
  },
  runningHeaderRight: {
    fontSize: 7,
    color: C.muted,
    letterSpacing: 1,
    fontFamily: 'Helvetica',
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 52,
    right: 52,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopColor: C.rule,
    paddingTop: 8,
  },
  footerText: {
    fontSize: 7,
    color: C.muted,
    fontFamily: 'Helvetica',
    letterSpacing: 0.5,
  },
  pageNumber: {
    fontSize: 7,
    color: C.muted,
    fontFamily: 'Helvetica',
  },

  // ── Cover page ─────────────────────────────────────────────────────────────
  coverContent: {
    flex: 1,
    padding: 60,
    justifyContent: 'flex-end',
  },
  coverEyebrow: {
    fontSize: 8,
    letterSpacing: 3,
    color: C.accent,
    textTransform: 'uppercase',
    marginBottom: 16,
    fontFamily: 'Helvetica',
  },
  coverTitle: {
    fontSize: 38,
    fontFamily: 'Helvetica-Bold',
    color: C.heading,
    lineHeight: 1.1,
    marginBottom: 10,
  },
  coverSubtitle: {
    fontSize: 14,
    color: C.muted,
    fontFamily: 'Helvetica',
    marginBottom: 40,
    lineHeight: 1.4,
  },
  coverRule: {
    height: 2,
    backgroundColor: C.accent,
    width: 48,
    marginBottom: 32,
  },
  coverMeta: {
    flexDirection: 'row',
    gap: 48,
    marginBottom: 16,
  },
  coverMetaBlock: {
    flexDirection: 'column',
    gap: 4,
  },
  coverMetaLabel: {
    fontSize: 7,
    color: C.muted,
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontFamily: 'Helvetica',
  },
  coverMetaValue: {
    fontSize: 10,
    color: C.body,
    fontFamily: 'Helvetica',
  },
  coverDate: {
    fontSize: 8,
    color: C.muted,
    fontFamily: 'Helvetica',
    marginTop: 24,
    letterSpacing: 1,
  },

  // ── Section divider ────────────────────────────────────────────────────────
  sectionDivContent: {
    flex: 1,
    padding: 60,
    justifyContent: 'center',
  },
  sectionDivLabel: {
    fontSize: 8,
    letterSpacing: 3,
    color: C.accent,
    textTransform: 'uppercase',
    marginBottom: 12,
    fontFamily: 'Helvetica',
  },
  sectionDivTitle: {
    fontSize: 32,
    fontFamily: 'Helvetica-Bold',
    color: C.heading,
    lineHeight: 1.15,
    marginBottom: 16,
  },
  sectionDivDesc: {
    fontSize: 11,
    color: C.muted,
    fontFamily: 'Helvetica',
    lineHeight: 1.6,
    maxWidth: 380,
  },

  // ── Body typography ────────────────────────────────────────────────────────
  h1: {
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    color: C.heading,
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  h2: {
    fontSize: 15,
    fontFamily: 'Helvetica-Bold',
    color: C.heading,
    marginBottom: 4,
    marginTop: 18,
  },
  h3: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: C.heading,
    marginBottom: 3,
    marginTop: 12,
  },
  pageLabel: {
    fontSize: 7,
    letterSpacing: 2.5,
    color: C.muted,
    textTransform: 'uppercase',
    marginBottom: 6,
    fontFamily: 'Helvetica',
  },
  body: {
    fontSize: 9.5,
    color: C.body,
    lineHeight: 1.65,
    fontFamily: 'Helvetica',
  },
  bodySmall: {
    fontSize: 8.5,
    color: C.body,
    lineHeight: 1.6,
    fontFamily: 'Helvetica',
  },
  caption: {
    fontSize: 7.5,
    color: C.muted,
    fontFamily: 'Helvetica',
    marginTop: 3,
    lineHeight: 1.4,
  },
  rule: {
    height: 0.75,
    backgroundColor: C.rule,
    marginVertical: 14,
  },
  accentRule: {
    height: 2,
    backgroundColor: C.accent,
    width: 32,
    marginBottom: 12,
  },

  // ── Key-value pairs ────────────────────────────────────────────────────────
  kvRow: {
    flexDirection: 'row',
    marginBottom: 5,
    alignItems: 'flex-start',
  },
  kvLabel: {
    fontSize: 7.5,
    color: C.muted,
    width: 120,
    flexShrink: 0,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingTop: 1,
    fontFamily: 'Helvetica',
  },
  kvValue: {
    fontSize: 9.5,
    color: C.body,
    flex: 1,
    lineHeight: 1.4,
    fontFamily: 'Helvetica',
  },
  kvValueBold: {
    fontSize: 9.5,
    color: C.heading,
    flex: 1,
    lineHeight: 1.4,
    fontFamily: 'Helvetica-Bold',
  },

  // ── Callout / pull-quote ───────────────────────────────────────────────────
  callout: {
    backgroundColor: C.offwhite,
    borderLeftWidth: 3,
    borderLeftColor: C.accent,
    padding: 12,
    marginVertical: 10,
    borderRadius: 2,
  },
  calloutText: {
    fontSize: 10,
    color: C.body,
    lineHeight: 1.6,
    fontFamily: 'Helvetica-Oblique',
  },

  // ── Score badge ────────────────────────────────────────────────────────────
  scoreBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginBottom: 8,
  },
  scoreNum: {
    fontSize: 48,
    fontFamily: 'Helvetica-Bold',
    color: C.accent,
    lineHeight: 1,
  },
  scoreMax: {
    fontSize: 14,
    color: C.muted,
    fontFamily: 'Helvetica',
  },
  scoreLabel: {
    fontSize: 7,
    color: C.muted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontFamily: 'Helvetica',
    marginTop: 2,
  },

  // ── Status pill ────────────────────────────────────────────────────────────
  pill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  pillText: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  // ── Media asset card ───────────────────────────────────────────────────────
  assetCard: {
    marginBottom: 20,
    borderWidth: 0.75,
    borderColor: C.rule,
    borderRadius: 3,
    overflow: 'hidden',
  },
  assetImage: {
    width: '100%',
    height: 160,
    objectFit: 'cover',
    backgroundColor: C.offwhite,
  },
  assetBody: {
    padding: 14,
  },
  assetName: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: C.heading,
    marginBottom: 4,
  },
  assetMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 8,
  },
  assetMetaItem: {
    flexDirection: 'column',
    gap: 2,
  },
  assetMetaLabel: {
    fontSize: 6.5,
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: 'Helvetica',
  },
  assetMetaValue: {
    fontSize: 9,
    color: C.body,
    fontFamily: 'Helvetica-Bold',
  },

  // ── Listing table ──────────────────────────────────────────────────────────
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: C.heading,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  tableHeaderCell: {
    fontSize: 7,
    color: C.cover_text,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: C.rule,
    alignItems: 'center',
  },
  tableRowAlt: {
    backgroundColor: C.offwhite,
  },
  tableCell: {
    fontSize: 8.5,
    color: C.body,
    fontFamily: 'Helvetica',
  },
  tableCellBold: {
    fontSize: 8.5,
    color: C.heading,
    fontFamily: 'Helvetica-Bold',
  },

  // ── Media feedback ─────────────────────────────────────────────────────────
  feedbackCapture: {
    width: '100%',
    height: 180,
    objectFit: 'cover',
    backgroundColor: C.offwhite,
    borderRadius: 3,
    marginBottom: 12,
  },
  feedbackGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  feedbackField: {
    width: '47%',
    backgroundColor: C.offwhite,
    borderRadius: 3,
    padding: 10,
    marginBottom: 6,
  },
  feedbackFieldFull: {
    width: '100%',
    backgroundColor: C.offwhite,
    borderRadius: 3,
    padding: 10,
    marginBottom: 6,
  },
  feedbackFieldLabel: {
    fontSize: 6.5,
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  feedbackFieldText: {
    fontSize: 9,
    color: C.body,
    lineHeight: 1.55,
    fontFamily: 'Helvetica',
  },

  // ── Bento grid (Audience Analysis) ────────────────────────────────────────
  bentoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
  bentoCard: {
    backgroundColor: C.offwhite,
    borderRadius: 4,
    padding: 14,
    borderWidth: 0.5,
    borderColor: C.rule,
  },
  bentoCardWide: {
    width: '100%',
  },
  bentoCardHalf: {
    width: '47%',
  },
  bentoCardThird: {
    width: '30%',
  },
  bentoTitle: {
    fontSize: 7,
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 10,
  },
  bentoStat: {
    fontSize: 28,
    fontFamily: 'Helvetica-Bold',
    color: C.heading,
    lineHeight: 1,
  },
  bentoStatUnit: {
    fontSize: 11,
    color: C.muted,
    fontFamily: 'Helvetica',
  },
  bentoStatLabel: {
    fontSize: 8,
    color: C.body,
    fontFamily: 'Helvetica',
    marginTop: 4,
    lineHeight: 1.4,
  },
  bentoBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  bentoBarLabel: {
    fontSize: 8,
    color: C.body,
    fontFamily: 'Helvetica',
    width: 90,
    flexShrink: 0,
  },
  bentoBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: C.rule,
    borderRadius: 3,
    overflow: 'hidden',
  },
  bentoBarFill: {
    height: 6,
    borderRadius: 3,
  },
  bentoBarValue: {
    fontSize: 8,
    color: C.muted,
    fontFamily: 'Helvetica',
    width: 28,
    textAlign: 'right',
  },
  tagCloud: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  tag: {
    backgroundColor: C.rule,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: {
    fontSize: 8,
    color: C.body,
    fontFamily: 'Helvetica',
  },

  // ── User interview ─────────────────────────────────────────────────────────
  interviewHeader: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
    alignItems: 'flex-start',
  },
  interviewAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: C.offwhite,
    flexShrink: 0,
    overflow: 'hidden',
  },
  interviewAvatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: C.rule,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  interviewName: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: C.heading,
    marginBottom: 3,
  },
  interviewRole: {
    fontSize: 9,
    color: C.muted,
    fontFamily: 'Helvetica',
    marginBottom: 10,
  },
  interviewTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  interviewTag: {
    backgroundColor: C.offwhite,
    borderRadius: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 0.5,
    borderColor: C.rule,
  },
  interviewTagText: {
    fontSize: 7.5,
    color: C.body,
    fontFamily: 'Helvetica',
  },
  interviewScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  interviewScoreNum: {
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    color: C.accent,
  },
  interviewScoreLabel: {
    fontSize: 7.5,
    color: C.muted,
    fontFamily: 'Helvetica',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  transcriptLine: {
    marginBottom: 10,
  },
  transcriptRole: {
    fontSize: 7,
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  transcriptText: {
    fontSize: 9.5,
    color: C.body,
    lineHeight: 1.6,
    fontFamily: 'Helvetica',
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: C.rule,
  },
  transcriptTextInterviewer: {
    fontSize: 9.5,
    color: C.body,
    lineHeight: 1.6,
    fontFamily: 'Helvetica-Oblique',
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: C.accent,
  },
  interviewFeedback: {
    backgroundColor: C.offwhite,
    borderRadius: 3,
    padding: 12,
    marginTop: 14,
    borderLeftWidth: 3,
    borderLeftColor: C.accent,
  },
  interviewFeedbackLabel: {
    fontSize: 7,
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  interviewFeedbackText: {
    fontSize: 9.5,
    color: C.body,
    lineHeight: 1.6,
    fontFamily: 'Helvetica-Oblique',
  },

  // ── Final recommendation ───────────────────────────────────────────────────
  recHero: {
    backgroundColor: C.offwhite,
    borderRadius: 4,
    padding: 20,
    marginBottom: 18,
    borderLeftWidth: 4,
    borderLeftColor: C.accent,
  },
  recHeroText: {
    fontSize: 13,
    color: C.body,
    lineHeight: 1.65,
    fontFamily: 'Helvetica',
  },
  recActionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 10,
  },
  recActionNum: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: C.accent,
    width: 18,
    flexShrink: 0,
    marginTop: 1,
  },
  recActionText: {
    fontSize: 9.5,
    color: C.body,
    lineHeight: 1.55,
    fontFamily: 'Helvetica',
    flex: 1,
  },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
  },
  confidenceLabel: {
    fontSize: 8,
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: 'Helvetica',
    width: 110,
  },
  confidenceTrack: {
    flex: 1,
    height: 8,
    backgroundColor: C.rule,
    borderRadius: 4,
    overflow: 'hidden',
  },
  confidenceFill: {
    height: 8,
    backgroundColor: C.green,
    borderRadius: 4,
  },
  confidenceValue: {
    fontSize: 9,
    color: C.body,
    fontFamily: 'Helvetica-Bold',
    width: 32,
    textAlign: 'right',
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// Helper components
// ─────────────────────────────────────────────────────────────────────────────

function RunningHeader({ company, section }: { company: string; section: string }) {
  return React.createElement(
    View,
    { style: S.runningHeader, fixed: true },
    React.createElement(Text, { style: S.runningHeaderLeft }, `${company} · OOH Media Brief`),
    React.createElement(Text, { style: S.runningHeaderRight }, section),
  )
}

function Footer({ company }: { company: string }) {
  return React.createElement(
    View,
    { style: S.footer, fixed: true },
    React.createElement(Text, { style: S.footerText }, `Confidential · ${company} · Faultline Intelligence`),
    React.createElement(
      Text,
      { style: S.pageNumber, render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `${pageNumber} / ${totalPages}` },
    ),
  )
}

function KV({ label, value, bold }: { label: string; value?: string | number | null; bold?: boolean }) {
  if (value == null || value === '') return null
  return React.createElement(
    View,
    { style: S.kvRow },
    React.createElement(Text, { style: S.kvLabel }, label),
    React.createElement(Text, { style: bold ? S.kvValueBold : S.kvValue }, String(value)),
  )
}

function Rule() {
  return React.createElement(View, { style: S.rule })
}

function AccentRule() {
  return React.createElement(View, { style: S.accentRule })
}

function StatusPill({ status }: { status: 'available' | 'reserved' | 'sold' }) {
  const colors: Record<string, { bg: string; text: string }> = {
    available: { bg: '#E8F5EC', text: C.green },
    reserved:  { bg: '#FFF8E0', text: C.yellow },
    sold:      { bg: '#FDECEA', text: C.accent },
  }
  const c = colors[status] ?? colors.available
  return React.createElement(
    View,
    { style: { ...S.pill, backgroundColor: c.bg } },
    React.createElement(Text, { style: { ...S.pillText, color: c.text } }, status),
  )
}

/** SVG bar chart for a list of segments */
function BarChart({ segments, width = 220, barH = 14 }: { segments: DemographicSegment[]; width?: number; barH?: number }) {
  const max = Math.max(...segments.map(s => s.value), 1)
  const rowH = barH + 6
  const totalH = segments.length * rowH + 4
  return React.createElement(
    Svg,
    { width, height: totalH },
    ...segments.map((seg, i) => {
      const barW = (seg.value / max) * (width - 70)
      const y = i * rowH
      return React.createElement(
        React.Fragment,
        { key: seg.label },
        React.createElement(Rect, { x: 0, y: y + 2, width: barW, height: barH, fill: seg.color, rx: 3 }),
      )
    }),
  )
}

/** Donut / pie chart using SVG arcs */
function DonutChart({ segments, size = 80 }: { segments: DemographicSegment[]; size?: number }) {
  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 8
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  let startAngle = -Math.PI / 2
  const paths: React.ReactElement[] = []
  for (const seg of segments) {
    const angle = (seg.value / total) * 2 * Math.PI
    const endAngle = startAngle + angle
    const x1 = cx + r * Math.cos(startAngle)
    const y1 = cy + r * Math.sin(startAngle)
    const x2 = cx + r * Math.cos(endAngle)
    const y2 = cy + r * Math.sin(endAngle)
    const largeArc = angle > Math.PI ? 1 : 0
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`
    paths.push(React.createElement(Path, { key: seg.label, d, fill: seg.color }))
    startAngle = endAngle
  }
  // white centre hole
  paths.push(React.createElement(Circle, { key: 'hole', cx, cy, r: r * 0.52, fill: C.white }))
  return React.createElement(Svg, { width: size, height: size }, ...paths)
}

/** Avatar placeholder SVG — simple person silhouette */
function AvatarPlaceholder({ size = 80, color = C.muted }: { size?: number; color?: string }) {
  const cx = size / 2
  return React.createElement(
    Svg,
    { width: size, height: size },
    React.createElement(Circle, { cx, cy: cx, r: cx, fill: C.rule }),
    // head
    React.createElement(Circle, { cx, cy: size * 0.32, r: size * 0.16, fill: color }),
    // body
    React.createElement(Path, {
      d: `M ${cx - size * 0.22} ${size * 0.95} Q ${cx - size * 0.22} ${size * 0.58} ${cx} ${size * 0.55} Q ${cx + size * 0.22} ${size * 0.58} ${cx + size * 0.22} ${size * 0.95} Z`,
      fill: color,
    }),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page builders
// ─────────────────────────────────────────────────────────────────────────────

/** Page I – Cover */
function CoverPage({ data, theme }: { data: PdfWhitepaperRequest; theme: PdfTheme }) {
  const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
  return React.createElement(
    Page,
    { size: 'A4', style: S.coverPage },
    // Left accent bar
    React.createElement(View, {
      style: {
        position: 'absolute', top: 0, left: 0, width: 6, height: '100%',
        backgroundColor: theme.accent,
      },
    }),
    // Top accent strip
    React.createElement(View, {
      style: {
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        backgroundColor: theme.accent,
      },
    }),
    // Content
    React.createElement(
      View,
      { style: S.coverContent },
      React.createElement(Text, { style: { ...S.coverEyebrow, color: theme.accent } }, 'Faultline · OOH Media Intelligence Report'),
      React.createElement(Text, { style: S.coverTitle }, data.reportTitle ?? `${data.companyName ?? 'Campaign'} Media Brief`),
      React.createElement(Text, { style: S.coverSubtitle }, data.tagline ?? 'Out-of-Home Advertising Analysis & Placement Recommendation'),
      React.createElement(View, { style: { ...S.coverRule, backgroundColor: theme.accent } }),
      React.createElement(
        View,
        { style: S.coverMeta },
        data.companyName
          ? React.createElement(
              View,
              { style: S.coverMetaBlock },
              React.createElement(Text, { style: S.coverMetaLabel }, 'Prepared For'),
              React.createElement(Text, { style: S.coverMetaValue }, data.preparedFor ?? data.companyName),
            )
          : null,
        React.createElement(
          View,
          { style: S.coverMetaBlock },
          React.createElement(Text, { style: S.coverMetaLabel }, 'Prepared By'),
          React.createElement(Text, { style: S.coverMetaValue }, data.preparedBy ?? 'Faultline Intelligence'),
        ),
        data.campaignObjective
          ? React.createElement(
              View,
              { style: S.coverMetaBlock },
              React.createElement(Text, { style: S.coverMetaLabel }, 'Campaign Objective'),
              React.createElement(Text, { style: S.coverMetaValue }, data.campaignObjective),
            )
          : null,
        data.campaignDates
          ? React.createElement(
              View,
              { style: S.coverMetaBlock },
              React.createElement(Text, { style: S.coverMetaLabel }, 'Campaign Period'),
              React.createElement(Text, { style: S.coverMetaValue }, data.campaignDates),
            )
          : null,
      ),
      React.createElement(Text, { style: S.coverDate }, `Generated ${date} · Confidential`),
    ),
  )
}

/** Page II – Media Assets */
function MediaAssetsPage({ data, theme }: { data: PdfWhitepaperRequest; theme: PdfTheme }) {
  const company = data.companyName ?? 'Campaign'
  const assets = data.mediaAssets ?? []
  return React.createElement(
    Page,
    { size: 'A4', style: S.bodyPage },
    React.createElement(RunningHeader, { company, section: 'Page II · Media Assets' }),
    React.createElement(
      View,
      null,
      React.createElement(Text, { style: S.pageLabel }, 'Page II'),
      React.createElement(Text, { style: S.h1 }, 'Media Assets'),
      React.createElement(AccentRule),
      React.createElement(
        Text,
        { style: S.body },
        'The following placements have been identified and evaluated for this campaign. Each asset has been assessed for visibility, format suitability, and audience alignment.',
      ),
      React.createElement(Rule),
      assets.length === 0
        ? React.createElement(
            View,
            { style: { ...S.callout, marginTop: 10 } },
            React.createElement(Text, { style: S.calloutText }, 'No media assets were provided for this report. Asset data is populated automatically from the Faultline map simulation.'),
          )
        : assets.map((asset, idx) =>
            React.createElement(
              View,
              { key: asset.id, style: S.assetCard, wrap: false },
              asset.imageUrl
                ? React.createElement(Image, { style: S.assetImage, src: asset.imageUrl })
                : React.createElement(
                    View,
                    { style: { ...S.assetImage, alignItems: 'center', justifyContent: 'center' } },
                    React.createElement(Text, { style: { fontSize: 9, color: theme.muted, fontFamily: 'Helvetica' } }, `${asset.name} · No preview available`),
                  ),
              React.createElement(
                View,
                { style: S.assetBody },
                React.createElement(Text, { style: S.assetName }, `${idx + 1}. ${asset.name}`),
                React.createElement(
                  View,
                  { style: S.assetMeta },
                  React.createElement(
                    View,
                    { style: S.assetMetaItem },
                    React.createElement(Text, { style: S.assetMetaLabel }, 'Format'),
                    React.createElement(Text, { style: S.assetMetaValue }, asset.format),
                  ),
                  React.createElement(
                    View,
                    { style: S.assetMetaItem },
                    React.createElement(Text, { style: S.assetMetaLabel }, 'Location'),
                    React.createElement(Text, { style: S.assetMetaValue }, asset.location),
                  ),
                  asset.widthM != null
                    ? React.createElement(
                        View,
                        { style: S.assetMetaItem },
                        React.createElement(Text, { style: S.assetMetaLabel }, 'Dimensions'),
                        React.createElement(Text, { style: S.assetMetaValue }, `${asset.widthM}m × ${asset.heightM ?? '?'}m`),
                      )
                    : null,
                  asset.weeklyReach != null
                    ? React.createElement(
                        View,
                        { style: S.assetMetaItem },
                        React.createElement(Text, { style: S.assetMetaLabel }, 'Weekly Reach'),
                        React.createElement(Text, { style: S.assetMetaValue }, asset.weeklyReach.toLocaleString()),
                      )
                    : null,
                  asset.visibilityScore != null
                    ? React.createElement(
                        View,
                        { style: S.assetMetaItem },
                        React.createElement(Text, { style: S.assetMetaLabel }, 'Visibility Score'),
                        React.createElement(Text, { style: { ...S.assetMetaValue, color: theme.accent } }, `${asset.visibilityScore}/100`),
                      )
                    : null,
                ),
              ),
            ),
          ),
    ),
    React.createElement(Footer, { company }),
  )
}

/** Page III – Purchase Details */
function PurchaseDetailsPage({ data, theme }: { data: PdfWhitepaperRequest; theme: PdfTheme }) {
  const company = data.companyName ?? 'Campaign'
  const listings = data.listings ?? []
  const colWidths = ['28%', '14%', '16%', '14%', '12%', '10%', '6%']
  return React.createElement(
    Page,
    { size: 'A4', style: S.bodyPage },
    React.createElement(RunningHeader, { company, section: 'Page III · Purchase Details' }),
    React.createElement(
      View,
      null,
      React.createElement(Text, { style: S.pageLabel }, 'Page III'),
      React.createElement(Text, { style: S.h1 }, 'Purchase Details'),
      React.createElement(AccentRule),
      React.createElement(
        Text,
        { style: S.body },
        'Pricing, availability, and impression estimates for all shortlisted placements. All prices are indicative and subject to media owner confirmation.',
      ),
      data.totalBudget
        ? React.createElement(
            View,
            { style: { ...S.callout, marginTop: 12 } },
            React.createElement(
              View,
              { style: { flexDirection: 'row', justifyContent: 'space-between' } },
              React.createElement(
                View,
                null,
                React.createElement(Text, { style: { fontSize: 7, color: theme.muted, letterSpacing: 1.5, textTransform: 'uppercase', fontFamily: 'Helvetica', marginBottom: 3 } }, 'Total Campaign Budget'),
                React.createElement(Text, { style: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: theme.heading } }, data.totalBudget),
              ),
              data.campaignDates
                ? React.createElement(
                    View,
                    { style: { alignItems: 'flex-end' } },
                    React.createElement(Text, { style: { fontSize: 7, color: theme.muted, letterSpacing: 1.5, textTransform: 'uppercase', fontFamily: 'Helvetica', marginBottom: 3 } }, 'Campaign Period'),
                    React.createElement(Text, { style: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: theme.heading } }, data.campaignDates),
                  )
                : null,
            ),
          )
        : null,
      React.createElement(Rule),
      // Table
      listings.length === 0
        ? React.createElement(Text, { style: { ...S.body, color: theme.muted, fontFamily: 'Helvetica-Oblique' } }, 'No listings provided.')
        : React.createElement(
            View,
            null,
            // Header
            React.createElement(
              View,
              { style: S.tableHeader },
              React.createElement(Text, { style: { ...S.tableHeaderCell, width: colWidths[0] } }, 'Placement'),
              React.createElement(Text, { style: { ...S.tableHeaderCell, width: colWidths[1] } }, 'Format'),
              React.createElement(Text, { style: { ...S.tableHeaderCell, width: colWidths[2] } }, 'Location'),
              React.createElement(Text, { style: { ...S.tableHeaderCell, width: colWidths[3] } }, 'Monthly Price'),
              React.createElement(Text, { style: { ...S.tableHeaderCell, width: colWidths[4] } }, 'Wkly Impr.'),
              React.createElement(Text, { style: { ...S.tableHeaderCell, width: colWidths[5] } }, 'Score'),
              React.createElement(Text, { style: { ...S.tableHeaderCell, width: colWidths[6] } }, ''),
            ),
            ...listings.map((l, i) =>
              React.createElement(
                View,
                { key: l.id, style: { ...S.tableRow, ...(i % 2 === 1 ? S.tableRowAlt : {}) }, wrap: false },
                React.createElement(Text, { style: { ...S.tableCellBold, width: colWidths[0] } }, l.name),
                React.createElement(Text, { style: { ...S.tableCell, width: colWidths[1] } }, l.format),
                React.createElement(Text, { style: { ...S.tableCell, width: colWidths[2] } }, l.location),
                React.createElement(Text, { style: { ...S.tableCellBold, width: colWidths[3] } }, l.priceMonthly),
                React.createElement(Text, { style: { ...S.tableCell, width: colWidths[4] } }, l.weeklyImpressions.toLocaleString()),
                React.createElement(Text, { style: { ...S.tableCellBold, width: colWidths[5], color: theme.accent } }, String(l.faultlineScore)),
                React.createElement(StatusPill, { status: l.status }),
              ),
            ),
          ),
    ),
    React.createElement(Footer, { company }),
  )
}

/** Section divider page */
function SectionDivider({ letter, title, description, theme }: { letter: string; title: string; description: string; theme: PdfTheme }) {
  return React.createElement(
    Page,
    { size: 'A4', style: S.sectionDividerPage },
    // Left accent bar
    React.createElement(View, {
      style: { position: 'absolute', top: 0, left: 0, width: 6, height: '100%', backgroundColor: theme.accent },
    }),
    // Top accent strip
    React.createElement(View, {
      style: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: theme.accent },
    }),
    React.createElement(
      View,
      { style: S.sectionDivContent },
      React.createElement(Text, { style: { ...S.sectionDivLabel, color: theme.accent } }, `Section ${letter}`),
      React.createElement(Text, { style: S.sectionDivTitle }, title),
      React.createElement(View, { style: { height: 2, backgroundColor: theme.accent, width: 48, marginBottom: 16 } }),
      React.createElement(Text, { style: S.sectionDivDesc }, description),
    ),
  )
}

/** Section A – Media Feedback (one page per capture) */
function MediaFeedbackPages({ data, theme }: { data: PdfWhitepaperRequest; theme: PdfTheme }) {
  const company = data.companyName ?? 'Campaign'
  const items = data.mediaFeedback ?? []

  if (items.length === 0) {
    return React.createElement(
      Page,
      { size: 'A4', style: S.bodyPage },
      React.createElement(RunningHeader, { company, section: 'Section A · Media Feedback' }),
      React.createElement(
        View,
        null,
        React.createElement(Text, { style: S.pageLabel }, 'Section A'),
        React.createElement(Text, { style: S.h1 }, 'Media Feedback'),
        React.createElement(AccentRule),
        React.createElement(
          View,
          { style: S.callout },
          React.createElement(Text, { style: S.calloutText }, 'No agent captures were available for this report. Media feedback is generated automatically when agents observe billboard placements during the simulation.'),
        ),
      ),
      React.createElement(Footer, { company }),
    )
  }

  return React.createElement(
    React.Fragment,
    null,
    ...items.map((item, idx) =>
      React.createElement(
        Page,
        { key: item.captureId, size: 'A4', style: S.bodyPage },
        React.createElement(RunningHeader, { company, section: `Section A · Media Feedback` }),
        React.createElement(
          View,
          null,
          React.createElement(Text, { style: S.pageLabel }, `Section A · Capture ${idx + 1} of ${items.length}`),
          React.createElement(Text, { style: S.h1 }, item.billboardName),
          React.createElement(
            View,
            { style: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 } },
            React.createElement(Text, { style: { ...S.caption, color: theme.muted } }, `Observed by ${item.agentName}`),
            item.timestamp
              ? React.createElement(Text, { style: { ...S.caption, color: theme.muted } }, `· ${new Date(item.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`)  
              : null,
          ),
          React.createElement(View, { style: { ...S.accentRule, backgroundColor: theme.accent } }),
          // Capture image
          item.captureImageUrl
            ? React.createElement(Image, { style: S.feedbackCapture, src: item.captureImageUrl })
            : React.createElement(
                View,
                { style: { ...S.feedbackCapture, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.offwhite } },
                React.createElement(Text, { style: { fontSize: 9, color: theme.muted, fontFamily: 'Helvetica' } }, 'Agent capture image not available'),
              ),
          // Analysis grid
          React.createElement(
            View,
            { style: S.feedbackGrid },
            React.createElement(
              View,
              { style: S.feedbackFieldFull },
              React.createElement(Text, { style: S.feedbackFieldLabel }, 'Scene Description'),
              React.createElement(Text, { style: S.feedbackFieldText }, item.sceneDescription),
            ),
            React.createElement(
              View,
              { style: S.feedbackField },
              React.createElement(Text, { style: S.feedbackFieldLabel }, 'Ad Description'),
              React.createElement(Text, { style: S.feedbackFieldText }, item.adDescription),
            ),
            React.createElement(
              View,
              { style: S.feedbackField },
              React.createElement(Text, { style: S.feedbackFieldLabel }, 'First Impression'),
              React.createElement(Text, { style: S.feedbackFieldText }, item.firstImpression),
            ),
            React.createElement(
              View,
              { style: S.feedbackField },
              React.createElement(Text, { style: S.feedbackFieldLabel }, 'Likely Attention'),
              React.createElement(Text, { style: S.feedbackFieldText }, item.likelyAttention),
            ),
            React.createElement(
              View,
              { style: S.feedbackField },
              React.createElement(Text, { style: S.feedbackFieldLabel }, 'Likely Confusion'),
              React.createElement(Text, { style: S.feedbackFieldText }, item.likelyConfusion),
            ),
            React.createElement(
              View,
              { style: S.feedbackFieldFull },
              React.createElement(Text, { style: S.feedbackFieldLabel }, 'Recommendation'),
              React.createElement(Text, { style: { ...S.feedbackFieldText, fontFamily: 'Helvetica-Bold', color: theme.heading } }, item.simpleRecommendation),
            ),
          ),
        ),
        React.createElement(Footer, { company }),
      ),
    ),
  )
}

/** Section B – Audience Analysis */
function AudienceAnalysisPages({ data, theme }: { data: PdfWhitepaperRequest; theme: PdfTheme }) {
  const company = data.companyName ?? 'Campaign'
  const aud = data.audience

  const defaultAud: AudienceProfile = {
    audienceSummary: 'Urban professionals aged 25–44 dominate the exposure window, with a secondary cluster of retail shoppers. Peak exposure occurs during morning and evening commute hours.',
    ageBreakdown: [
      { label: '18–24', value: 14, unit: '%', color: theme.purple },
      { label: '25–34', value: 31, unit: '%', color: theme.blue },
      { label: '35–44', value: 28, unit: '%', color: theme.accent },
      { label: '45–54', value: 17, unit: '%', color: theme.teal },
      { label: '55+',   value: 10, unit: '%', color: theme.muted },
    ],
    genderSplit: [
      { label: 'Male',   value: 54, unit: '%', color: theme.blue },
      { label: 'Female', value: 43, unit: '%', color: theme.accent },
      { label: 'Other',  value: 3,  unit: '%', color: theme.muted },
    ],
    dwellTimeByContext: [
      { label: 'Taxi queue',         value: 21.7, unit: 's', color: theme.accent, detail: 'Highest dwell — strong conversion opportunity' },
      { label: 'Retail shopper',     value: 14.2, unit: 's', color: theme.blue,   detail: 'Moderate dwell — brand recall likely' },
      { label: 'Pedestrian commute', value: 8.4,  unit: 's', color: theme.green,  detail: 'Short dwell — headline must land in 3 words' },
      { label: 'Driver approach',    value: 3.8,  unit: 's', color: theme.muted,  detail: 'Very short — visual only, no copy' },
    ],
    attentionByPersona: [
      { label: 'Taxi queue',         value: 89, unit: '%', color: theme.accent },
      { label: 'Retail shopper',     value: 81, unit: '%', color: theme.blue },
      { label: 'Pedestrian commute', value: 76, unit: '%', color: theme.green },
      { label: 'Driver approach',    value: 42, unit: '%', color: theme.muted },
    ],
    peakHours: [
      { label: '07:00–09:00', value: 88, unit: '%', color: theme.accent },
      { label: '12:00–14:00', value: 62, unit: '%', color: theme.blue },
      { label: '17:00–20:00', value: 95, unit: '%', color: theme.accent },
      { label: '20:00–23:00', value: 44, unit: '%', color: theme.muted },
    ],
    topInterests: ['Fitness & Wellness', 'Technology', 'Food & Dining', 'Travel', 'Finance', 'Fashion', 'Sustainability'],
  }

  const a = aud ?? defaultAud

  return React.createElement(
    React.Fragment,
    null,
    // Page B-1: Summary + Age + Gender + Dwell
    React.createElement(
      Page,
      { size: 'A4', style: S.bodyPage },
      React.createElement(RunningHeader, { company, section: 'Section B · Audience Analysis' }),
      React.createElement(
        View,
        null,
        React.createElement(Text, { style: S.pageLabel }, 'Section B · Page 1 of 2'),
        React.createElement(Text, { style: S.h1 }, 'Audience Analysis'),
        React.createElement(AccentRule),
        React.createElement(
          View,
          { style: S.callout },
          React.createElement(Text, { style: S.calloutText }, a.audienceSummary),
        ),
        React.createElement(Rule),
        // Bento grid row 1: Age breakdown + Gender split
        React.createElement(
          View,
          { style: S.bentoGrid },
          // Age breakdown — wide card with bars
          React.createElement(
            View,
            { style: { ...S.bentoCard, ...S.bentoCardHalf } },
            React.createElement(Text, { style: S.bentoTitle }, 'Age Breakdown'),
            ...a.ageBreakdown.map(seg =>
              React.createElement(
                View,
                { key: seg.label, style: S.bentoBarRow },
                React.createElement(Text, { style: S.bentoBarLabel }, seg.label),
                React.createElement(
                  View,
                  { style: S.bentoBarTrack },
                  React.createElement(View, { style: { ...S.bentoBarFill, width: `${seg.value}%`, backgroundColor: seg.color } }),
                ),
                React.createElement(Text, { style: S.bentoBarValue }, `${seg.value}${seg.unit}`),
              ),
            ),
          ),
          // Gender split — card with donut
          React.createElement(
            View,
            { style: { ...S.bentoCard, ...S.bentoCardHalf } },
            React.createElement(Text, { style: S.bentoTitle }, 'Gender Split'),
            React.createElement(
              View,
              { style: { flexDirection: 'row', alignItems: 'center', gap: 14 } },
              React.createElement(DonutChart, { segments: a.genderSplit, size: 80 }),
              React.createElement(
                View,
                { style: { flex: 1 } },
                ...a.genderSplit.map(seg =>
                  React.createElement(
                    View,
                    { key: seg.label, style: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 } },
                    React.createElement(View, { style: { width: 8, height: 8, borderRadius: 4, backgroundColor: seg.color } }),
                    React.createElement(Text, { style: { fontSize: 8, color: theme.body, fontFamily: 'Helvetica' } }, `${seg.label}  `),
                    React.createElement(Text, { style: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: theme.heading } }, `${seg.value}${seg.unit}`),
                  ),
                ),
              ),
            ),
          ),
          // Dwell time — full width card
          React.createElement(
            View,
            { style: { ...S.bentoCard, ...S.bentoCardWide } },
            React.createElement(Text, { style: S.bentoTitle }, 'Average Dwell Time by Context'),
            ...a.dwellTimeByContext.map(seg =>
              React.createElement(
                View,
                { key: seg.label, style: { ...S.bentoBarRow, marginBottom: 8 } },
                React.createElement(Text, { style: { ...S.bentoBarLabel, width: 130 } }, seg.label),
                React.createElement(
                  View,
                  { style: S.bentoBarTrack },
                  React.createElement(View, {
                    style: {
                      ...S.bentoBarFill,
                      width: `${(seg.value / 25) * 100}%`,
                      backgroundColor: seg.color,
                    },
                  }),
                ),
                React.createElement(Text, { style: { ...S.bentoBarValue, width: 40 } }, `${seg.value}${seg.unit}`),
              ),
            ),
          ),
        ),
      ),
      React.createElement(Footer, { company }),
    ),

    // Page B-2: Attention + Peak Hours + Interests
    React.createElement(
      Page,
      { size: 'A4', style: S.bodyPage },
      React.createElement(RunningHeader, { company, section: 'Section B · Audience Analysis' }),
      React.createElement(
        View,
        null,
        React.createElement(Text, { style: S.pageLabel }, 'Section B · Page 2 of 2'),
        React.createElement(Text, { style: S.h2 }, 'Attention & Reach'),
        React.createElement(Rule),
        React.createElement(
          View,
          { style: S.bentoGrid },
          // Attention by persona
          React.createElement(
            View,
            { style: { ...S.bentoCard, ...S.bentoCardHalf } },
            React.createElement(Text, { style: S.bentoTitle }, 'Attention Score by Persona'),
            ...a.attentionByPersona.map(seg =>
              React.createElement(
                View,
                { key: seg.label, style: S.bentoBarRow },
                React.createElement(Text, { style: { ...S.bentoBarLabel, width: 110 } }, seg.label),
                React.createElement(
                  View,
                  { style: S.bentoBarTrack },
                  React.createElement(View, { style: { ...S.bentoBarFill, width: `${seg.value}%`, backgroundColor: seg.color } }),
                ),
                React.createElement(Text, { style: S.bentoBarValue }, `${seg.value}${seg.unit}`),
              ),
            ),
          ),
          // Peak hours
          React.createElement(
            View,
            { style: { ...S.bentoCard, ...S.bentoCardHalf } },
            React.createElement(Text, { style: S.bentoTitle }, 'Peak Exposure Hours'),
            ...a.peakHours.map(seg =>
              React.createElement(
                View,
                { key: seg.label, style: S.bentoBarRow },
                React.createElement(Text, { style: { ...S.bentoBarLabel, width: 90 } }, seg.label),
                React.createElement(
                  View,
                  { style: S.bentoBarTrack },
                  React.createElement(View, { style: { ...S.bentoBarFill, width: `${seg.value}%`, backgroundColor: seg.color } }),
                ),
                React.createElement(Text, { style: S.bentoBarValue }, `${seg.value}${seg.unit}`),
              ),
            ),
          ),
          // Key stats row
          React.createElement(
            View,
            { style: { ...S.bentoCard, width: '30%' } },
            React.createElement(Text, { style: S.bentoTitle }, 'Peak Attention'),
            React.createElement(Text, { style: S.bentoStat }, `${Math.max(...a.attentionByPersona.map(s => s.value))}`),
            React.createElement(Text, { style: S.bentoStatUnit }, '%'),
            React.createElement(Text, { style: S.bentoStatLabel }, a.attentionByPersona.reduce((best, s) => s.value > best.value ? s : best).label),
          ),
          React.createElement(
            View,
            { style: { ...S.bentoCard, width: '30%' } },
            React.createElement(Text, { style: S.bentoTitle }, 'Max Dwell Time'),
            React.createElement(Text, { style: S.bentoStat }, `${Math.max(...a.dwellTimeByContext.map(s => s.value)).toFixed(1)}`),
            React.createElement(Text, { style: S.bentoStatUnit }, 's'),
            React.createElement(Text, { style: S.bentoStatLabel }, a.dwellTimeByContext.reduce((best, s) => s.value > best.value ? s : best).label),
          ),
          React.createElement(
            View,
            { style: { ...S.bentoCard, width: '30%' } },
            React.createElement(Text, { style: S.bentoTitle }, 'Primary Age Group'),
            React.createElement(Text, { style: S.bentoStat }, `${Math.max(...a.ageBreakdown.map(s => s.value))}`),
            React.createElement(Text, { style: S.bentoStatUnit }, '%'),
            React.createElement(Text, { style: S.bentoStatLabel }, a.ageBreakdown.reduce((best, s) => s.value > best.value ? s : best).label),
          ),
          // Interests tag cloud
          React.createElement(
            View,
            { style: { ...S.bentoCard, ...S.bentoCardWide } },
            React.createElement(Text, { style: S.bentoTitle }, 'Top Audience Interests'),
            React.createElement(
              View,
              { style: S.tagCloud },
              ...a.topInterests.map(interest =>
                React.createElement(
                  View,
                  { key: interest, style: S.tag },
                  React.createElement(Text, { style: S.tagText }, interest),
                ),
              ),
            ),
          ),
        ),
      ),
      React.createElement(Footer, { company }),
    ),
  )
}

/** Section C – User Interviews (one page per subject) */
function UserInterviewPages({ data, theme }: { data: PdfWhitepaperRequest; theme: PdfTheme }) {
  const company = data.companyName ?? 'Campaign'
  const interviews = data.interviews ?? []

  if (interviews.length === 0) {
    return React.createElement(
      Page,
      { size: 'A4', style: S.bodyPage },
      React.createElement(RunningHeader, { company, section: 'Section C · User Interviews' }),
      React.createElement(
        View,
        null,
        React.createElement(Text, { style: S.pageLabel }, 'Section C'),
        React.createElement(Text, { style: S.h1 }, 'User Interviews'),
        React.createElement(AccentRule),
        React.createElement(
          View,
          { style: S.callout },
          React.createElement(Text, { style: S.calloutText }, 'No user interviews were available for this report. Interview data is generated automatically when pedestrian agents interact with billboard placements during the simulation.'),
        ),
      ),
      React.createElement(Footer, { company }),
    )
  }

  return React.createElement(
    React.Fragment,
    null,
    ...interviews.map((subject, idx) =>
      React.createElement(
        Page,
        { key: `interview-${idx}`, size: 'A4', style: S.bodyPage },
        React.createElement(RunningHeader, { company, section: `Section C · User Interviews` }),
        React.createElement(
          View,
          null,
          React.createElement(Text, { style: S.pageLabel }, `Section C · Interview ${idx + 1} of ${interviews.length}`),
          // Profile header
          React.createElement(
            View,
            { style: S.interviewHeader },
            // Avatar
            subject.profileImageUrl
              ? React.createElement(Image, { style: S.interviewAvatar, src: subject.profileImageUrl })
              : React.createElement(AvatarPlaceholder, { size: 80, color: [theme.blue, theme.accent, theme.green, theme.purple, theme.teal][idx % 5] }),
            // Info block
            React.createElement(
              View,
              { style: { flex: 1 } },
              React.createElement(Text, { style: S.interviewName }, subject.name),
              React.createElement(Text, { style: S.interviewRole }, `${subject.occupation} · ${subject.neighbourhood}`),
              React.createElement(
                View,
                { style: S.interviewTagRow },
                React.createElement(
                  View,
                  { style: S.interviewTag },
                  React.createElement(Text, { style: S.interviewTagText }, `Age ${subject.age}`),
                ),
                React.createElement(
                  View,
                  { style: S.interviewTag },
                  React.createElement(Text, { style: S.interviewTagText }, subject.gender),
                ),
                React.createElement(
                  View,
                  { style: S.interviewTag },
                  React.createElement(Text, { style: S.interviewTagText }, `Commute: ${subject.commute}`),
                ),
                React.createElement(
                  View,
                  { style: S.interviewTag },
                  React.createElement(Text, { style: S.interviewTagText }, `Saw: ${subject.billboardSeen}`),
                ),
              ),
              subject.score != null
                ? React.createElement(
                    View,
                    { style: S.interviewScoreRow },
                    React.createElement(Text, { style: S.interviewScoreNum }, String(subject.score)),
                    React.createElement(Text, { style: S.interviewScoreLabel }, '/ 100 · Recall Score'),
                  )
                : null,
            ),
          ),
          React.createElement(View, { style: { ...S.accentRule, backgroundColor: theme.accent } }),
          // Transcript
          React.createElement(Text, { style: S.h3 }, 'Interview Transcript'),
          React.createElement(Rule),
          ...subject.transcript.map((line, li) =>
            React.createElement(
              View,
              { key: li, style: S.transcriptLine },
              React.createElement(
                Text,
                { style: S.transcriptRole },
                line.role === 'interviewer' ? 'Interviewer' : subject.name,
              ),
              React.createElement(
                Text,
                { style: line.role === 'interviewer' ? S.transcriptTextInterviewer : S.transcriptText },
                line.text,
              ),
            ),
          ),
          // Feedback summary
          subject.feedback
            ? React.createElement(
                View,
                { style: S.interviewFeedback },
                React.createElement(Text, { style: S.interviewFeedbackLabel }, 'AI Analysis · Key Takeaway'),
                React.createElement(Text, { style: S.interviewFeedbackText }, subject.feedback),
              )
            : null,
        ),
        React.createElement(Footer, { company }),
      ),
    ),
  )
}

/** Page X – Final Recommendation */
function FinalRecommendationPage({ data, theme }: { data: PdfWhitepaperRequest; theme: PdfTheme }) {
  const company = data.companyName ?? 'Campaign'
  const confidence = data.confidenceLevel ?? 82
  return React.createElement(
    Page,
    { size: 'A4', style: S.bodyPage },
    React.createElement(RunningHeader, { company, section: 'Page X · Final Recommendation' }),
    React.createElement(
      View,
      null,
      React.createElement(Text, { style: S.pageLabel }, 'Page X · Final Recommendation'),
      React.createElement(Text, { style: S.h1 }, 'Recommendation'),
      React.createElement(AccentRule),
      // Top placement badge
      data.topPlacement
        ? React.createElement(
            View,
            { style: { flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 16 } },
            React.createElement(
              View,
              null,
              React.createElement(Text, { style: { fontSize: 7, color: theme.muted, letterSpacing: 1.5, textTransform: 'uppercase', fontFamily: 'Helvetica', marginBottom: 3 } }, 'Recommended Placement'),
              React.createElement(Text, { style: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: theme.heading } }, data.topPlacement),
            ),
            data.topPlacementScore != null
              ? React.createElement(
                  View,
                  { style: { alignItems: 'center' } },
                  React.createElement(Text, { style: { fontSize: 44, fontFamily: 'Helvetica-Bold', color: theme.accent, lineHeight: 1 } }, String(data.topPlacementScore)),
                  React.createElement(Text, { style: { fontSize: 7, color: theme.muted, letterSpacing: 1.5, textTransform: 'uppercase', fontFamily: 'Helvetica' } }, 'Faultline Score'),
                )
              : null,
          )
        : null,
      // Recommendation body
      React.createElement(
        View,
        { style: S.recHero },
        React.createElement(Text, { style: S.recHeroText }, data.recommendation ?? 'Based on the simulation data, agent captures, audience analysis, and user interviews, the selected placement delivers the strongest combination of faultline quality, audience fit, and brand recall potential.'),
      ),
      // Next actions
      data.nextActions && data.nextActions.length > 0
        ? React.createElement(
            View,
            { style: { marginTop: 14 } },
            React.createElement(Text, { style: S.h2 }, 'Next Actions'),
            React.createElement(Rule),
            ...data.nextActions.map((action, i) =>
              React.createElement(
                View,
                { key: i, style: S.recActionRow },
                React.createElement(Text, { style: { ...S.recActionNum, color: theme.accent } }, `${i + 1}.`),
                React.createElement(Text, { style: S.recActionText }, action),
              ),
            ),
          )
        : null,
      // Confidence bar
      React.createElement(
        View,
        { style: { marginTop: 20 } },
        React.createElement(Text, { style: S.h3 }, 'Recommendation Confidence'),
        React.createElement(Rule),
        React.createElement(
          View,
          { style: S.confidenceRow },
          React.createElement(Text, { style: S.confidenceLabel }, 'Overall Confidence'),
          React.createElement(
            View,
            { style: S.confidenceTrack },
            React.createElement(View, { style: { ...S.confidenceFill, width: `${confidence}%` } }),
          ),
          React.createElement(Text, { style: S.confidenceValue }, `${confidence}%`),
        ),
      ),
      // Disclaimer
      React.createElement(Rule),
      React.createElement(
        Text,
        { style: { ...S.caption, marginTop: 4 } },
        'This report was generated by Faultline Intelligence using AI-assisted simulation, agent-based pedestrian modelling, and LLM-powered scene analysis. All impression and reach data is indicative and subject to media owner confirmation. This document is confidential and intended solely for the named recipient.',
      ),
    ),
    React.createElement(Footer, { company }),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main document builder
// ─────────────────────────────────────────────────────────────────────────────

function buildWhitepaper(data: PdfWhitepaperRequest) {
  // Resolve brand theme once — all page builders receive this
  const theme = resolveTheme(data.brand)

  return React.createElement(
    Document,
    {
      title: data.reportTitle ?? `${data.companyName ?? 'Campaign'} OOH Media Brief`,
      author: 'Faultline Intelligence',
      subject: 'OOH Media Brief',
      creator: 'Faultline',
    },
    // Page I – Cover
    React.createElement(CoverPage, { data, theme }),

    // Page II – Media Assets
    React.createElement(MediaAssetsPage, { data, theme }),

    // Page III – Purchase Details
    React.createElement(PurchaseDetailsPage, { data, theme }),

    // Section A divider + pages
    React.createElement(SectionDivider, {
      letter: 'A',
      title: 'Media Feedback',
      description: 'AI-powered scene analysis from agent captures. Each page documents one agent observation: what was seen, how the creative performed in context, and what the simulation recommends.',
      theme,
    }),
    React.createElement(MediaFeedbackPages, { data, theme }),

    // Section B divider + pages
    React.createElement(SectionDivider, {
      letter: 'B',
      title: 'Audience Analysis',
      description: 'Demographic and behavioural breakdown of the audience exposed to each placement. Data is derived from pedestrian simulation, foot-traffic modelling, and contextual dwell-time analysis.',
      theme,
    }),
    React.createElement(AudienceAnalysisPages, { data, theme }),

    // Section C divider + pages
    React.createElement(SectionDivider, {
      letter: 'C',
      title: 'User Interviews',
      description: 'Verbatim transcripts from AI-simulated pedestrian interviews. Each subject encountered the billboard during the simulation and was asked about their recall, attention, and reaction.',
      theme,
    }),
    React.createElement(UserInterviewPages, { data, theme }),

    // Page X – Final Recommendation
    React.createElement(FinalRecommendationPage, { data, theme }),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handlers
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: PdfWhitepaperRequest
  try {
    body = (await req.json()) as PdfWhitepaperRequest
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  try {
    const doc = buildWhitepaper(body)
    const buffer = await renderToBuffer(doc)
    const pdfBody = Uint8Array.from(buffer).buffer
    const slug = (body.companyName ?? 'faultline')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    return new NextResponse(pdfBody, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${slug}-media-brief.pdf"`,
        'Content-Length': String(buffer.length),
      },
    })
  } catch (err) {
    console.error('[generate-pdf] POST error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'PDF generation failed' }, { status: 500 })
  }
}

// GET – demo preview with rich mock data
export async function GET(req: NextRequest) {
  // Allow ?color=RRGGBB test override, e.g. /api/generate-pdf?color=1a7f4b
  const reqUrl = new URL(req.url)
  const colorOverride = reqUrl.searchParams.get('color')
  const primaryColor  = colorOverride ? `#${colorOverride.replace(/^#/, '')}` : '#F5E800'
  const secondaryColor = '#1A1A1A'
  // Absolute base URL for serving static assets to react-pdf
  const baseUrl = `${reqUrl.protocol}//${reqUrl.host}`

  const mockData: PdfWhitepaperRequest = {
    // ── Brand identity derived from the Fluent ad creative ──────────────────
    // Primary:   #F5E800  Electric Yellow  — dominant background fill
    // Secondary: #1A1A1A  Near-Black        — text, UI chrome, hardware
    // Accent bg: auto-derived dark yellow (~18% luminance) for cover/dividers
    // Style:     High-contrast two-tone; bold geometric sans-serif; tech-forward
    brand: {
      primaryColor,
      secondaryColor,
      styleReference: 'High-contrast electric yellow / near-black two-tone. Bold geometric sans-serif headlines. Tech-forward, accessibility-first. Clean, confident, zero visual clutter.',
      fonts: ['Inter', 'Geist', 'system-ui'],
      avoidList: ['gradients', 'drop shadows', 'script fonts', 'pastel colors'],
    },

    reportTitle: 'Fluent — OOH Campaign Media Brief',
    companyName: 'Fluent',
    industry: 'Assistive Technology / AI',
    tagline: 'Making Accessibility Accessible.',
    campaignObjective: 'Waitlist Growth + Brand Awareness',
    preparedFor: 'Fluent Marketing Team',
    preparedBy: 'Faultline Intelligence',
    campaignDates: '1 July – 30 September 2026',
    // ── Media Assets — Fluent ad creative as the default asset ──────────────
    // No external placements provided for this demo; the creative itself is shown.
    mediaAssets: [
      {
        id: 'fluent-creative',
        name: 'Fluent — Hero Ad Creative',
        format: 'Digital Billboard / Large Format',
        location: 'Default Creative Asset',
        widthM: 9.6,
        heightM: 3.2,
        weeklyReach: 0,
        visibilityScore: 88,
        imageUrl: `${baseUrl}/fluent-mock.png`,
      },
    ],

    mediaFeedback: [
      {
        captureId: 'cap-001',
        agentName: 'Pedestrian 007',
        billboardName: 'Orchard MRT Digital Billboard',
        timestamp: Date.now() - 3_600_000,
        sceneDescription: 'High-density pedestrian corridor at Orchard MRT exit B. Mixed demographic of office workers, students, and tourists. Ambient light is moderate; competing signage from retail tenants creates visual noise at eye level. The digital billboard occupies the upper zone above the taxi stand, with an unobstructed faultline of approximately 35 metres.',
        adDescription: 'Electric yellow full-bleed background with the Fluent wordmark and icon top-left in near-black. Headline reads "Making Accessibility Accessible" in bold geometric sans-serif across two lines. Right half features a 3D render of the Fluent desktop app on a dark monitor with yellow UI accents. Hardware devices (sip-and-puff puck, LED haptic tile) are visible in the lower-right foreground. CTA strip at the bottom reads "Join the Waitlist at getfluent.tech" in a dark rounded pill.',
        firstImpression: 'The electric yellow background creates an immediate and powerful contrast against the grey station environment. The creative is unmistakably visible from the full 35-metre approach distance. The headline is legible in under 2 seconds.',
        likelyAttention: 'Very high for stationary pedestrians in the taxi queue (avg dwell ~21s). The yellow-black contrast is among the highest-performing colour combinations for peripheral vision capture. The 3D hardware render adds a curiosity hook that extends gaze duration beyond the initial colour trigger.',
        likelyConfusion: 'The product category — assistive AI — is not immediately obvious to a general audience. Pedestrians unfamiliar with accessibility technology may not self-identify as the target user. The URL in the CTA is readable but requires a deliberate pause to memorise.',
        simpleRecommendation: 'The creative is visually excellent. To improve conversion, add a short descriptor line beneath the headline — e.g. "AI that lets anyone control their computer by voice, breath, or movement" — to bridge the awareness gap for non-specialist audiences. The CTA URL should also appear as a QR code.',
      },
      {
        captureId: 'cap-002',
        agentName: 'Pedestrian 031',
        billboardName: 'one-north MRT Station Domination',
        timestamp: Date.now() - 2_100_000,
        sceneDescription: 'one-north MRT station serves a dense cluster of tech companies, research institutes, and startup offices. Commuter profile skews strongly toward engineers, product managers, and researchers aged 24–40. Dwell time in the station is elevated due to bus interchange connections. The station domination format covers all four platform walls and the fare gate zone.',
        adDescription: 'Station domination execution of the Fluent creative system. Yellow panels alternate with near-black panels carrying the feature icons (Sip & Puff, Head Tracking, Voice, Text, Haptics) at large scale. The app UI screenshot is displayed at near life-size on the platform wall facing the train doors.',
        firstImpression: 'Total brand immersion. The yellow-black alternation across the station creates a coherent, high-energy environment that is impossible to ignore. The feature icons at large scale communicate product breadth without requiring text.',
        likelyAttention: 'Extremely high. Station domination format guarantees 100% share of visual space. The tech-savvy commuter profile at one-north is the ideal primary audience for an AI accessibility product. Multiple exposure points across the commute journey reinforce brand recall.',
        likelyConfusion: 'Some commuters may perceive the brand as a general AI assistant rather than an accessibility-specific product. The feature icons are clear to a tech audience but may require context for others.',
        simpleRecommendation: 'This is the highest-value placement in the plan. Prioritise budget here. Consider adding a short testimonial from a real user on one of the black panels to add human credibility to the technology proposition.',
      },
    ],

    interviews: [
      {
        name: 'Aisha Rahman',
        age: 28,
        occupation: 'Software Engineer',
        neighbourhood: 'Buona Vista',
        commute: 'MRT daily (one-north line)',
        gender: 'Female',
        billboardSeen: 'one-north MRT Station Domination',
        score: 89,
        feedback: 'Aisha demonstrated strong unaided recall and immediately connected the product to a professional use case. Her engineering background meant she understood the multimodal input concept without explanation. She expressed high purchase intent and had already visited the website before the interview.',
        transcript: [
          { role: 'interviewer', text: 'Good morning. Did you notice any advertising at one-north MRT station today?' },
          { role: 'pedestrian', text: 'The yellow one? Yes, absolutely. You couldn\'t miss it — the whole station was covered. It was for something called Fluent.' },
          { role: 'interviewer', text: 'Can you tell me what you understood the product to be?' },
          { role: 'pedestrian', text: 'It\'s an AI that lets people control their computer without using their hands. I saw the icons — voice, head tracking, sip and puff. I work in accessibility tools so I immediately got it. Really interesting product.' },
          { role: 'interviewer', text: 'Did the advertising make you want to find out more?' },
          { role: 'pedestrian', text: 'I already went to the website actually. I saw the URL on the ad and looked it up on my phone on the train. I joined the waitlist.' },
          { role: 'interviewer', text: 'What was the most memorable part of the creative?' },
          { role: 'pedestrian', text: 'The yellow. It\'s very bold. And the headline — "Making Accessibility Accessible" — is genuinely clever. It says a lot in very few words.' },
        ],
      },
      {
        name: 'David Lim',
        age: 52,
        occupation: 'Occupational Therapist',
        neighbourhood: 'Clementi',
        commute: 'Bus + MRT',
        gender: 'Male',
        billboardSeen: 'Orchard MRT Digital Billboard',
        score: 71,
        feedback: 'David had clear recall of the visual but initially misread the product category as a general productivity app. After prompting, he recognised the accessibility angle and expressed strong professional interest. His OT background makes him a high-value secondary audience — a potential referral channel to patients.',
        transcript: [
          { role: 'interviewer', text: 'Did you notice any outdoor advertising at Orchard MRT this afternoon?' },
          { role: 'pedestrian', text: 'There was a very yellow one. I remember thinking it was quite striking. Something about accessibility I think.' },
          { role: 'interviewer', text: 'What did you understand the product to be?' },
          { role: 'pedestrian', text: 'I thought it was maybe a productivity app? Like a voice assistant for work. I didn\'t fully read it — I was in a hurry.' },
          { role: 'interviewer', text: 'It\'s actually an AI that helps people with disabilities control their computer — by voice, breath, head movement, or haptics.' },
          { role: 'pedestrian', text: 'Oh, that\'s very relevant to my work. I\'m an occupational therapist. My patients with motor impairments really struggle with standard computers. I would absolutely recommend something like this. Do you have a card or website?' },
          { role: 'interviewer', text: 'The URL was on the ad — getfluent.tech.' },
          { role: 'pedestrian', text: 'I\'ll look that up today. This is exactly the kind of tool we need. The ad should make the disability angle clearer though — I nearly walked past it.' },
        ],
      },
      {
        name: 'Mei Lin Tan',
        age: 19,
        occupation: 'Polytechnic Student (IT)',
        neighbourhood: 'Tampines',
        commute: 'MRT + Bus',
        gender: 'Female',
        billboardSeen: 'Orchard MRT Digital Billboard',
        score: 64,
        feedback: 'Mei Lin had moderate recall and correctly identified the brand name but was uncertain about the product category. The yellow colour was the primary recall anchor. She showed interest once the product was explained but did not self-identify as the target user, suggesting the creative needs a stronger audience signal for non-specialist viewers.',
        transcript: [
          { role: 'interviewer', text: 'Hi! We\'re doing a quick survey. Did you see any interesting ads today?' },
          { role: 'pedestrian', text: 'There was a really yellow one at the MRT. Fluent? I think that was the name. It had a computer on it.' },
          { role: 'interviewer', text: 'Do you remember what it was advertising?' },
          { role: 'pedestrian', text: 'Some kind of app? I wasn\'t sure. It said accessibility but I wasn\'t sure what that meant in this context. Like, web accessibility?' },
          { role: 'interviewer', text: 'It\'s an AI that lets people with disabilities control their computer using voice, breath, or head movement.' },
          { role: 'pedestrian', text: 'Oh wow, that\'s actually really cool. I have a classmate who has limited hand mobility — this could be really useful for him. I\'ll send him the link.' },
          { role: 'interviewer', text: 'On a scale of 1 to 10, how memorable was the ad?' },
          { role: 'pedestrian', text: 'Maybe a 6? The colour was very memorable but I didn\'t fully understand what they were selling until you explained it. The headline is clever but maybe too subtle for a billboard.' },
        ],
      },
    ],

    recommendation: 'Based on simulation data, agent captures, audience analysis, and user interviews, we recommend leading the Fluent OOH campaign with the one-north MRT Station Domination as the primary brand-building placement, targeting the tech and research professional demographic that maps most directly to the product\'s early adopter profile. The Orchard MRT Digital Billboard should run concurrently as a high-reach awareness driver. Both placements should carry a QR code linking directly to the waitlist. The Bugis Junction placement should be activated in Q3 if waitlist conversion data supports broader audience targeting.',
    topPlacement: 'one-north MRT Station Domination',
    topPlacementScore: 83,
    confidenceLevel: 84,
    nextActions: [
      'Confirm one-north Station Domination availability for July – September with SMRT Trains Media.',
      'Add QR code linking to getfluent.tech/waitlist to both primary creatives.',
      'Insert a one-line product descriptor beneath the headline to clarify the disability-tech category for non-specialist audiences.',
      'Brief creative team on a testimonial panel variant for the one-north black wall panels.',
      'Set up UTM tracking on the waitlist URL to attribute signups to each OOH placement.',
      'Schedule a 30-day post-launch recall study to validate simulation predictions.',
    ],
  }

  try {
    const doc = buildWhitepaper(mockData)
    const buffer = await renderToBuffer(doc)
    const pdfBody = Uint8Array.from(buffer).buffer
    return new NextResponse(pdfBody, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="faultline-demo-whitepaper.pdf"',
        'Content-Length': String(buffer.length),
      },
    })
  } catch (err) {
    console.error('[generate-pdf] GET error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'PDF generation failed' }, { status: 500 })
  }
}
