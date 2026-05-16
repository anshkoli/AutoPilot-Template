import { apiClient } from '@/lib/api-client'

export type ApexRunStatus =
  | 'idle'
  | 'running'
  | 'paused_needs_human_input'
  | 'approval_pending'
  | 'completed'
  | 'failed'

export interface CampaignBrief {
  campaign_name: string
  product_offer: string
  audience: string
  campaign_goal: string
  core_message: string
  key_benefits: string[]
  tone: string
  cta_link: string
  target_channels: string[]
  success_metric: string
}

export interface StartCampaignRunPayload {
  triggered_by: string
  campaign_brief: CampaignBrief
  test_mode: 'happy_path' | 'broken_path'
}

export interface TimelineEvent {
  id: string
  label: string
  status: string
  raw: unknown
}

export interface ApexRunSnapshot {
  runId?: string | null
  status: ApexRunStatus
  sourceStatus?: string | null
  errorReason?: string | null
  timeline: TimelineEvent[]
  outputs?: unknown
  raw?: unknown
  rawEvents?: unknown[]
  request?: { formFields?: Record<string, string> }
}

export interface ApexReviewSummary {
  items: unknown
  raw: unknown
}

export interface ApexReviewDetail {
  formId: string
  runId?: string | null
  html?: string | null
  schema?: unknown
  raw: unknown
}

export function startCampaignRun(payload: StartCampaignRunPayload) {
  return apiClient.post<ApexRunSnapshot>('/api/apex-marketing/runs', payload)
}

export function getCampaignRun(runId: string) {
  return apiClient.get<ApexRunSnapshot>(`/api/apex-marketing/runs/${runId}`)
}

export function listApexReviews() {
  return apiClient.get<ApexReviewSummary>('/api/apex-marketing/reviews')
}

export function getApexReview(formId: string) {
  return apiClient.get<ApexReviewDetail>(`/api/apex-marketing/reviews/${formId}`)
}

export function submitApexReview(formId: string, data: Record<string, unknown>) {
  return apiClient.post<{ submitted: boolean; raw: unknown }>(
    `/api/apex-marketing/reviews/${formId}/submit`,
    { data }
  )
}
