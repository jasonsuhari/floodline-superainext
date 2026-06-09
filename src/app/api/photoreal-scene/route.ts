/**
 * /api/photoreal-scene
 *
 * Pipeline:
 *   1. Receive a pedestrian's Street View capture (base64 data URL) + billboard metadata
 *      (position, dimensions, heading, creative image URL or data URL, creative text).
 *   2. Fetch / validate the billboard creative as a base64 data URL.
 *   3. Call GPT Image 2 (via OpenAI Responses API image_generation tool with action:'edit')
 *      to photorealistically composite the billboard into the street-view scene with proper
 *      perspective, lighting, shadows and environment matching.
 *   4. Feed the rendered composite into the existing scene-response analysis pipeline.
 *   5. Return both the rendered image (as a data URL) and the full analysis result.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSceneResponse, parseImageDataUrl, SceneResponseError } from '@/lib/sceneResponse'
import type { LatLng, PhotorealEnvironmentContext, PhotorealSceneRequest, PhotorealSceneApiResponse } from '@/types'

export const maxDuration = 300

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const WAVESPEED_BASE = 'https://api.wavespeed.ai/api/v3'
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new SceneResponseError('Missing OPENAI_API_KEY', 500)
  return key
}

function getWavespeedKey(): string | null {
  return process.env.WAVESPEED_API_KEY ?? null
}

function sanitizeFilenamePart(value: string): string {
  const safe = value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
  return safe.slice(0, 80) || 'agent-billboard'
}

async function saveAgentScreenshot(dataUrl: string, captureId?: string): Promise<{ url: string; path: string }> {
  const image = parseImageDataUrl({ dataUrl }, 'Photoreal screenshot')
  const { mkdir, writeFile } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const outputDir = join(process.cwd(), 'public', 'agent_screenshots')
  await mkdir(outputDir, { recursive: true })

  const ext = image.mediaType === 'image/jpeg' ? 'jpg' : image.mediaType === 'image/webp' ? 'webp' : 'png'
  const filename = `${sanitizeFilenamePart(captureId ?? 'agent-billboard')}-${Date.now()}.${ext}`
  await writeFile(join(outputDir, filename), Buffer.from(image.base64, 'base64'))
  return {
    url: `/agent_screenshots/${filename}`,
    path: `public/agent_screenshots/${filename}`,
  }
}

/** Fetch a remote URL and return it as a base64 data URL. */
async function fetchAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Faultline/1.0 (+https://faultline.app)' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new SceneResponseError(`Failed to fetch image (${res.status}): ${url.slice(0, 80)}`, 502)
  const contentType = res.headers.get('content-type') ?? 'image/jpeg'
  const mime = contentType.split(';')[0].trim()
  const buffer = await res.arrayBuffer()
  return `data:${mime};base64,${Buffer.from(buffer).toString('base64')}`
}

/** Ensure a creative URL (remote http/https or existing data URL) is a data URL. */
async function resolveCreativeDataUrl(mediaUrl: string, appOrigin?: string): Promise<string> {
  if (mediaUrl.startsWith('data:')) return mediaUrl
  if (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://')) {
    return fetchAsDataUrl(mediaUrl)
  }
  // Relative path (e.g. /mock.png) — resolve against the app origin when available,
  // otherwise fall back to reading the file from the Next.js public directory.
  if (mediaUrl.startsWith('/')) {
    if (appOrigin) {
      return fetchAsDataUrl(`${appOrigin}${mediaUrl}`)
    }
    // Server-side fallback: read from the filesystem (Next.js public dir)
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    try {
      const filePath = join(process.cwd(), 'public', mediaUrl.replace(/^\//, ''))
      const buf = await readFile(filePath)
      const ext = mediaUrl.split('.').pop()?.toLowerCase() ?? 'png'
      const mimeMap: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' }
      const mime = mimeMap[ext] ?? 'image/png'
      return `data:${mime};base64,${buf.toString('base64')}`
    } catch {
      throw new SceneResponseError(`Could not resolve relative creative path: ${mediaUrl}`, 400)
    }
  }
  throw new SceneResponseError('Billboard creative URL must be an absolute URL, relative path, or data URL.', 400)
}

function weatherCodeLabel(code: number): string {
  if (code === 0) return 'clear sky'
  if ([1, 2, 3].includes(code)) return 'partly cloudy'
  if ([45, 48].includes(code)) return 'foggy'
  if ([51, 53, 55, 56, 57].includes(code)) return 'drizzle'
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain'
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow'
  if ([95, 96, 99].includes(code)) return 'thunderstorm'
  return 'unknown conditions'
}

async function getWeatherSummary(position?: LatLng): Promise<string | undefined> {
  if (!position) return undefined

  try {
    const params = new URLSearchParams({
      latitude: position.lat.toFixed(5),
      longitude: position.lng.toFixed(5),
      current: 'temperature_2m,relative_humidity_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,is_day',
      timezone: 'auto',
    })
    const res = await fetch(`${OPEN_METEO_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(6_000),
    })
    if (!res.ok) return undefined
    const json = await res.json() as {
      current?: {
        temperature_2m?: number
        relative_humidity_2m?: number
        precipitation?: number
        weather_code?: number
        cloud_cover?: number
        wind_speed_10m?: number
        is_day?: number
      }
      current_units?: Record<string, string>
    }
    const current = json.current
    if (!current) return undefined
    const weather = typeof current.weather_code === 'number' ? weatherCodeLabel(current.weather_code) : 'current weather'
    const temp = typeof current.temperature_2m === 'number' ? `${Math.round(current.temperature_2m)}${json.current_units?.temperature_2m ?? 'C'}` : null
    const cloud = typeof current.cloud_cover === 'number' ? `${Math.round(current.cloud_cover)}% cloud cover` : null
    const humidity = typeof current.relative_humidity_2m === 'number' ? `${Math.round(current.relative_humidity_2m)}% humidity` : null
    const precip = typeof current.precipitation === 'number' ? `${current.precipitation}${json.current_units?.precipitation ?? 'mm'} precipitation` : null
    const wind = typeof current.wind_speed_10m === 'number' ? `${Math.round(current.wind_speed_10m)} ${json.current_units?.wind_speed_10m ?? 'km/h'} wind` : null
    const day = current.is_day === 0 ? 'night' : current.is_day === 1 ? 'daylight' : null
    return [weather, day, temp, cloud, humidity, precip, wind].filter(Boolean).join(', ')
  } catch {
    return undefined
  }
}

// ── Photoreal render via OpenAI Responses (gpt-image-1 with image_generation edit) ──

interface OpenAIResponsesOutput {
  type?: string
  result?: string
  revised_prompt?: string
  content?: Array<{ type?: string; text?: string }>
}

function buildPhotorealPrompt(input: PhotorealSceneRequest, environment: PhotorealEnvironmentContext): string {
  const dist = input.billboard.distanceM ? `approximately ${Math.round(input.billboard.distanceM)} metres away` : 'visible in the scene'
  const dims = `${input.billboard.widthM.toFixed(1)} m wide × ${input.billboard.heightM.toFixed(1)} m tall`
  const clearance = input.billboard.clearanceM ? `, raised ${input.billboard.clearanceM.toFixed(1)} m above ground` : ''
  const creativeDesc = input.billboard.creativeText
    ? `The billboard displays: "${input.billboard.creativeText}".`
    : 'The billboard displays the provided ad creative.'
  const viewer = environment.viewerPosition
    ? `Viewer / agent position: ${environment.viewerPosition.lat.toFixed(6)}, ${environment.viewerPosition.lng.toFixed(6)}.`
    : null
  const billboardPosition = environment.billboardPosition
    ? `Billboard real-world anchor: ${environment.billboardPosition.lat.toFixed(6)}, ${environment.billboardPosition.lng.toFixed(6)}.`
    : null
  const weather = environment.weatherSummary
    ? `Current weather and lighting context near the viewer: ${environment.weatherSummary}.`
    : null
  const lighting = environment.lightingSummary
    ? `Additional lighting cue: ${environment.lightingSummary}.`
    : null
  const capturedAt = environment.capturedAt
    ? `Capture time: ${environment.capturedAt}.`
    : null

  return [
    'You are a photorealistic outdoor advertising visualisation engine.',
    '',
    `Image 1 is a real street-level photograph. Image 2 is the billboard creative to be placed.`,
    '',
    `Task: Composite the billboard creative (Image 2) onto a ${dims} billboard structure${clearance},`,
    `${dist} in the street scene (Image 1). The billboard faces the camera at the correct perspective angle.`,
    viewer,
    billboardPosition,
    weather,
    lighting,
    capturedAt,
    '',
    'Requirements:',
    '- Match the billboard to the real-world lighting, sky colour, and ambient shadows in Image 1.',
    '- Use the current weather context to tune haze, wetness, glare, contrast, and screen brightness while preserving the photograph geometry.',
    '- Apply realistic perspective foreshortening so the billboard aligns with the scene geometry.',
    '- Add subtle environmental effects: slight atmospheric haze if the scene is distant, reflections',
    '  on a digital screen surface if applicable, and cast shadows consistent with the sun direction.',
    '- The surrounding street scene must remain UNCHANGED — only add the billboard structure and creative.',
    '- Output a single photorealistic composite image that looks like an actual photograph.',
    '- Do NOT add text overlays, watermarks, or UI chrome.',
    '',
    creativeDesc,
    `Billboard name: ${input.billboard.name}.`,
  ].filter(Boolean).join('\n')
}

async function renderPhotorealViaOpenAI(
  sceneDataUrl: string,
  creativeDataUrl: string,
  prompt: string,
): Promise<string> {
  const apiKey = getApiKey()

  const res = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_RESPONSES_MODEL ?? process.env.OPENAI_RESPONSES_MODEL ?? 'gpt-5.5',
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            { type: 'input_image', image_url: sceneDataUrl, detail: 'high' },
            { type: 'input_image', image_url: creativeDataUrl, detail: 'high' },
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
    throw new SceneResponseError(`OpenAI photoreal render error ${res.status}: ${text.slice(0, 280)}`, 502)
  }

  const body = await res.json() as { output?: OpenAIResponsesOutput[] }
  const imgCall = body.output?.find(o => o.type === 'image_generation_call' && o.result)
  if (!imgCall?.result) {
    throw new SceneResponseError('OpenAI did not return a rendered scene image.', 502)
  }

  return `data:image/png;base64,${imgCall.result}`
}

// ── WaveSpeed GPT Image 2 image-to-image fallback ────────────────────────────

interface WavespeedTaskResponse {
  code: number
  data: {
    id: string
    status: string
    outputs?: string[]
    urls?: { get: string }
    error?: string | { message?: string; detail?: string }
  }
}

function formatWavespeedError(error: WavespeedTaskResponse['data']['error']): string {
  if (!error) return 'unknown'
  if (typeof error === 'string') return error
  return error.message ?? error.detail ?? JSON.stringify(error)
}

async function pollUntilDone(pollUrl: string, apiKey: string, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 4000))
    let res: Response
    try {
      res = await fetch(pollUrl, { headers: { Authorization: `Bearer ${apiKey}` } })
    } catch { continue }
    if (!res.ok) continue
    const json = await res.json() as WavespeedTaskResponse
    const { status, outputs, error } = json.data
    if (status === 'completed' && outputs?.length) return outputs[0]
    if (status === 'failed') throw new Error(`WaveSpeed generation failed: ${formatWavespeedError(error)}`)
  }
  throw new Error('WaveSpeed photoreal render timed out')
}

async function renderPhotorealViaWavespeed(
  sceneDataUrl: string,
  creativeDataUrl: string,
  prompt: string,
): Promise<string> {
  const apiKey = getWavespeedKey()!

  const res = await fetch(`${WAVESPEED_BASE}/openai/gpt-image-2/image-to-image`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      // Pass both images: scene as the base, creative as the reference
      image: sceneDataUrl,
      reference_image: creativeDataUrl,
      aspect_ratio: '4:3',
      resolution: '1k',
      quality: 'high',
      enable_sync_mode: true,
      enable_base64_output: false,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`WaveSpeed gpt-image-2 error ${res.status}: ${text.slice(0, 200)}`)
  }

  const json = await res.json() as WavespeedTaskResponse
  const { status, outputs, urls, id } = json.data

  let imageUrl: string
  if (status === 'completed' && outputs?.length) {
    imageUrl = outputs[0]
  } else {
    const pollUrl = urls?.get ?? `${WAVESPEED_BASE}/predictions/${id}`
    imageUrl = await pollUntilDone(pollUrl, apiKey, 120_000)
  }

  const imgRes = await fetch(imageUrl)
  if (!imgRes.ok) throw new Error(`Failed to fetch WaveSpeed rendered image: ${imgRes.status}`)
  const buffer = await imgRes.arrayBuffer()
  return `data:image/png;base64,${Buffer.from(buffer).toString('base64')}`
}

/** Render the billboard into the street scene using the best available provider. */
async function renderPhotoreal(
  sceneDataUrl: string,
  creativeDataUrl: string,
  prompt: string,
): Promise<string> {
  // Prefer WaveSpeed GPT Image 2 when a key is available (faster, cheaper for image-to-image)
  const wavespeedKey = getWavespeedKey()
  if (wavespeedKey) {
    try {
      return await renderPhotorealViaWavespeed(sceneDataUrl, creativeDataUrl, prompt)
    } catch (err) {
      // Fall through to OpenAI if WaveSpeed fails
      console.warn('[photoreal-scene] WaveSpeed failed, falling back to OpenAI:', err instanceof Error ? err.message : err)
    }
  }

  return renderPhotorealViaOpenAI(sceneDataUrl, creativeDataUrl, prompt)
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let input: PhotorealSceneRequest
  try {
    input = await req.json() as PhotorealSceneRequest
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Validate required fields
  if (!input.sceneImage?.dataUrl) {
    return NextResponse.json({ error: 'sceneImage.dataUrl is required' }, { status: 400 })
  }
  if (!input.billboard?.name || typeof input.billboard.widthM !== 'number') {
    return NextResponse.json({ error: 'billboard metadata (name, widthM, heightM) is required' }, { status: 400 })
  }

  try {
    // 1. Validate and parse the scene image
    const sceneImage = parseImageDataUrl(input.sceneImage, 'Scene')
    const sceneDataUrl = `data:${sceneImage.mediaType};base64,${sceneImage.base64}`

    // 2. Resolve the billboard creative to a data URL
    // Derive the app origin from the incoming request so relative paths can be fetched.
    const appOrigin = req.headers.get('origin') ?? (() => {
      const host = req.headers.get('host')
      if (!host) return undefined
      const proto = req.headers.get('x-forwarded-proto') ?? 'http'
      return `${proto}://${host}`
    })()

    let creativeDataUrl: string
    if (input.billboard.creativeDataUrl) {
      const creativeImage = parseImageDataUrl({ dataUrl: input.billboard.creativeDataUrl }, 'Billboard creative')
      creativeDataUrl = `data:${creativeImage.mediaType};base64,${creativeImage.base64}`
    } else if (input.billboard.mediaUrl) {
      creativeDataUrl = await resolveCreativeDataUrl(input.billboard.mediaUrl, appOrigin ?? undefined)
    } else {
      return NextResponse.json({ error: 'billboard.creativeDataUrl or billboard.mediaUrl is required' }, { status: 400 })
    }

    // 3. Build the photoreal composite prompt
    const weatherSummary = input.environment?.weatherSummary ?? await getWeatherSummary(input.environment?.viewerPosition)
    const environment: PhotorealEnvironmentContext = {
      ...input.environment,
      weatherSummary,
    }
    const prompt = buildPhotorealPrompt(input, environment)

    // 4. Render the photorealistic scene
    const photorealDataUrl = await renderPhotoreal(sceneDataUrl, creativeDataUrl, prompt)

    // 5. Run the existing scene-response analysis on the rendered composite
    const brief = input.brief ?? `Analyse this photorealistic billboard placement for "${input.billboard.name}".`
    const viewerProfile = input.viewerProfile ?? 'urban pedestrian with short dwell time'

    const analysisResponse = await createSceneResponse({
      sceneImage: { dataUrl: photorealDataUrl },
      brief,
      viewerProfile,
    })

    const saved = input.saveToAgentScreenshots
      ? await saveAgentScreenshot(photorealDataUrl, input.captureId ?? input.billboard.name)
      : null

    const response: PhotorealSceneApiResponse = {
      photorealImageUrl: photorealDataUrl,
      analysis: analysisResponse,
      ...(saved ? { savedImageUrl: saved.url, savedImagePath: saved.path } : {}),
    }

    return NextResponse.json(response)
  } catch (err) {
    if (err instanceof SceneResponseError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : String(err)
    console.error('[photoreal-scene] Unexpected error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
