import { NextRequest, NextResponse } from 'next/server'
import { createOpenAIResponse, getOpenAIOutputText, getOpenAITextModel } from '@/lib/openaiResponses'
import { getAgentModel } from '@/lib/agentIdentity'
import type { AgentInsightEvidenceTag, AgentInsightFailureMode, AgentKind, AgentQualitativeInsight } from '@/types'

const FALLBACK_THOUGHTS = [
  "I noticed it, but it didn't really stick.",
  "Too much to read while walking past.",
  "I caught the colors, not the message.",
  "It was there, but I kept moving.",
  "I couldn't tell what it was for quickly enough.",
  "The layout felt busy at a glance.",
  "I saw it for a second, then forgot it.",
  "It might work better with fewer words.",
  "The headline was big, but I still didn't get the point.",
  "I looked up for half a second and went back to my phone.",
  "The image did more work than the words.",
  "I remember the color more than the brand.",
  "It felt like one of those ads you only understand if you stop.",
  "Not bad, just not something I needed right now.",
  "I think I saw a product, but I couldn't tell what problem it solves.",
  "The contrast helped, but the message disappeared fast.",
  "It blended into the street noise for me.",
  "I probably would have missed it if I wasn't already looking that way.",
  "The offer needed to be clearer from far away.",
  "I noticed the logo, but nothing made me care.",
  "It looked polished, just a little too generic.",
  "I got the vibe, not the actual takeaway.",
  "That one was readable, but I forgot the name immediately.",
  "I liked the visual, but the copy asked for too much time.",
  "It felt aimed at someone else.",
  "I could see it working if I were already shopping for that.",
  "The main line landed, the rest was a blur.",
  "I noticed the motion, then lost interest.",
  "It felt more like background decoration than a pitch.",
  "I understood the category, but not why I should act.",
  "The ad was clear enough, but it didn't slow me down.",
  "I would need a stronger hook to remember it later.",
  "The design caught my eye, but the message didn't cash it in.",
  "It looked expensive, which made me assume it wasn't for me.",
  "The CTA was there, but I didn't have time to process it.",
  "I saw a face and some text, but nothing specific stuck.",
  "The first word worked, then the smaller text lost me.",
  "It made me curious for a second, not enough to do anything.",
  "I caught the brand color, but not the brand itself.",
  "It felt calm, maybe too calm for a busy sidewalk.",
  "The ad was fine. My brain just filed it under city stuff.",
  "If the benefit was simpler, I might have remembered it.",
  "I noticed it after I had already passed the best viewing angle.",
]

function normaliseThought(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function fallbackThought(seed: string, previousThoughts: string[] = []): string {
  const used = new Set(previousThoughts.map(normaliseThought))
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0
  }
  const start = Math.abs(hash) % FALLBACK_THOUGHTS.length
  for (let i = 0; i < FALLBACK_THOUGHTS.length; i++) {
    const thought = FALLBACK_THOUGHTS[(start + i) % FALLBACK_THOUGHTS.length]
    if (!used.has(normaliseThought(thought))) return thought
  }
  return `I noticed it, but my reaction was mostly just a quick pass-by impression ${previousThoughts.length + 1}.`
}

function hashString(seed: string): number {
  let hash = 2166136261 >>> 0
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  return hash
}

function pickAttentionContext(agentKind: AgentKind | undefined, seed: string): AgentQualitativeInsight['context'] {
  const h = hashString(`${agentKind ?? 'walker'}:${seed}`)
  const profile = getAgentModel(agentKind).attention
  return {
    mode: profile.mode,
    dwellSeconds: profile.dwellBaseSeconds + (h % profile.dwellVarianceTenths) / 10,
    pace: profile.pace,
    attentionConstraint: profile.attentionConstraint,
  }
}

const FAILURE_MODES: AgentInsightFailureMode[] = [
  'low_noticeability',
  'slow_read',
  'weak_branding',
  'unclear_offer',
  'missed_cta',
  'poor_relevance',
  'environment_clutter',
  'format_mismatch',
]

const EVIDENCE_TAGS: AgentInsightEvidenceTag[] = [
  'direct_quote',
  'simulated_dwell',
  'repeated_pattern',
  'creative_diagnosis',
]

function fallbackInsight(input: {
  seed: string
  thought: string
  billboardName: string
  creativeText: string
  format: string
  agentKind?: AgentKind
}): AgentQualitativeInsight {
  const context = pickAttentionContext(input.agentKind, input.seed)
  const h = hashString(input.seed)
  const failureMode = FAILURE_MODES[h % FAILURE_MODES.length]
  const hasCopy = input.creativeText.trim().length > 0

  return {
    quote: input.thought,
    firstNoticed: hasCopy ? 'The main visual block and largest words registered first.' : 'The board registered as street advertising before the message resolved.',
    remembered: hasCopy ? input.creativeText.trim().split(/\s+/).slice(0, 5).join(' ') : input.billboardName,
    missed: failureMode === 'missed_cta'
      ? 'The call to action did not survive the quick glance.'
      : failureMode === 'weak_branding'
        ? 'The brand or category was not distinctive enough to recall cleanly.'
        : 'The specific takeaway blurred after the pass-by moment.',
    whyItMatters: `This is a ${context.dwellSeconds.toFixed(1)}s ${context.mode}, so the ad needs one fast hierarchy: brand, benefit, action.`,
    creativeFix: 'Reduce secondary copy, enlarge the brand or product cue, and make the benefit readable before the CTA.',
    failureMode,
    evidenceTag: 'simulated_dwell',
    context,
  }
}

function cleanText(value: unknown, fallback: string, maxLength = 180): string {
  return typeof value === 'string' && value.trim()
    ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength)
    : fallback
}

function coerceInsight(value: unknown, fallback: AgentQualitativeInsight): AgentQualitativeInsight {
  if (!value || typeof value !== 'object') return fallback
  const raw = value as Partial<AgentQualitativeInsight>
  const failureMode = FAILURE_MODES.includes(raw.failureMode as AgentInsightFailureMode)
    ? raw.failureMode as AgentInsightFailureMode
    : fallback.failureMode
  const evidenceTag = EVIDENCE_TAGS.includes(raw.evidenceTag as AgentInsightEvidenceTag)
    ? raw.evidenceTag as AgentInsightEvidenceTag
    : fallback.evidenceTag

  return {
    quote: cleanText(raw.quote, fallback.quote, 220),
    firstNoticed: cleanText(raw.firstNoticed, fallback.firstNoticed),
    remembered: cleanText(raw.remembered, fallback.remembered, 120),
    missed: cleanText(raw.missed, fallback.missed),
    whyItMatters: cleanText(raw.whyItMatters, fallback.whyItMatters, 240),
    creativeFix: cleanText(raw.creativeFix, fallback.creativeFix, 240),
    failureMode,
    evidenceTag,
    context: fallback.context,
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Partial<{
    agentName: string
    agentKind: AgentKind
    billboardName: string
    creativeText: string | null
    format: string | null
    previousThoughts: string[]
  }>
  const agentName = body.agentName ?? 'Pedestrian'
  const agentKind = body.agentKind
  const billboardName = body.billboardName ?? 'Outdoor ad'
  const creativeText = body.creativeText ?? ''
  const format = body.format ?? 'unknown'
  const previousThoughts = Array.isArray(body.previousThoughts)
    ? body.previousThoughts.filter((thought): thought is string => typeof thought === 'string' && thought.trim().length > 0)
    : []

  const seed = `${agentName}:${billboardName}:${creativeText}:${format}:${agentKind ?? 'walker'}`
  const context = pickAttentionContext(agentKind, seed)

  const system = `You generate qualitative research evidence from a synthetic pedestrian who just noticed an outdoor advertisement while moving past it.

The output must feel defensible, not like generic flavor text. Separate the pedestrian's raw reaction from the research interpretation.

Pedestrian quote rules:
- First person, casual, 1-2 short sentences.
- Mention a concrete reason: what they saw, what they remembered, or what failed.
- Do not sound like a marketer or analyst.

Research fields:
- firstNoticed: concrete visual or copy element noticed first.
- remembered: brand/category/offer remembered after the glance, or "unclear" if not remembered.
- missed: what did not land.
- whyItMatters: analyst-style explanation tied to dwell time and viewing constraint.
- creativeFix: one concrete change to improve the ad.

Most pedestrians are neutral or negative: they barely noticed it, could not read it in time, did not remember the brand, or did not care. Occasionally one is mildly interested.

Never reference a specific location, street name, or billboard name. Do not repeat any previous quote verbatim.

Output ONLY valid JSON matching this shape:
{
  "thought": "same as insight.quote",
  "insight": {
    "quote": "...",
    "firstNoticed": "...",
    "remembered": "...",
    "missed": "...",
    "whyItMatters": "...",
    "creativeFix": "...",
    "failureMode": "low_noticeability|slow_read|weak_branding|unclear_offer|missed_cta|poor_relevance|environment_clutter|format_mismatch",
    "evidenceTag": "direct_quote|simulated_dwell|creative_diagnosis"
  }
}`

  const userMessage = `Pedestrian: ${agentName}
Agent type: ${agentKind ?? 'walker'}
Viewing context: ${context.mode}, ${context.dwellSeconds.toFixed(1)} seconds dwell, ${context.pace}. Constraint: ${context.attentionConstraint}.
Billboard label: ${billboardName}
Ad copy: "${creativeText}"
Ad format: ${format}
Previous thoughts to avoid:
${previousThoughts.length > 0 ? previousThoughts.map(thought => `- ${thought}`).join('\n') : '- none yet'}

Generate the research packet.`

  try {
    const json = await createOpenAIResponse({
      model: getOpenAITextModel('OPENAI_REACTION_MODEL'),
      maxOutputTokens: 520,
      instructions: system,
      messages: [{ role: 'user', content: userMessage }],
    })

    const rawText = getOpenAIOutputText(json)
    const match = rawText.match(/\{[\s\S]*\}/)
    if (!match) {
      const thought = fallbackThought(`${seed}:missing-json`, previousThoughts)
      return NextResponse.json({
        thought,
        qualitativeInsight: fallbackInsight({ seed: `${seed}:missing-json`, thought, billboardName, creativeText, format, agentKind }),
      })
    }

    const parsed = JSON.parse(match[0]) as { thought?: string; insight?: unknown }
    const fallback = fallbackInsight({
      seed,
      thought: fallbackThought(`${seed}:parsed`, previousThoughts),
      billboardName,
      creativeText,
      format,
      agentKind,
    })
    const insight = coerceInsight(parsed.insight, fallback)
    const thought = parsed.thought?.trim() || insight.quote
    if (!thought || previousThoughts.some(previous => normaliseThought(previous) === normaliseThought(thought))) {
      const replacement = fallbackThought(`${seed}:duplicate`, previousThoughts)
      return NextResponse.json({
        thought: replacement,
        qualitativeInsight: { ...insight, quote: replacement },
        fallback: true,
      })
    }
    return NextResponse.json({ thought, qualitativeInsight: { ...insight, quote: thought } })
  } catch (err) {
    console.warn('[agent-reaction] using fallback thought:', err instanceof Error ? err.message : String(err))
    const thought = fallbackThought(seed, previousThoughts)
    return NextResponse.json(
      {
        thought,
        qualitativeInsight: fallbackInsight({ seed, thought, billboardName, creativeText, format, agentKind }),
        fallback: true,
      },
      { status: 200 },
    )
  }
}
