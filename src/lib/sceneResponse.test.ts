import { describe, expect, it, beforeEach } from 'vitest'
import {
  estimateRequestCostUsd,
  extractJsonObject,
  normalizeSceneResponse,
  parseImageDataUrl,
  resetSceneResponseBudgetForTest,
  SceneResponseError,
} from '@/lib/sceneResponse'

describe('sceneResponse helpers', () => {
  beforeEach(() => {
    resetSceneResponseBudgetForTest()
  })

  it('parses supported base64 image data URLs', () => {
    const parsed = parseImageDataUrl({ dataUrl: 'data:image/jpeg;base64,AAAA' }, 'Scene')
    expect(parsed.mediaType).toBe('image/jpeg')
    expect(parsed.byteLength).toBe(3)
  })

  it('rejects unsupported image data URLs', () => {
    expect(() => parseImageDataUrl({ dataUrl: 'data:image/svg+xml;base64,AAAA' }, 'Scene'))
      .toThrow(SceneResponseError)
  })

  it('extracts JSON from fenced model output', () => {
    expect(extractJsonObject('```json\n{"scene_description":"busy street"}\n```'))
      .toEqual({ scene_description: 'busy street' })
  })

  it('normalizes missing fields with safe fallbacks', () => {
    const normalized = normalizeSceneResponse({ scene_description: 'A dense street.' })
    expect(normalized.sceneDescription).toBe('A dense street.')
    expect(normalized.adDescription).toMatch(/No clear ad/)
  })

  it('estimates a non-zero request cost', () => {
    const cost = estimateRequestCostUsd({
      sceneImageBytes: 200_000,
      promptChars: 800,
      maxOutputTokens: 700,
    })
    expect(cost).toBeGreaterThan(0)
  })
})
