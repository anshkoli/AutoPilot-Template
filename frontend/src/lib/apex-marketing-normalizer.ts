import type { ApexRunSnapshot, ApexRunStatus, TimelineEvent } from '@/lib/apex-marketing-api'

type JsonRecord = Record<string, unknown>

export interface NormalizedConnectorResult {
  label: string
  status: string
  value: unknown
}

export interface NormalizedApexResult {
  status: ApexRunStatus
  sourceStatus?: string | null
  approvalStatus: string
  approvalBypassUsed: boolean | null
  reviewerFeedback: string
  linkedinDraft: string
  xDraft: string
  blogDraft: string
  teams: NormalizedConnectorResult
  sharepoint: NormalizedConnectorResult
  hubspot: NormalizedConnectorResult
  timeSaved: string
  readinessScore: string
  aiInsights: unknown
  workbenchException: unknown
  timeline: TimelineEvent[]
  rawAgentOutputs: unknown
  processedRequestPayload: unknown
  outputRoot: unknown
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function entriesDeep(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(entriesDeep)
  if (isRecord(value)) return Object.values(value).flatMap(entriesDeep)
  return [value]
}

function textBlob(value: unknown) {
  return entriesDeep(value)
    .filter((item) => item !== null && item !== undefined)
    .map(String)
    .join(' ')
    .toLowerCase()
}

function getDirect(record: unknown, keys: string[]): unknown {
  if (!isRecord(record)) return undefined
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== '') return record[key]
  }
  const lowerKeys = keys.map((key) => key.toLowerCase())
  for (const [key, value] of Object.entries(record)) {
    if (lowerKeys.includes(key.toLowerCase()) && value !== undefined && value !== null && value !== '') return value
  }
  return undefined
}

function findFirst(value: unknown, keys: string[]): unknown {
  const direct = getDirect(value, keys)
  if (direct !== undefined) return direct

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirst(item, keys)
      if (found !== undefined && found !== null && found !== '') return found
    }
  }

  if (isRecord(value)) {
    for (const item of Object.values(value)) {
      const found = findFirst(item, keys)
      if (found !== undefined && found !== null && found !== '') return found
    }
  }

  return undefined
}

const apexOutputKeys = [
  'content_drafts',
  'contentDrafts',
  'teams',
  'sharepoint',
  'hubspot',
  'ai_insights',
  'aiInsights',
  'workbench_exception',
  'workbenchException',
  'processed_request_payload',
  'processedRequestPayload',
  'agent_timeline',
  'agentTimeline',
]

function hasApexOutput(value: unknown) {
  return Boolean(findFirst(value, apexOutputKeys))
}

function findApexOutputObject(value: unknown): unknown {
  if (isRecord(value)) {
    if (apexOutputKeys.some((key) => getDirect(value, [key]) !== undefined)) return value
    for (const item of Object.values(value)) {
      const found = findApexOutputObject(item)
      if (found !== undefined && found !== null) return found
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findApexOutputObject(item)
      if (found !== undefined && found !== null) return found
    }
  }

  return undefined
}

function asString(value: unknown, fallback = 'Unavailable / not returned') {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value, null, 2)
}

function normalizeStatus(snapshot: ApexRunSnapshot | null, root: unknown): ApexRunStatus {
  const source = String(
    getDirect(root, ['status', 'final_status', 'state', 'runStatus']) ||
      snapshot?.status ||
      'idle'
  ).toLowerCase()

  if (source === 'success' || source === 'succeeded' || source === 'complete') return 'completed'
  if (source === 'completed') return 'completed'
  if (source === 'waiting') {
    const text = textBlob(root)
    if (text.includes('approval') || text.includes('approve')) return 'approval_pending'
    return 'paused_needs_human_input'
  }
  if (source === 'failed' || source === 'error' || source === 'cancelled') return 'failed'
  if (source === 'running' || source === 'scheduled' || source === 'processing' || source === 'in_progress') return 'running'
  if (snapshot?.status) return snapshot.status
  return 'idle'
}

function normalizeConnector(label: string, value: unknown): NormalizedConnectorResult {
  if (value === undefined || value === null || value === '') {
    return { label, status: 'Unavailable / not returned', value: null }
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'not_returned' || normalized === 'not returned') {
      return { label, status: 'Not returned by connector', value }
    }
    if (normalized === 'unavailable') {
      return { label, status: 'Unavailable / not returned', value }
    }
    return { label, status: value, value }
  }

  const status = getDirect(value, ['status', 'state', 'result'])
  return { label, status: asString(status, 'Returned by connector'), value }
}

function normalizeTimeline(snapshot: ApexRunSnapshot | null, root: unknown): TimelineEvent[] {
  const agentTimeline = getDirect(root, ['agent_timeline', 'agentTimeline', 'timeline'])
  if (Array.isArray(agentTimeline) && agentTimeline.length > 0) {
    return agentTimeline.map((event, index) => ({
      id: String(getDirect(event, ['id', 'run_id', 'activity_id']) || `agent-${index}`),
      label: asString(getDirect(event, ['label', 'name', 'agent', 'step', 'node', 'title']) || `Agent event ${index + 1}`),
      status: asString(getDirect(event, ['status', 'state']) || 'returned'),
      raw: event,
    }))
  }

  return snapshot?.timeline ?? []
}

function currentOutputRoot(snapshot: ApexRunSnapshot | null): unknown {
  if (!snapshot) return null

  const wrapperKeys = ['outputs', 'output', 'result', 'results', 'final_response', 'finalApiResponse']

  if (hasApexOutput(snapshot.outputs)) {
    return findApexOutputObject(snapshot.outputs) ?? snapshot.outputs
  }

  if (hasApexOutput(snapshot.raw)) {
    return findApexOutputObject(snapshot.raw) ?? snapshot.raw
  }

  if (Array.isArray(snapshot.rawEvents) && snapshot.rawEvents.length > 0) {
    for (const event of [...snapshot.rawEvents].reverse()) {
      if (hasApexOutput(event)) return findApexOutputObject(event) ?? event
    }
  }

  if (snapshot.outputs) return snapshot.outputs

  const rawOutput = findFirst(snapshot.raw, wrapperKeys)
  if (rawOutput) return rawOutput

  if (Array.isArray(snapshot.rawEvents) && snapshot.rawEvents.length > 0) {
    for (const event of [...snapshot.rawEvents].reverse()) {
      const eventOutput = findFirst(event, wrapperKeys)
      if (eventOutput) return eventOutput
    }
  }

  return snapshot.raw ?? null
}

export function normalizeApexMarketingResult(snapshot: ApexRunSnapshot | null): NormalizedApexResult {
  const root = currentOutputRoot(snapshot)
  const drafts = findFirst(root, ['content_drafts', 'contentDrafts'])
  const insights = findFirst(root, ['ai_insights', 'aiInsights', 'analytics', 'insights'])

  const linkedinDraft = getDirect(drafts, ['LinkedIn', 'linkedin', 'linkedin_draft', 'linkedinDraft'])
  const xDraft = getDirect(drafts, ['X', 'x', 'x_threads', 'x_summary', 'xThreads', 'xSummary'])
  const blogDraft = getDirect(drafts, ['Blog', 'blog', 'blog_draft', 'blogDraft'])

  const timeSaved = getDirect(insights, ['manual_time_saved_minutes', 'time_saved_minutes', 'timeSaved', 'time_saved'])
  const readiness = getDirect(insights, ['campaign_readiness_score', 'readiness_score', 'readinessScore'])

  return {
    status: normalizeStatus(snapshot, root),
    sourceStatus: snapshot?.sourceStatus ?? asString(getDirect(root, ['status']), ''),
    approvalStatus: asString(findFirst(root, ['approval_status', 'approvalStatus', 'approval']), 'Unavailable / not returned'),
    approvalBypassUsed: findFirst(root, ['approval_bypass_used', 'approvalBypassUsed']) as boolean | null ?? null,
    reviewerFeedback: asString(findFirst(root, ['reviewer_feedback', 'reviewerFeedback']), 'Unavailable / not returned'),
    linkedinDraft: asString(linkedinDraft),
    xDraft: asString(xDraft),
    blogDraft: asString(blogDraft),
    teams: normalizeConnector('Teams notification', findFirst(root, ['teams', 'teams_notification', 'teamsNotification', 'communication'])),
    sharepoint: normalizeConnector('SharePoint artifacts', findFirst(root, ['sharepoint', 'sharePoint', 'sharepoint_artifacts', 'artifactReferences'])),
    hubspot: normalizeConnector('HubSpot CRM reference', findFirst(root, ['hubspot', 'hubSpot', 'hubspot_crm_reference', 'crm'])),
    timeSaved: timeSaved === undefined ? 'Unavailable / not returned' : `${timeSaved} minutes`,
    readinessScore: readiness === undefined ? 'Unavailable / not returned' : `${readiness}/100`,
    aiInsights: insights ?? null,
    workbenchException: findFirst(root, ['workbench_exception', 'workbenchException', 'exception']) ?? null,
    timeline: normalizeTimeline(snapshot, root),
    rawAgentOutputs: findFirst(root, ['raw_agent_outputs', 'rawAgentOutputs']) ?? null,
    processedRequestPayload: findFirst(root, ['processed_request_payload', 'processedRequestPayload']) ?? snapshot?.request ?? null,
    outputRoot: root,
  }
}

export function formatPanelValue(value: unknown) {
  return asString(value)
}



