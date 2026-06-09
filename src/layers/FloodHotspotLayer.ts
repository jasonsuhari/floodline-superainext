import { ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import type { FloodReport } from '@/types'

type Rgba = [number, number, number, number]

function colorForReport(report: FloodReport, alpha: number): Rgba {
  if (report.severity >= 5) return [220, 38, 38, alpha]
  if (report.severity === 4) return [249, 115, 22, alpha]
  if (report.severity === 3) return [234, 179, 8, alpha]
  return [34, 197, 94, alpha]
}

function isLocalSingaporeReport(report: FloodReport): boolean {
  return report.source === 'pub-risk-area' || report.id.startsWith('sg-live')
}

export function makeFloodHotspotLayers(input: {
  reports: FloodReport[]
  selectedReportId: string | null
  onSelectReport: (report: FloodReport, screen: { x: number; y: number }) => void
  time?: number
  zoom?: number
}) {
  const pulse = 0.5 + 0.5 * Math.sin((input.time ?? 0) * 2.2)
  const zoom = input.zoom ?? 12
  const baseAlpha = Math.max(4, Math.round(36 - zoom * 1.8))
  const fadeFactor = Math.max(0, Math.min(1, (14.5 - zoom) / 2.0))
  const glowAlpha = Math.round(baseAlpha * fadeFactor)
  const markerReports = input.reports.filter((report, index) => {
    if (report.id === input.selectedReportId || report.source === 'pub-risk-area') return true
    if (!report.id.startsWith('sg-live')) return zoom >= 3
    if (zoom < 12.6) return false
    if (zoom < 14) return index % 25 === 0 && report.severity >= 4
    if (zoom < 15.5) return index % 8 === 0
    return true
  })
  const heatReports = input.reports.filter((report, index) =>
    report.source === 'pub-risk-area' ||
    !isLocalSingaporeReport(report) ||
    index % (zoom < 13 ? 14 : zoom < 15 ? 10 : 7) === 0
  )
  const selectedReports = markerReports.filter(report => report.id === input.selectedReportId)

  return [
    new ScatterplotLayer<FloodReport>({
      id: 'flood-report-heat-glow',
      data: heatReports,
      getPosition: report => [report.position.lng, report.position.lat, 0.2],
      getRadius: report => (isLocalSingaporeReport(report) ? 1200 : 200000) * (0.95 + report.severity * 0.12),
      radiusUnits: 'meters',
      getFillColor: report => colorForReport(report, isLocalSingaporeReport(report) ? glowAlpha : glowAlpha + 2),
      opacity: 0.45,
      filled: true,
      stroked: false,
      pickable: false,
      updateTriggers: { data: [zoom], getFillColor: [zoom] },
      parameters: { depthWriteEnabled: false },
    }),

    new ScatterplotLayer<FloodReport>({
      id: 'flood-report-heat-core',
      data: markerReports,
      getPosition: report => [report.position.lng, report.position.lat, 1],
      getRadius: report => (isLocalSingaporeReport(report) ? 36 : 18000) * (0.9 + report.severity * 0.08),
      radiusUnits: 'meters',
      getFillColor: report => colorForReport(report, input.selectedReportId === report.id ? 90 : 55),
      getLineColor: report => input.selectedReportId === report.id ? [255, 255, 255, 180] : [255, 245, 220, 0],
      getLineWidth: report => input.selectedReportId === report.id ? 3 : 0,
      lineWidthUnits: 'pixels',
      filled: true,
      stroked: true,
      pickable: true,
      onClick: info => {
        if (info.object) input.onSelectReport(info.object, { x: info.x ?? 0, y: info.y ?? 0 })
      },
      updateTriggers: {
        data: [zoom, input.selectedReportId],
        getLineColor: [input.selectedReportId],
        getLineWidth: [input.selectedReportId],
      },
      parameters: { depthCompare: 'always', depthWriteEnabled: false },
    }),

    new ScatterplotLayer<FloodReport>({
      id: 'flood-report-pointer-rings',
      data: selectedReports,
      getPosition: report => [report.position.lng, report.position.lat, 8],
      getRadius: report => input.selectedReportId === report.id ? 18 + pulse * 6 : 10 + report.severity,
      radiusUnits: 'meters',
      getFillColor: [0, 0, 0, 0],
      getLineColor: [255, 255, 255, 210],
      getLineWidth: report => input.selectedReportId === report.id ? 3 : 2,
      lineWidthUnits: 'pixels',
      filled: false,
      stroked: true,
      pickable: true,
      onClick: info => {
        if (info.object) input.onSelectReport(info.object, { x: info.x ?? 0, y: info.y ?? 0 })
      },
      updateTriggers: {
        data: [zoom, input.selectedReportId],
        getRadius: [input.selectedReportId, pulse],
        getLineColor: [input.selectedReportId],
      },
      parameters: { depthCompare: 'always', depthWriteEnabled: false },
    }),

    new ScatterplotLayer<FloodReport>({
      id: 'flood-report-pointers',
      data: markerReports,
      getPosition: report => [report.position.lng, report.position.lat, 9],
      getRadius: report => input.selectedReportId === report.id ? 7 + pulse * 2 : 4.2 + report.severity * 0.55,
      radiusUnits: 'meters',
      getFillColor: report => input.selectedReportId === report.id ? [255, 255, 255, 220] : colorForReport(report, 156),
      getLineColor: [20, 12, 10, 132],
      getLineWidth: 1.4,
      lineWidthUnits: 'pixels',
      filled: true,
      stroked: true,
      pickable: true,
      onClick: info => {
        if (info.object) input.onSelectReport(info.object, { x: info.x ?? 0, y: info.y ?? 0 })
      },
      updateTriggers: {
        data: [zoom, input.selectedReportId],
        getRadius: [input.selectedReportId, pulse],
        getFillColor: [input.selectedReportId],
      },
      parameters: { depthCompare: 'always', depthWriteEnabled: false },
    }),

    new TextLayer<FloodReport>({
      id: 'flood-report-labels',
      data: markerReports.filter(report => report.source === 'pub-risk-area' || input.selectedReportId === report.id),
      getPosition: report => [report.position.lng, report.position.lat, 12],
      getText: report => report.severity >= 5 ? '!' : '',
      getSize: 14,
      getColor: [12, 14, 18, 235],
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'center',
      pickable: false,
      parameters: { depthCompare: 'always', depthWriteEnabled: false },
    }),
  ]
}
