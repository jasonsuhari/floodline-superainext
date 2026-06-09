import { NextRequest, NextResponse } from 'next/server'
import {
  cityPlanPdfFilename,
  makeMockCityPlanData,
  renderCityPlanPdfBuffer,
  type CityPlanPdfRequest,
} from '@/lib/cityPlanPdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function pdfResponse(data: CityPlanPdfRequest, disposition: 'inline' | 'attachment') {
  const buffer = await renderCityPlanPdfBuffer(data)
  return new NextResponse(Uint8Array.from(buffer).buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename="${cityPlanPdfFilename(data)}"`,
      'Content-Length': String(buffer.length),
    },
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as CityPlanPdfRequest
    if (!body?.areaCenter || (!body?.scenario && !body?.summary && (!body?.zones || body.zones.length === 0))) {
      return NextResponse.json({ error: 'Missing areaCenter and report payload' }, { status: 400 })
    }
    return await pdfResponse(body, 'attachment')
  } catch (err) {
    console.error('[generate-city-plan-pdf] POST error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'PDF generation failed' }, { status: 500 })
  }
}

export async function GET() {
  try {
    return await pdfResponse(makeMockCityPlanData(), 'inline')
  } catch (err) {
    console.error('[generate-city-plan-pdf] GET error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'PDF generation failed' }, { status: 500 })
  }
}
