import type { CompanyBrief } from '@/types'
import { createGeminiResponse } from '@/lib/gemini'

const DEFAULT_MODEL_ENV = 'GEMINI_BRIEF_MODEL'

interface PageSignals {
  url: string
  title: string
  metaDescription: string
  ogTitle: string
  ogDescription: string
  ogImage: string
  themeColor: string
  twitterSite: string
  keywords: string
  canonicalUrl: string
  faviconUrl: string
  logoHints: string[]
  fontHints: string[]
  colorHints: string[]
  headHtml: string
  bodyHeadlines: string[]
  bodyCtaHints: string[]
}

export async function extractPageSignals(url: string): Promise<PageSignals> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; FaultlineBot/1.0)',
      Accept: 'text/html',
    },
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)

  const html = await res.text()
  const head = html.slice(0, 12_000)

  function metaContent(nameOrProp: string): string {
    const patterns = [
      new RegExp(`<meta[^>]+(?:name|property)=["']${nameOrProp}["'][^>]+content=["']([^"']+)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${nameOrProp}["']`, 'i'),
    ]
    for (const re of patterns) {
      const m = head.match(re)
      if (m) return m[1].trim()
    }
    return ''
  }

  function titleTag(): string {
    const m = head.match(/<title[^>]*>([^<]+)<\/title>/i)
    return m ? m[1].trim() : ''
  }

  function linkHref(rel: string): string {
    const m = head.match(new RegExp(`<link[^>]+rel=["']${rel}["'][^>]+href=["']([^"']+)["']`, 'i'))
      ?? head.match(new RegExp(`<link[^>]+href=["']([^"']+)["'][^>]+rel=["']${rel}["']`, 'i'))
    return m ? m[1].trim() : ''
  }

  // Collect Google Fonts or font-face hints
  const fontHints: string[] = []
  const fontFamilyRe = /font-family:\s*['"]?([A-Za-z0-9 \-_]+)['"]?/gi
  let fm: RegExpExecArray | null
  while ((fm = fontFamilyRe.exec(head)) !== null) {
    const name = fm[1].trim()
    if (name && !fontHints.includes(name)) fontHints.push(name)
  }
  const googleFontRe = /fonts\.googleapis\.com\/css[^"']*family=([^"'&]+)/gi
  while ((fm = googleFontRe.exec(head)) !== null) {
    const decoded = decodeURIComponent(fm[1]).replace(/\+/g, ' ').split('|')[0].split(':')[0].trim()
    if (decoded && !fontHints.includes(decoded)) fontHints.push(decoded)
  }

  // Collect hex color hints from inline styles / CSS
  const colorHints: string[] = []
  const hexRe = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g
  let cm: RegExpExecArray | null
  while ((cm = hexRe.exec(head)) !== null) {
    const hex = `#${cm[1].toUpperCase()}`
    if (!colorHints.includes(hex)) colorHints.push(hex)
  }

  const base = new URL(url)
  const rawFavicon = linkHref('icon') || linkHref('shortcut icon') || '/favicon.ico'
  const faviconUrl = rawFavicon.startsWith('http') ? rawFavicon : `${base.origin}${rawFavicon.startsWith('/') ? '' : '/'}${rawFavicon}`

  // Apple touch icon is often the highest-quality square logo available
  const rawTouchIcon = linkHref('apple-touch-icon') || linkHref('apple-touch-icon-precomposed')
  const touchIconUrl = rawTouchIcon
    ? (rawTouchIcon.startsWith('http') ? rawTouchIcon : `${base.origin}${rawTouchIcon.startsWith('/') ? '' : '/'}${rawTouchIcon}`)
    : ''

  const ogImage = metaContent('og:image')
  const ogImageAbs = ogImage.startsWith('http') ? ogImage : ogImage ? `${base.origin}${ogImage}` : ''

  // Find <img> tags whose src/alt/class/id contain "logo"
  const logoHints: string[] = []
  const logoImgRe = /<img[^>]+>/gi
  let lm: RegExpExecArray | null
  while ((lm = logoImgRe.exec(html)) !== null) {
    const tag = lm[0]
    if (!/logo/i.test(tag)) continue
    const srcMatch = tag.match(/src=["']([^"']+)["']/)
    if (!srcMatch) continue
    const src = srcMatch[1]
    const abs = src.startsWith('http') ? src : `${base.origin}${src.startsWith('/') ? '' : '/'}${src}`
    if (!logoHints.includes(abs)) logoHints.push(abs)
  }
  if (touchIconUrl && !logoHints.includes(touchIconUrl)) logoHints.unshift(touchIconUrl)

  // Extract h1/h2 headlines and button/CTA text from the page body
  const bodyStart = html.indexOf('<body')
  const bodySlice = html.slice(bodyStart > 0 ? bodyStart : 12_000)

  function stripTags(s: string) {
    return s.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim()
  }

  const bodyHeadlines: string[] = []
  const h12Re = /<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi
  let hm: RegExpExecArray | null
  while ((hm = h12Re.exec(bodySlice)) !== null) {
    const text = stripTags(hm[1])
    if (text.length > 3 && text.length < 140 && !bodyHeadlines.includes(text)) bodyHeadlines.push(text)
  }

  const bodyCtaHints: string[] = []
  // Buttons (always likely CTAs)
  const btnRe = /<button[^>]*>([\s\S]*?)<\/button>/gi
  let bm: RegExpExecArray | null
  while ((bm = btnRe.exec(bodySlice)) !== null) {
    const text = stripTags(bm[1])
    if (text.length > 2 && text.length < 60 && !bodyCtaHints.includes(text)) bodyCtaHints.push(text)
  }
  // Links whose class names suggest CTA
  const ctaLinkRe = /<a[^>]+class=["'][^"']*(?:cta|btn|button|primary|action|hero)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi
  while ((bm = ctaLinkRe.exec(bodySlice)) !== null) {
    const text = stripTags(bm[1])
    if (text.length > 2 && text.length < 60 && !bodyCtaHints.includes(text)) bodyCtaHints.push(text)
  }

  return {
    url,
    title: titleTag(),
    metaDescription: metaContent('description'),
    ogTitle: metaContent('og:title'),
    ogDescription: metaContent('og:description'),
    ogImage: ogImageAbs,
    themeColor: metaContent('theme-color'),
    twitterSite: metaContent('twitter:site'),
    keywords: metaContent('keywords'),
    canonicalUrl: linkHref('canonical') || url,
    faviconUrl,
    logoHints: logoHints.slice(0, 5),
    fontHints: fontHints.slice(0, 8),
    colorHints: colorHints.slice(0, 20),
    headHtml: head.slice(0, 4_000),
    bodyHeadlines: bodyHeadlines.slice(0, 6),
    bodyCtaHints: bodyCtaHints.slice(0, 8),
  }
}

const BRIEF_SYSTEM = `You are a brand strategist and creative director. Given raw HTML signals scraped from a company's website, produce a structured company brief for an out-of-home advertising campaign. Output ONLY valid JSON — no markdown fences, no commentary.`

const BRIEF_SCHEMA = `{
  "identity": {
    "companyName": "string",
    "industry": "string",
    "description": "one sentence",
    "brandAdjectives": ["adj1", "adj2", "adj3"],
    "tagline": "string or null"
  },
  "visualSystem": {
    "primaryColor": "#RRGGBB or null",
    "secondaryColor": "#RRGGBB or null",
    "logoUrl": "absolute URL or null",
    "fonts": ["font name", ...],
    "styleReference": "e.g. think Apple / think Patagonia",
    "avoidList": ["thing to avoid", ...]
  },
  "campaign": {
    "coreMessage": "the ONE thing this ad should communicate",
    "offerOrHook": "string or null",
    "callToAction": "string",
    "campaignObjective": "awareness | conversion | foot-traffic | app-downloads"
  },
  "audience": {
    "description": "one sentence demographic + psychographic",
    "tone": "string",
    "contextWhenSeen": "driving | walking | scrolling | mixed"
  }
}`

export async function buildCompanyBrief(url: string): Promise<CompanyBrief> {
  const signals = await extractPageSignals(url)

  const userMessage = [
    `URL: ${signals.url}`,
    `Title: ${signals.title}`,
    `Meta description: ${signals.metaDescription}`,
    `OG title: ${signals.ogTitle}`,
    `OG description: ${signals.ogDescription}`,
    `Theme color: ${signals.themeColor}`,
    `Keywords: ${signals.keywords}`,
    `Twitter handle: ${signals.twitterSite}`,
    `Favicon: ${signals.faviconUrl}`,
    `OG image: ${signals.ogImage}`,
    signals.logoHints.length ? `Logo image candidates (img tags with "logo" in attributes, or apple-touch-icon): ${signals.logoHints.join(', ')}` : '',
    `Font hints: ${signals.fontHints.join(', ')}`,
    `Hex color hints from page head: ${signals.colorHints.join(', ')}`,
    signals.bodyHeadlines.length ? `Page headlines (h1/h2): ${signals.bodyHeadlines.join(' | ')}` : '',
    signals.bodyCtaHints.length ? `Button / CTA text found on page: ${signals.bodyCtaHints.join(' | ')}` : '',
    '',
    'Raw <head> snippet:',
    signals.headHtml,
    '',
    `Return a JSON object that exactly matches this schema:\n${BRIEF_SCHEMA}`,
  ].filter(Boolean).join('\n')

  const raw = await createGeminiResponse({
    model: process.env[DEFAULT_MODEL_ENV] || 'gemini-2.0-flash',
    maxOutputTokens: 1024,
    instructions: BRIEF_SYSTEM,
    messages: [{ role: 'user', content: userMessage }],
  })

  let parsed: Omit<CompanyBrief, 'url'>
  try {
    parsed = JSON.parse(raw) as Omit<CompanyBrief, 'url'>
  } catch {
    const fence = raw.match(/```(?:json)?\s*([\s\S]+?)```/)
    if (fence) {
      parsed = JSON.parse(fence[1]) as Omit<CompanyBrief, 'url'>
    } else {
      throw new Error(`Could not parse Gemini response as JSON: ${raw.slice(0, 400)}`)
    }
  }

  return { url, ...parsed }
}
