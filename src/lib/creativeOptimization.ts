import type {
  CreativeFailureCategory,
  CreativeOptimizationApiResponse,
  CreativeOptimizationMetrics,
  CreativeOptimizationPlacement,
  CreativeOptimizationRequest,
} from '@/types'
import { parseImageDataUrl, SceneResponseError } from '@/lib/sceneResponse'

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const DEFAULT_RESPONSES_MODEL = 'gpt-5.5'

interface OpenAITextBlock {
  type?: string
  text?: string
}

interface OpenAIOutputItem {
  type?: string
  result?: string
  revised_prompt?: string
  content?: OpenAITextBlock[]
}

interface OpenAIResponseBody {
  id?: string
  model?: string
  output?: OpenAIOutputItem[]
}

interface DiagnosisJson {
  failure_category?: string
  diagnosis?: string
  fix_strategy?: string
  purchase_recommendation?: string
  before_metrics?: Partial<CreativeOptimizationMetrics>
  after_metrics?: Partial<CreativeOptimizationMetrics>
}

const FAILURE_CATEGORIES = new Set<CreativeFailureCategory>([
  'low_contrast',
  'too_much_copy',
  'brand_not_registered',
  'cta_not_visible',
  'bad_fast_read',
  'environment_clutter',
  'format_mismatch',
  'weak_context_fit',
])

function getApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new SceneResponseError('Missing OPENAI_API_KEY. Add it to .env.local or the server environment, then restart Next.js.', 500)
  }
  return apiKey
}

function clampScore(value: unknown, fallback: number): number {
  const score = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(score)) return fallback
  return Math.max(0, Math.min(100, Math.round(score)))
}

function metricValue(value: Partial<CreativeOptimizationMetrics> | undefined, key: keyof CreativeOptimizationMetrics, snakeKey: string): unknown {
  if (!value) return undefined
  const record = value as Record<string, unknown>
  return record[key] ?? record[snakeKey]
}

function normalizeMetrics(value: Partial<CreativeOptimizationMetrics> | undefined, fallback: CreativeOptimizationMetrics): CreativeOptimizationMetrics {
  return {
    noticeability: clampScore(metricValue(value, 'noticeability', 'noticeability'), fallback.noticeability),
    fastRead: clampScore(metricValue(value, 'fastRead', 'fast_read'), fallback.fastRead),
    brandRecall: clampScore(metricValue(value, 'brandRecall', 'brand_recall'), fallback.brandRecall),
    ctaVisibility: clampScore(metricValue(value, 'ctaVisibility', 'cta_visibility'), fallback.ctaVisibility),
  }
}

function normalizeCategory(value: unknown): CreativeFailureCategory {
  if (typeof value !== 'string') return 'bad_fast_read'
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  return FAILURE_CATEGORIES.has(normalized as CreativeFailureCategory)
    ? normalized as CreativeFailureCategory
    : 'bad_fast_read'
}

function fallbackPlacement(placement?: CreativeOptimizationPlacement): CreativeOptimizationPlacement {
  return {
    name: placement?.name?.trim() || 'Selected OOH placement',
    mediaType: placement?.mediaType?.trim() || 'Outdoor media',
    priceEstimate: placement?.priceEstimate?.trim() || 'SGD 4,800',
    weeklyImpressions: placement?.weeklyImpressions ?? 42000,
    id: placement?.id,
  }
}

function buildPrompt(input: CreativeOptimizationRequest): string {
  const placement = fallbackPlacement(input.placement)
  const brief = input.brief?.trim() || 'Optimize this out-of-home ad for the selected placement.'
  const viewerProfile = input.viewerProfile?.trim() || 'urban pedestrian or commuter with short dwell time and partial phone distraction'

  return [
    'You are Faultline Creative Wind Tunnel.',
    'Use image 1 as the real street-level evidence frame and image 2 as the current ad creative.',
    'Diagnose the single biggest reason the ad fails in this environment, then edit the current ad into one best buy-ready fixed creative.',
    '',
    `Placement: ${placement.name} (${placement.mediaType}).`,
    `Viewer profile: ${viewerProfile}.`,
    `Campaign brief: ${brief}`,
    '',
    'The fixed creative must be an OOH image, not a mockup in the street scene.',
    'Preserve the brand direction from the original ad, but make the ad survive this physical faultline.',
    'Prefer one clear visual, a much faster read, stronger contrast against the environment, and fewer words.',
    'Do not add tiny body copy. Do not add a QR code unless the viewer has pedestrian dwell time.',
    '',
    'Return one image using the image_generation tool.',
    'Also return compact JSON text with exact keys:',
    'failure_category, diagnosis, fix_strategy, purchase_recommendation, before_metrics, after_metrics.',
    'Allowed failure_category values: low_contrast, too_much_copy, brand_not_registered, cta_not_visible, bad_fast_read, environment_clutter, format_mismatch, weak_context_fit.',
    'Metrics must be 0-100 integers with keys noticeability, fastRead, brandRecall, ctaVisibility.',
  ].join('\n')
}

function extractJsonObject(text: string): DiagnosisJson {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1] ?? trimmed.slice(trimmed.indexOf('{'), trimmed.lastIndexOf('}') + 1)
  if (!candidate || !candidate.includes('{')) return {}

  try {
    const parsed = JSON.parse(candidate) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as DiagnosisJson
      : {}
  } catch {
    return {}
  }
}

function getTextOutput(output: OpenAIOutputItem[]): string {
  return output
    .flatMap(item => item.content ?? [])
    .filter(block => block.type === 'output_text' && block.text)
    .map(block => block.text)
    .join('\n')
}

export async function createCreativeOptimization(input: CreativeOptimizationRequest): Promise<CreativeOptimizationApiResponse> {
  const sceneImage = parseImageDataUrl(input.sceneImage, 'Street-level evidence')
  const adImage = parseImageDataUrl(input.adImage, 'Current ad creative')
  const prompt = buildPrompt(input)
  const model = process.env.OPENAI_RESPONSES_MODEL || DEFAULT_RESPONSES_MODEL

  const res = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: prompt,
            },
            {
              type: 'input_image',
              image_url: `data:${sceneImage.mediaType};base64,${sceneImage.base64}`,
              detail: 'high',
            },
            {
              type: 'input_image',
              image_url: `data:${adImage.mediaType};base64,${adImage.base64}`,
              detail: 'high',
            },
          ],
        },
      ],
      tools: [
        {
          type: 'image_generation',
          action: 'edit',
          size: '1536x1024',
          quality: 'high',
          output_format: 'png',
        },
      ],
      tool_choice: { type: 'image_generation' },
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new SceneResponseError(`OpenAI creative optimization error ${res.status}: ${text.slice(0, 280)}`, 502)
  }

  const body = await res.json() as OpenAIResponseBody
  const output = body.output ?? []
  const imageCall = output.find(item => item.type === 'image_generation_call' && item.result)
  if (!imageCall?.result) {
    throw new SceneResponseError('OpenAI did not return a fixed creative image.', 502)
  }

  const text = getTextOutput(output)
  const diagnosis = extractJsonObject(text)
  const beforeMetrics = normalizeMetrics(diagnosis.before_metrics, {
    noticeability: 42,
    fastRead: 28,
    brandRecall: 35,
    ctaVisibility: 24,
  })
  const afterMetrics = normalizeMetrics(diagnosis.after_metrics, {
    noticeability: Math.min(100, beforeMetrics.noticeability + 28),
    fastRead: Math.min(100, beforeMetrics.fastRead + 36),
    brandRecall: Math.min(100, beforeMetrics.brandRecall + 26),
    ctaVisibility: Math.min(100, beforeMetrics.ctaVisibility + 30),
  })

  return {
    result: {
      failureCategory: normalizeCategory(diagnosis.failure_category),
      diagnosis: diagnosis.diagnosis?.trim() || 'The original ad is not resolving quickly enough in this street-level view.',
      fixStrategy: diagnosis.fix_strategy?.trim() || 'Simplify the composition, increase contrast, enlarge the brand moment, and make the headline readable at a glance.',
      fixedCreativeUrl: `data:image/png;base64,${imageCall.result}`,
      revisedPrompt: imageCall.revised_prompt ?? prompt,
      beforeMetrics,
      afterMetrics,
      purchaseRecommendation: diagnosis.purchase_recommendation?.trim() || 'Buy this placement only with the fixed creative; the original should not be used for this faultline.',
      model: body.model ?? model,
    },
  }
}
