import { PathLayer, SolidPolygonLayer, TextLayer } from '@deck.gl/layers'
import type { SimulationSuggestion } from '@/lib/simulationSuggestions'

type Rgba = [number, number, number, number]

function severityFill(severity: number, selected: boolean): Rgba {
  const a = selected ? 90 : 38
  if (severity >= 4.5) return [220, 38, 38, a]
  if (severity >= 3.8) return [249, 115, 22, a]
  if (severity >= 3.2) return [234, 179, 8, a]
  return [99, 182, 99, a]
}

function severityStroke(severity: number, pulse: number, selected: boolean): Rgba {
  const base = selected ? 210 + Math.round(45 * pulse) : 130 + Math.round(50 * pulse)
  if (severity >= 4.5) return [255, 80, 80, base]
  if (severity >= 3.8) return [255, 150, 50, base]
  if (severity >= 3.2) return [255, 210, 40, base]
  return [100, 210, 100, base]
}

export function makeSimulationSuggestionLayers(input: {
  suggestions: SimulationSuggestion[]
  selectedId: string | null
  onSelect: (s: SimulationSuggestion) => void
  time?: number
}) {
  const { suggestions, selectedId, onSelect } = input
  const pulse = 0.5 + 0.5 * Math.sin((input.time ?? 0) * 1.6)

  return [
    new SolidPolygonLayer<SimulationSuggestion>({
      id: 'sim-suggestion-fill',
      data: suggestions,
      getPolygon: s => s.polygon,
      getFillColor: s => severityFill(s.meanSeverity, s.id === selectedId),
      extruded: false,
      pickable: true,
      onClick: info => {
        if (info.object) onSelect(info.object)
      },
      parameters: { depthWriteEnabled: false },
      updateTriggers: {
        getFillColor: [selectedId],
      },
    }),

    new PathLayer<SimulationSuggestion>({
      id: 'sim-suggestion-outline',
      data: suggestions,
      getPath: s => s.polygon,
      getWidth: s => s.id === selectedId ? 4 : 2,
      widthUnits: 'pixels',
      getColor: s => severityStroke(s.meanSeverity, pulse, s.id === selectedId),
      pickable: false,
      parameters: { depthWriteEnabled: false },
      updateTriggers: {
        getColor: [selectedId, input.time],
        getWidth: [selectedId],
      },
    }),

    new TextLayer<SimulationSuggestion>({
      id: 'sim-suggestion-labels',
      data: suggestions,
      getPosition: s => [s.centroid.lng, s.centroid.lat, 8],
      getText: s => `${s.label}\n${s.nearbyReportCount} reports`,
      getSize: 12,
      getColor: [255, 255, 255, 230] as Rgba,
      getBackgroundColor: [12, 18, 38, 185] as Rgba,
      background: true,
      backgroundPadding: [6, 3, 6, 3],
      getBorderColor: [255, 255, 255, 40] as Rgba,
      getBorderWidth: 1,
      fontWeight: 600,
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'center',
      pickable: true,
      onClick: info => {
        if (info.object) onSelect(info.object)
      },
      parameters: { depthWriteEnabled: false },
    }),
  ]
}
