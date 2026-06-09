export interface ReportMediaAsset {
  id: string
  title: string
  kind: string
  imageUrl?: string
  caption: string
}

export interface ReportPurchaseDetail {
  id: string
  location: string
  listing: string
  format: string
  price: string
  reach: string
  score: string
}

export interface ReportSignal {
  id: string
  label: string
  value: string
  detail: string
}

export interface ReportInterview {
  id: string
  participant: string
  context: string
  quote: string
}

export interface ShareablePdfReportData {
  title: string
  subtitle: string
  generatedAt: string
  market: string
  campaign: string
  score: number
  mediaAssets: ReportMediaAsset[]
  purchaseDetails: ReportPurchaseDetail[]
  mediaFeedback: ReportSignal[]
  audienceAnalysis: ReportSignal[]
  interviews: ReportInterview[]
  finalRecommendation: string
}
