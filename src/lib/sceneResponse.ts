import type {
  SceneImagePayload,
  SceneResponseApiResponse,
  SceneResponseBudget,
  SceneResponseRequest,
  SceneResponseResult,
} from '@/types'
import {
  createOpenAIResponse,
  getOpenAIOutputText,
  getOpenAITextModel,
  type OpenAIInputContent,
  type OpenAIResponseBody,
} from '@/lib/openaiResponses'

const DEFAULT_BUDGET_USD = 25
const DEFAULT_INPUT_USD_PER_MILLION_TOKENS = 1.25
const DEFAULT_OUTPUT_USD_PER_MILLION_TOKENS = 10
const MAX_IMAGE_BYTES = 4 * 1024 * 1024
const MAX_PROMPT_CHARS = 2000

const SUPPORTED_MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])

interface ParsedImage {
  mediaType: string
  base64: string
  byteLength: number
}

export class SceneResponseError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'SceneResponseError'
    this.status = status
  }
}

let spentUsd = 0

function getEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function getBudgetLimitUsd(): number {
  return getEnvNumber('FAULTLINE_MAX_LLM_SPEND_USD', DEFAULT_BUDGET_USD)
}

function getInputPrice(): number {
  return getEnvNumber('OPENAI_INPUT_USD_PER_MTOKENS', DEFAULT_INPUT_USD_PER_MILLION_TOKENS)
}

function getOutputPrice(): number {
  return getEnvNumber('OPENAI_OUTPUT_USD_PER_MTOKENS', DEFAULT_OUTPUT_USD_PER_MILLION_TOKENS)
}

function costForUsage(inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1_000_000) * getInputPrice() + (outputTokens / 1_000_000) * getOutputPrice()
}

export function getSceneResponseBudgetSnapshot(estimatedCostUsd = 0): SceneResponseBudget {
  const limitUsd = getBudgetLimitUsd()
  return {
    limitUsd,
    spentUsd,
    estimatedCostUsd,
    remainingUsd: Math.max(0, limitUsd - spentUsd),
  }
}

export function resetSceneResponseBudgetForTest(): void {
  spentUsd = 0
}

export function parseImageDataUrl(image: SceneImagePayload | null | undefined, label: string): ParsedImage {
  if (!image?.dataUrl) {
    throw new SceneResponseError(`${label} image is required.`)
  }

  const match = image.dataUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/)
  if (!match) {
    throw new SceneResponseError(`${label} image must be a base64 data URL.`)
  }

  const mediaType = match[1].toLowerCase()
  const base64 = match[2]

  if (!SUPPORTED_MEDIA_TYPES.has(mediaType)) {
    throw new SceneResponseError(`${label} image must be PNG, JPEG, or WebP.`)
  }

  const byteLength = Math.floor((base64.length * 3) / 4)
  if (byteLength > MAX_IMAGE_BYTES) {
    throw new SceneResponseError(`${label} image is too large. Keep it under 4 MB after compression.`, 413)
  }

  return { mediaType, base64, byteLength }
}

export function estimateRequestCostUsd(input: {
  sceneImageBytes: number
  adImageBytes?: number
  promptChars: number
  maxOutputTokens: number
}): number {
  const imageBytes = input.sceneImageBytes + (input.adImageBytes ?? 0)
  const estimatedInputTokens = Math.ceil(input.promptChars / 4) + Math.ceil(imageBytes / 350)
  return Math.max(0.02, costForUsage(estimatedInputTokens, input.maxOutputTokens))
}

function assertBudgetAvailable(estimatedCostUsd: number): void {
  const limitUsd = getBudgetLimitUsd()
  if (spentUsd + estimatedCostUsd > limitUsd) {
    throw new SceneResponseError(
      `Faultline LLM budget limit reached. Estimated request cost $${estimatedCostUsd.toFixed(4)} would exceed the $${limitUsd.toFixed(2)} cap.`,
      402
    )
  }
}

function buildPrompt(input: SceneResponseRequest): string {
  const brief = input.brief?.trim().slice(0, MAX_PROMPT_CHARS)
  const viewerProfile = input.viewerProfile?.trim() || 'urban pedestrian or commuter with short dwell time, partial phone distraction, and normal sensitivity to visual clutter'

  return [
    'You are Faultline, a market-simulation agent for out-of-home ads.',
    'Analyze the provided 3D scene camera view and optional ad creative image.',
    `Default viewer profile: ${viewerProfile}.`,
    brief ? `Campaign brief: ${brief}` : 'Campaign brief: not provided.',
    '',
    'Return only compact JSON with these exact string keys:',
    'scene_description, ad_description, first_impression, likely_attention, likely_confusion, simple_recommendation.',
    'Keep each value under 32 words. Do not include markdown.',
  ].join('\n')
}

function toDataUrl(image: ParsedImage): string {
  return `data:${image.mediaType};base64,${image.base64}`
}

function buildContentBlocks(input: SceneResponseRequest, sceneImage: ParsedImage, adImage?: ParsedImage): OpenAIInputContent[] {
  const blocks: OpenAIInputContent[] = [
    { type: 'input_text', text: 'Scene camera view:' },
    {
      type: 'input_image',
      image_url: toDataUrl(sceneImage),
      detail: 'high',
    },
  ]

  if (adImage) {
    blocks.push(
      { type: 'input_text', text: 'Uploaded ad creative:' },
      {
        type: 'input_image',
        image_url: toDataUrl(adImage),
        detail: 'high',
      }
    )
  }

  blocks.push({ type: 'input_text', text: buildPrompt(input) })
  return blocks
}

export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return JSON.parse(trimmed)
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    return JSON.parse(fenced[1].trim())
  }

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1))
  }

  throw new SceneResponseError('OpenAI returned a response that was not valid JSON.', 502)
}

function readString(record: Record<string, unknown>, key: string, fallback: string): string {
  const value = record[key]
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed || fallback
}

export function normalizeSceneResponse(value: unknown): SceneResponseResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SceneResponseError('OpenAI returned an unexpected response shape.', 502)
  }

  const record = value as Record<string, unknown>
  return {
    sceneDescription: readString(record, 'scene_description', 'The scene could not be described confidently.'),
    adDescription: readString(record, 'ad_description', 'No clear ad creative was identified.'),
    firstImpression: readString(record, 'first_impression', 'The viewer response is uncertain.'),
    likelyAttention: readString(record, 'likely_attention', 'Attention is uncertain from the available image.'),
    likelyConfusion: readString(record, 'likely_confusion', 'Confusion risk is uncertain from the available image.'),
    simpleRecommendation: readString(record, 'simple_recommendation', 'Run another capture with a clearer scene and creative.'),
  }
}

export async function createSceneResponse(input: SceneResponseRequest): Promise<SceneResponseApiResponse> {
  const sceneImage = parseImageDataUrl(input.sceneImage, 'Scene')
  const adImage = input.adImage?.dataUrl ? parseImageDataUrl(input.adImage, 'Ad creative') : undefined
  const model = getOpenAITextModel('OPENAI_VISION_MODEL')
  const maxTokens = 700
  const prompt = buildPrompt(input)
  const estimatedCostUsd = estimateRequestCostUsd({
    sceneImageBytes: sceneImage.byteLength,
    adImageBytes: adImage?.byteLength,
    promptChars: prompt.length,
    maxOutputTokens: maxTokens,
  })

  assertBudgetAvailable(estimatedCostUsd)

  let body: OpenAIResponseBody
  try {
    body = await createOpenAIResponse({
      model,
      maxOutputTokens: maxTokens,
      temperature: 0.2,
      messages: [
        {
          role: 'user',
          content: buildContentBlocks(input, sceneImage, adImage),
        },
      ],
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new SceneResponseError(message, message.startsWith('Missing OPENAI_API_KEY') ? 500 : 502)
  }

  const text = getOpenAIOutputText(body)

  const result = normalizeSceneResponse(extractJsonObject(text))
  const inputTokens = body.usage?.input_tokens
  const outputTokens = body.usage?.output_tokens
  const actualCostUsd = typeof inputTokens === 'number' && typeof outputTokens === 'number'
    ? costForUsage(inputTokens, outputTokens)
    : estimatedCostUsd

  spentUsd += actualCostUsd

  return {
    result,
    model: body.model ?? model,
    budget: {
      ...getSceneResponseBudgetSnapshot(actualCostUsd),
      estimatedCostUsd: actualCostUsd,
      inputTokens,
      outputTokens,
    },
  }
}
