import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 })

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 })
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return NextResponse.json({ error: 'Only http/https allowed' }, { status: 400 })
  }

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FaultlineBot/1.0)' },
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return NextResponse.json(
        { error: `Upstream ${res.status}`, detail: text.slice(0, 240) },
        { status: 502 },
      )
    }

    const contentType = res.headers.get('content-type') ?? 'image/png'
    if (!contentType.startsWith('image/')) {
      const text = await res.text().catch(() => '')
      return NextResponse.json({ error: 'Not an image', detail: text.slice(0, 240) }, { status: 400 })
    }

    const buffer = await res.arrayBuffer()
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch image' }, { status: 502 })
  }
}
