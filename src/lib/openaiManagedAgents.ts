import type { BillboardPlacement, LatLng, ManagedAgentDisplayEvent, ManagedAgentResources, PedestrianInterviewLine } from '@/types'
import { createOpenAIResponse, getOpenAIOutputText, getOpenAITextModel } from '@/lib/openaiResponses'

interface OpenAISession {
  id: string
  status: string
  agent?: { id?: string }
}

type OpenAIManagedEvent = {
  id?: string
  type?: string
  processed_at?: string | null
  content?: Array<{ type?: string; text?: string }>
  name?: string
  input?: unknown
  error?: { type?: string; message?: string }
  stop_reason?: unknown
}

export class ManagedAgentsConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ManagedAgentsConfigError'
  }
}

const sessions = new Map<string, OpenAIManagedEvent[]>()
let cachedInterviewAgentId: string | null = null

export function getConfiguredManagedAgentResources(): ManagedAgentResources | null {
  return {
    agentId: process.env.OPENAI_MANAGED_AGENT_ID || 'openai-faultline-agent',
    environmentId: process.env.OPENAI_MANAGED_ENVIRONMENT_ID || 'openai-responses',
  }
}

export async function createFaultlineManagedAgentResources(): Promise<ManagedAgentResources> {
  return getConfiguredManagedAgentResources() as ManagedAgentResources
}

export async function startFaultlineAgencySession(input: {
  area: LatLng
  brief: string
  resources?: ManagedAgentResources | null
}): Promise<OpenAISession & ManagedAgentResources> {
  const resources = input.resources ?? getConfiguredManagedAgentResources()
  if (!resources) {
    throw new ManagedAgentsConfigError('Missing OpenAI managed-agent resources.')
  }

  const sessionId = `openai-agency-${Date.now().toString(36)}`
  const prompt = buildCampaignRunPrompt(input.area, input.brief)
  const response = await createOpenAIResponse({
    model: getOpenAITextModel('OPENAI_AGENCY_MODEL'),
    maxOutputTokens: 1200,
    instructions: buildFaultlineAgentSystemPrompt(),
    messages: [{ role: 'user', content: prompt }],
  })

  sessions.set(sessionId, [
    userEvent('evt_user', prompt),
    agentEvent('evt_agent', getOpenAIOutputText(response)),
    idleEvent('evt_idle'),
  ])

  return {
    id: sessionId,
    status: 'idle',
    agent: { id: resources.agentId },
    ...resources,
  }
}

export async function sendSessionMessage(sessionId: string, text: string): Promise<void> {
  const events = sessions.get(sessionId) ?? []
  const response = await createOpenAIResponse({
    model: getOpenAITextModel('OPENAI_AGENCY_MODEL'),
    maxOutputTokens: 1200,
    instructions: buildFaultlineAgentSystemPrompt(),
    messages: [{ role: 'user', content: text }],
  })

  events.push(userEvent(`evt_user_${events.length}`, text))
  events.push(agentEvent(`evt_agent_${events.length}`, getOpenAIOutputText(response)))
  events.push(idleEvent(`evt_idle_${events.length}`))
  sessions.set(sessionId, events)
}

export async function getSession(sessionId: string): Promise<OpenAISession> {
  return { id: sessionId, status: sessions.has(sessionId) ? 'idle' : 'unknown' }
}

export async function listSessionEvents(sessionId: string): Promise<OpenAIManagedEvent[]> {
  return sessions.get(sessionId) ?? []
}

export function toDisplayEvents(events: OpenAIManagedEvent[]): ManagedAgentDisplayEvent[] {
  return events
    .filter(event => event.type && !event.type.startsWith('span.'))
    .map((event, index) => {
      const type = event.type ?? 'unknown'
      const id = event.id ?? `${type}_${index}`

      if (type === 'user.message') {
        return {
          id,
          type,
          actor: 'Faultline App',
          title: 'Sent campaign task',
          detail: textFromContent(event.content) || 'User message sent to the managed agent.',
          status: event.processed_at ? 'complete' : 'queued',
          processedAt: event.processed_at,
        }
      }

      if (type === 'agent.message') {
        return {
          id,
          type,
          actor: 'AI Agent',
          title: 'Agent response',
          detail: textFromContent(event.content) || 'OpenAI returned a message.',
          status: 'complete',
          processedAt: event.processed_at,
        }
      }

      if (type === 'session.status_idle') {
        return {
          id,
          type,
          actor: 'Session',
          title: 'Session idle',
          detail: event.stop_reason ? JSON.stringify(event.stop_reason) : 'The OpenAI-backed session is waiting for the next event.',
          status: 'needs-approval',
          processedAt: event.processed_at,
        }
      }

      return {
        id,
        type,
        actor: 'Session',
        title: type,
        detail: 'Session event received.',
        status: event.processed_at ? 'complete' : 'queued',
        processedAt: event.processed_at,
      }
    })
}

export function buildCampaignRunPrompt(area: LatLng, brief: string): string {
  return [
    'Run Faultline as an AI-operated physical marketing / out-of-home agency desk.',
    '',
    `Campaign brief: ${brief}`,
    `Selected area: latitude ${area.lat}, longitude ${area.lng}.`,
    '',
    'Your job:',
    '1. Discover likely OOH opportunity types and relevant operators or venue categories for this area.',
    '2. Qualify the opportunities by audience, format fit, operational risk, creative constraints, and vendor questions.',
    '3. Be explicit about assumptions if exact inventory availability is not public.',
    '4. Simulate Faultline-style pre-flight scoring conceptually: visibility, dwell time, clutter, viewing angle, audience fit, creative readability, and inquiry priority.',
    '5. Draft the vendor inquiry packet, but do not claim to have sent anything.',
    '',
    'Important approval rule: stop after drafting the inquiry packet and ask for human approval before continuing to final recommendation. Do not book, email, spend money, sign contracts, or share client data.',
  ].join('\n')
}

function buildFaultlineAgentSystemPrompt(): string {
  return [
    'You are Faultline, an AI-operated OOH agency desk for physical advertising campaigns.',
    'You discover possible out-of-home inventory paths, qualify opportunities, run pre-flight reasoning, prepare vendor inquiry packets, and produce buyer-facing campaign recommendations.',
    'You are careful with uncertainty: distinguish verified facts, assumptions, and recommended follow-up questions.',
    'You must never send real vendor outreach, commit spend, book inventory, sign contracts, or imply approval without explicit user confirmation.',
    'For the demo, show your work through concise phase-labeled outputs: Discovery, Qualification, Simulation, Inquiry Draft, Approval Needed, and Final Plan.',
  ].join('\n')
}

function textFromContent(content: OpenAIManagedEvent['content']): string {
  return (content ?? [])
    .filter(block => block.type === 'text' && block.text)
    .map(block => block.text)
    .join('\n')
}

export async function getOrCreatePedestrianInterviewAgent(): Promise<string> {
  if (cachedInterviewAgentId) return cachedInterviewAgentId
  cachedInterviewAgentId = process.env.OPENAI_MANAGED_INTERVIEW_AGENT_ID || 'openai-pedestrian-interviewer'
  return cachedInterviewAgentId
}

export async function startPedestrianInterviewSession(input: {
  agentName: string
  billboardName: string
  billboard?: BillboardPlacement | null
  environmentId: string
  agentId: string
}): Promise<string> {
  const sessionId = `openai-interview-${Date.now().toString(36)}`
  const response = await createOpenAIResponse({
    model: getOpenAITextModel('OPENAI_PEDESTRIAN_INTERVIEW_MODEL'),
    maxOutputTokens: 700,
    instructions: buildPedestrianInterviewSystemPrompt(),
    messages: [{ role: 'user', content: buildPedestrianInterviewPrompt(input.agentName, input.billboardName, input.billboard ?? null) }],
  })

  sessions.set(sessionId, [
    userEvent('evt_interview_user', `Pedestrian interview requested for ${input.agentName}.`),
    agentEvent('evt_interview_agent', getOpenAIOutputText(response)),
    idleEvent('evt_interview_idle'),
  ])

  return sessionId
}

export function parsePedestrianInterviewResponse(events: OpenAIManagedEvent[]): {
  transcript: PedestrianInterviewLine[]
  score?: number
  feedback?: string
  status: 'running' | 'idle' | 'error'
} {
  const agentMessages = events.filter(e => e.type === 'agent.message')
  const hasIdle = events.some(e => e.type === 'session.status_idle')
  const hasError = events.some(e => e.type === 'session.error')

  if (hasError) return { transcript: [], status: 'error' }
  if (agentMessages.length === 0) return { transcript: [], status: 'running' }

  const rawText = agentMessages.map(e => textFromContent(e.content)).join('\n')
  const match = rawText.match(/\{[\s\S]*\}/)
  if (!match) {
    return { transcript: [{ role: 'interviewer', text: rawText.slice(0, 300) }], status: hasIdle ? 'idle' : 'running' }
  }

  try {
    const parsed = JSON.parse(match[0]) as {
      transcript?: PedestrianInterviewLine[]
      score?: number
      feedback?: string
    }
    return {
      transcript: Array.isArray(parsed.transcript) ? parsed.transcript : [],
      score: typeof parsed.score === 'number' ? parsed.score : undefined,
      feedback: typeof parsed.feedback === 'string' ? parsed.feedback : undefined,
      status: hasIdle ? 'idle' : 'running',
    }
  } catch {
    return { transcript: [{ role: 'interviewer', text: rawText.slice(0, 300) }], status: hasIdle ? 'idle' : 'running' }
  }
}

function buildPedestrianInterviewSystemPrompt(): string {
  return [
    'You are a field researcher for Faultline, an OOH advertising analytics platform.',
    'When given context about a pedestrian who just saw a billboard, simulate a brief 3-question street interview.',
    'Play both the researcher and the pedestrian authentically. The pedestrian should feel like a real person with opinions.',
    'Most pedestrians are neutral or negative: they barely noticed the ad, could not read it in time, it did not catch their eye, or they did not find it interesting. Only occasionally is someone mildly positive.',
    'The pedestrian should never mention specific street names, intersections, or the billboard location, only the content of the ad or their general reaction to it.',
    'Output ONLY valid JSON. No markdown, no explanation outside the JSON object.',
    'Format: { "transcript": [{"role": "interviewer"|"pedestrian", "text": "..."}...], "score": 0-100, "feedback": "one improvement suggestion" }',
    'The score (0-100) rates overall ad effectiveness based on recall, comprehension, and emotional resonance shown in the simulated answers. Scores should generally be low to mid-range, reflecting realistic ad recall rates.',
  ].join('\n')
}

function buildPedestrianInterviewPrompt(agentName: string, billboardName: string, billboard: BillboardPlacement | null): string {
  const details = billboard
    ? [
        `Format: ${billboard.format}`,
        `Creative: "${billboard.creativeText}"`,
        `Colors: ${billboard.primaryColor} / ${billboard.secondaryColor}`,
        `Size: ${billboard.widthM}m x ${billboard.heightM}m`,
      ].join(', ')
    : `Ad name: ${billboardName}`

  return [
    `Pedestrian name: ${agentName}`,
    details,
    '',
    'Simulate a 3-question street interview. Return valid JSON only.',
  ].join('\n')
}

function userEvent(id: string, text: string): OpenAIManagedEvent {
  return {
    id,
    type: 'user.message',
    processed_at: new Date().toISOString(),
    content: [{ type: 'text', text }],
  }
}

function agentEvent(id: string, text: string): OpenAIManagedEvent {
  return {
    id,
    type: 'agent.message',
    processed_at: new Date().toISOString(),
    content: [{ type: 'text', text }],
  }
}

function idleEvent(id: string): OpenAIManagedEvent {
  return {
    id,
    type: 'session.status_idle',
    processed_at: new Date().toISOString(),
    stop_reason: 'response_complete',
  }
}
