'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Icons } from '@/components/ui/icons'
import {
  chartColors,
  DistributionDonut,
  HorizontalMetricBars,
  ReadinessGauge,
} from '@/components/apex/ApexVisuals'
import { normalizeApexMarketingResult, formatPanelValue } from '@/lib/apex-marketing-normalizer'
import { cn } from '@/lib/utils'
import {
  type ApexReviewDetail,
  type ApexRunSnapshot,
  type ApexRunStatus,
  type CampaignBrief,
  getApexReview,
  getCampaignRun,
  listApexReviews,
  startCampaignRun,
  submitApexReview,
} from '@/lib/apex-marketing-api'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0 },
}

const happyBrief: CampaignBrief = {
  campaign_name: 'Apex AI Employee Launch',
  product_offer: 'Supervity-powered Marketing AI Employee for campaign execution',
  audience: 'Growth marketing leads and revenue operations teams at mid-market and enterprise companies',
  campaign_goal: 'Drive demo signups for AI-powered campaign execution',
  core_message:
    'Apex Marketing AI Employee turns campaign briefs into approved, governed, multi-channel execution with human control and measurable ROI.',
  key_benefits: [
    'Reduces manual campaign execution time from hours to minutes.',
    'Enforces approval gates and policy checks before external action.',
    'Creates channel-ready assets, audit logs, CRM records, and insights reports.',
  ],
  tone: 'Confident, enterprise-ready, practical',
  cta_link: 'https://example.com/demo',
  target_channels: ['LinkedIn', 'X', 'Blog', 'HubSpot'],
  success_metric: 'Demo signups',
}

const brokenBrief: CampaignBrief = {
  campaign_name: 'Apex Broken Brief Test',
  product_offer: 'Marketing AI Employee',
  audience: 'Growth marketing leads',
  campaign_goal: 'Drive demo signups',
  core_message: 'Turn one campaign brief into execution across channels.',
  key_benefits: ['Saves campaign execution time.', 'Creates content drafts.'],
  tone: 'Confident and practical',
  cta_link: '',
  target_channels: ['LinkedIn', 'X', 'Blog', 'HubSpot'],
  success_metric: 'Demo signups',
}

const agents = [
  { name: 'Apex Marketing Orchestrator', role: 'Manager Agent', terms: ['orchestrator', 'apex marketing orchestrator'] },
  { name: 'Data Processing Agent', role: 'Operator', terms: ['data processing', 'validates brief', 'validation'] },
  { name: 'Content Execution Agent', role: 'Operator', terms: ['content execution', 'drafted assets', 'content'] },
  { name: 'Communication Agent', role: 'Operator', terms: ['communication', 'teams', 'approval gate'] },
  { name: 'Document Management Agent', role: 'Operator', terms: ['document management', 'sharepoint', 'artifact'] },
  { name: 'CRM Operations Agent', role: 'Operator', terms: ['crm', 'hubspot'] },
  { name: 'Analytics & Reporting Agent', role: 'Operator', terms: ['analytics', 'insights', 'readiness'] },
  { name: 'Apex Marketing Web Search Capability', role: 'Core Capability', terms: ['web search', 'source citation', 'trend'] },
]

const policies = [
  { name: 'Brief validation', area: 'validation', terms: ['validation'] },
  { name: 'Required CTA', area: 'required CTA', terms: ['cta'] },
  { name: 'Minimum benefits', area: 'minimum benefits', terms: ['benefits'] },
  { name: 'Content generation guardrail', area: 'content generation', terms: ['draft', 'content'] },
  { name: 'Approval before external action', area: 'approval', terms: ['approval'] },
  { name: 'External action authorization', area: 'authorization', terms: ['authorized', 'external action'] },
  { name: 'SharePoint storage policy', area: 'storage', terms: ['sharepoint', 'storage'] },
  { name: 'CRM safety policy', area: 'CRM safety', terms: ['hubspot', 'crm'] },
  { name: 'Completion policy', area: 'completion', terms: ['completed'] },
  { name: 'Reporting and insights policy', area: 'reporting/insights', terms: ['insights', 'readiness'] },
]

type Preset = 'happy_path' | 'broken_path'

type PanelState = 'pending' | 'running' | 'completed' | 'paused' | 'failed' | 'unavailable'

function splitLines(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
}

function splitChannels(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function walk(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(walk)
  if (value && typeof value === 'object') return Object.values(value).flatMap(walk)
  return [value]
}

function textBlob(value: unknown) {
  return walk(value)
    .filter((item) => item !== null && item !== undefined)
    .map(String)
    .join(' ')
    .toLowerCase()
}

function findFirst(value: unknown, keys: string[]): unknown {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirst(item, keys)
      if (found !== undefined && found !== null && found !== '') return found
    }
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of keys) {
      if (record[key] !== undefined && record[key] !== null && record[key] !== '') return record[key]
    }
    for (const item of Object.values(record)) {
      const found = findFirst(item, keys)
      if (found !== undefined && found !== null && found !== '') return found
    }
  }
  return undefined
}

function hasAny(value: unknown, terms: string[]) {
  const blob = textBlob(value)
  return terms.some((term) => blob.includes(term.toLowerCase()))
}

function statusLabel(status: ApexRunStatus | 'submitting') {
  return status.replace(/_/g, ' ')
}

function statusClass(status: ApexRunStatus | 'submitting') {
  if (status === 'completed') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === 'failed') return 'border-red-200 bg-red-50 text-red-700'
  if (status === 'paused_needs_human_input') return 'border-amber-200 bg-amber-50 text-amber-800'
  if (status === 'approval_pending') return 'border-blue-200 bg-blue-50 text-blue-700'
  if (status === 'running' || status === 'submitting') return 'border-brand-cornflower/30 bg-brand-cornflower/10 text-brand-navy'
  return 'border-gray-200 bg-gray-50 text-muted-foreground'
}

function panelClass(state: PanelState) {
  if (state === 'completed') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (state === 'failed') return 'border-red-200 bg-red-50 text-red-700'
  if (state === 'paused') return 'border-amber-200 bg-amber-50 text-amber-800'
  if (state === 'running') return 'border-blue-200 bg-blue-50 text-blue-700'
  if (state === 'unavailable') return 'border-gray-200 bg-gray-50 text-muted-foreground'
  return 'border-gray-200 bg-white text-muted-foreground'
}

function inferEvidenceState(snapshot: ApexRunSnapshot | null, terms: string[]): PanelState {
  if (!snapshot) return 'pending'
  if (snapshot.status === 'failed') return 'failed'
  if (hasAny(snapshot, terms)) return 'completed'
  if (snapshot.status === 'running') return 'running'
  if (snapshot.status === 'approval_pending' || snapshot.status === 'paused_needs_human_input') return 'paused'
  return snapshot.status === 'completed' ? 'unavailable' : 'pending'
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className='max-h-80 overflow-auto rounded-lg bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-100'>
      {JSON.stringify(value ?? { note: 'Unavailable / not returned' }, null, 2)}
    </pre>
  )
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className='block space-y-1.5'>
      <span className='text-xs font-semibold uppercase text-brand-muted'>{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className='w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-brand-navy outline-none transition focus:border-brand-cornflower focus:ring-2 focus:ring-brand-cornflower/20'
      />
    </label>
  )
}

function TextAreaField({ label, value, onChange, rows = 4 }: { label: string; value: string; onChange: (value: string) => void; rows?: number }) {
  return (
    <label className='block space-y-1.5'>
      <span className='text-xs font-semibold uppercase text-brand-muted'>{label}</span>
      <textarea
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className='w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-brand-navy outline-none transition focus:border-brand-cornflower focus:ring-2 focus:ring-brand-cornflower/20'
      />
    </label>
  )
}

export default function HomePage() {
  const [preset, setPreset] = useState<Preset>('happy_path')
  const [brief, setBrief] = useState<CampaignBrief>(happyBrief)
  const [triggeredBy, setTriggeredBy] = useState('Aarushi')
  const [snapshot, setSnapshot] = useState<ApexRunSnapshot | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rawOpen, setRawOpen] = useState(false)
  const [reviewQueue, setReviewQueue] = useState<unknown>(null)
  const [reviewDetail, setReviewDetail] = useState<ApexReviewDetail | null>(null)
  const [reviewFormId, setReviewFormId] = useState('')
  const [reviewAction, setReviewAction] = useState('approve')
  const [reviewFeedback, setReviewFeedback] = useState('')
  const [exceptionType, setExceptionType] = useState('N/A')

  const normalizedResult = useMemo(() => normalizeApexMarketingResult(snapshot), [snapshot])
  const uiStatus: ApexRunStatus | 'submitting' = isSubmitting ? 'submitting' : normalizedResult.status

  const timeline = normalizedResult.timeline
  const agentStates = agents.map((agent) => inferEvidenceState(snapshot ? { ...snapshot, outputs: normalizedResult.outputRoot } : null, agent.terms))
  const policyStates = policies.map((policy) => inferEvidenceState(snapshot ? { ...snapshot, outputs: normalizedResult.outputRoot } : null, policy.terms))
  const returnedDraftCount = [normalizedResult.linkedinDraft, normalizedResult.xDraft, normalizedResult.blogDraft].filter(
    (draft) => draft !== 'Unavailable / not returned'
  ).length
  const returnedConnectorCount = [normalizedResult.teams, normalizedResult.sharepoint, normalizedResult.hubspot].filter(
    (connector) => connector.status !== 'Unavailable / not returned' && connector.status !== 'Not returned by connector'
  ).length
  const readinessValue = normalizedResult.readinessScore === 'Unavailable / not returned'
    ? null
    : Number.parseInt(normalizedResult.readinessScore, 10)
  const agentChartData = [
    { name: 'Completed', value: agentStates.filter((state) => state === 'completed').length, color: chartColors.emerald },
    { name: 'Running', value: agentStates.filter((state) => state === 'running').length, color: chartColors.cornflower },
    { name: 'Paused', value: agentStates.filter((state) => state === 'paused').length, color: chartColors.amber },
    { name: 'Pending', value: agentStates.filter((state) => state === 'pending' || state === 'unavailable').length, color: chartColors.slate },
    { name: 'Failed', value: agentStates.filter((state) => state === 'failed').length, color: chartColors.rose },
  ].filter((item) => item.value > 0)
  const connectorChartData = [
    { name: 'Teams', value: normalizedResult.teams.status === 'Unavailable / not returned' ? 0 : 1, fill: normalizedResult.teams.status === 'Not returned by connector' ? chartColors.amber : chartColors.emerald },
    { name: 'SharePoint', value: normalizedResult.sharepoint.status === 'Unavailable / not returned' ? 0 : 1, fill: normalizedResult.sharepoint.status === 'Not returned by connector' ? chartColors.amber : chartColors.emerald },
    { name: 'HubSpot', value: normalizedResult.hubspot.status === 'Unavailable / not returned' ? 0 : 1, fill: normalizedResult.hubspot.status === 'Not returned by connector' ? chartColors.amber : chartColors.emerald },
  ]
  const policyChartData = [
    { name: 'Observed', value: policyStates.filter((state) => state === 'completed').length, fill: chartColors.emerald },
    { name: 'Watching', value: policyStates.filter((state) => state === 'running').length, fill: chartColors.cornflower },
    { name: 'Paused', value: policyStates.filter((state) => state === 'paused').length, fill: chartColors.amber },
    { name: 'Pending', value: policyStates.filter((state) => state === 'pending' || state === 'unavailable').length, fill: chartColors.slate },
    { name: 'Failed', value: policyStates.filter((state) => state === 'failed').length, fill: chartColors.rose },
  ].filter((item) => item.value > 0)

  useEffect(() => {
    if (snapshot) {
      window.localStorage.setItem('apexMarketing:lastSnapshot', JSON.stringify(snapshot))
    }
  }, [snapshot])

  useEffect(() => {
    if (reviewQueue) {
      window.localStorage.setItem('apexMarketing:lastReviewQueue', JSON.stringify(reviewQueue))
    }
  }, [reviewQueue])

  useEffect(() => {
    if (reviewDetail) {
      window.localStorage.setItem('apexMarketing:lastReviewDetail', JSON.stringify(reviewDetail))
    }
  }, [reviewDetail])

  useEffect(() => {
    if (!snapshot?.runId) return
    if (!['running', 'approval_pending'].includes(snapshot.status)) return

    const timer = window.setInterval(async () => {
      try {
        const next = await getCampaignRun(String(snapshot.runId))
        setSnapshot(next)
      } catch {
        window.clearInterval(timer)
      }
    }, 5000)

    return () => window.clearInterval(timer)
  }, [snapshot?.runId, snapshot?.status])

  const applyPreset = (nextPreset: Preset) => {
    setPreset(nextPreset)
    setBrief(nextPreset === 'happy_path' ? happyBrief : brokenBrief)
    setSnapshot(null)
    setError(null)
  }

  const updateBrief = (key: keyof CampaignBrief, value: string | string[]) => {
    setBrief((current) => ({ ...current, [key]: value }))
  }

  const runCampaign = async () => {
    setIsSubmitting(true)
    setError(null)
    setSnapshot(null)
    try {
      const result = await startCampaignRun({
        triggered_by: triggeredBy,
        campaign_brief: brief,
        test_mode: preset,
      })
      setSnapshot(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setSnapshot({ status: 'failed', errorReason: err instanceof Error ? err.message : 'Unknown error', timeline: [], raw: err })
    } finally {
      setIsSubmitting(false)
    }
  }

  const refreshReviews = async () => {
    setError(null)
    try {
      const response = await listApexReviews()
      setReviewQueue(response.raw)
      const firstFormId = findFirst(response.raw, ['formId', 'id'])
      if (typeof firstFormId === 'string') setReviewFormId(firstFormId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to fetch reviews')
    }
  }

  const openReview = async () => {
    if (!reviewFormId.trim()) return
    setError(null)
    try {
      const detail = await getApexReview(reviewFormId.trim())
      setReviewDetail(detail)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to fetch review form')
    }
  }

  const submitReview = async () => {
    const formId = reviewDetail?.formId || reviewFormId.trim()
    if (!formId) return

    const normalizedAction = reviewAction?.toString().trim().toLowerCase()
    if (normalizedAction !== 'approve' && normalizedAction !== 'reject') {
      setError('Review action must be approve or reject.')
      return
    }

    setError(null)
    try {
      await submitApexReview(formId, {
        status: normalizedAction,
        primary_action: normalizedAction,
        feedback: reviewFeedback,
        exception_type: exceptionType,
      })
      await refreshReviews()
      if (reviewDetail?.runId) {
        const next = await getCampaignRun(String(reviewDetail.runId))
        setSnapshot(next)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit review')
    }
  }

  return (
    <motion.div className='space-y-6' variants={containerVariants} initial='hidden' animate='visible'>
      <motion.div variants={itemVariants} className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
        <div>
          <p className='text-xs font-semibold uppercase text-brand-muted'>Apex Marketing AI Employee</p>
          <h1 className='mt-1 text-display-3 font-bold text-brand-navy lg:text-display-2'>Marketing Command Center</h1>
          <p className='mt-2 max-w-3xl text-sm text-muted-foreground'>
            Trigger the Supervity Auto Orchestrator, watch delegation, handle Workbench exceptions, and inspect returned business outputs.
          </p>
        </div>
        <div className={cn('inline-flex items-center rounded-full border px-4 py-2 text-sm font-semibold capitalize', statusClass(uiStatus))}>
          {statusLabel(uiStatus)}
        </div>
      </motion.div>

      {error && (
        <motion.div variants={itemVariants} className='rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700'>
          {error}
        </motion.div>
      )}

      <motion.div variants={itemVariants} className='grid gap-4 md:grid-cols-4'>
        {[
          { label: 'Timeline events', value: timeline.length, icon: Icons.activity },
          { label: 'Returned drafts', value: `${returnedDraftCount}/3`, icon: Icons.fileText },
          { label: 'Connector returns', value: `${returnedConnectorCount}/3`, icon: Icons.network },
          { label: 'Policy evidence', value: `${policyStates.filter((state) => state === 'completed').length}/10`, icon: Icons.shield },
        ].map((metric) => (
          <Card key={metric.label}>
            <CardContent className='p-4'>
              <div className='flex items-center gap-3'>
                <div className='flex h-10 w-10 items-center justify-center rounded-lg bg-brand-cornflower/15 text-brand-navy'>
                  <metric.icon className='h-5 w-5' />
                </div>
                <div>
                  <p className='text-xs font-semibold uppercase text-brand-muted'>{metric.label}</p>
                  <p className='mt-1 text-xl font-bold text-brand-navy'>{metric.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      <motion.div variants={itemVariants} className='grid gap-6 xl:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.25fr)]'>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-brand-navy'>
              <Icons.fileText className='h-5 w-5 text-brand-cornflower' /> Campaign Brief
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid grid-cols-2 gap-2'>
              <Button variant={preset === 'happy_path' ? 'gradient' : 'outline'} onClick={() => applyPreset('happy_path')}>Happy Path</Button>
              <Button variant={preset === 'broken_path' ? 'gradient' : 'outline'} onClick={() => applyPreset('broken_path')}>Broken Path</Button>
            </div>
            <TextField label='Triggered by' value={triggeredBy} onChange={setTriggeredBy} />
            <TextField label='Campaign name' value={brief.campaign_name} onChange={(value) => updateBrief('campaign_name', value)} />
            <TextField label='Product offer' value={brief.product_offer} onChange={(value) => updateBrief('product_offer', value)} />
            <TextAreaField label='Audience' value={brief.audience} onChange={(value) => updateBrief('audience', value)} rows={3} />
            <TextField label='Campaign goal' value={brief.campaign_goal} onChange={(value) => updateBrief('campaign_goal', value)} />
            <TextAreaField label='Core message' value={brief.core_message} onChange={(value) => updateBrief('core_message', value)} rows={4} />
            <TextAreaField label='Key benefits' value={brief.key_benefits.join('\n')} onChange={(value) => updateBrief('key_benefits', splitLines(value))} rows={4} />
            <div className='grid gap-4 md:grid-cols-2'>
              <TextField label='Tone' value={brief.tone} onChange={(value) => updateBrief('tone', value)} />
              <TextField label='CTA link' value={brief.cta_link} onChange={(value) => updateBrief('cta_link', value)} />
            </div>
            <div className='grid gap-4 md:grid-cols-2'>
              <TextField label='Target channels' value={brief.target_channels.join(', ')} onChange={(value) => updateBrief('target_channels', splitChannels(value))} />
              <TextField label='Success metric' value={brief.success_metric} onChange={(value) => updateBrief('success_metric', value)} />
            </div>
            <Button onClick={runCampaign} disabled={isSubmitting} variant='gradient' className='w-full'>
              {isSubmitting ? <Icons.loader className='mr-2 h-4 w-4 animate-spin' /> : <Icons.zap className='mr-2 h-4 w-4' />}
              Start Campaign Run
            </Button>
          </CardContent>
        </Card>

        <div className='space-y-6'>
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2 text-brand-navy'>
                <Icons.activity className='h-5 w-5 text-brand-cornflower' /> Workflow Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='space-y-3'>
                {timeline.length === 0 ? (
                  <div className='rounded-lg border border-dashed border-gray-200 p-6 text-sm text-muted-foreground'>No workflow events returned yet.</div>
                ) : (
                  timeline.map((event) => (
                    <div key={event.id} className='flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3'>
                      <div>
                        <p className='text-sm font-semibold text-brand-navy'>{event.label}</p>
                        <p className='text-xs text-muted-foreground'>Raw event preserved for audit</p>
                      </div>
                      <span className='rounded-full border border-gray-200 px-2.5 py-1 text-xs font-semibold capitalize text-brand-muted'>{event.status}</span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2 text-brand-navy'>
                <Icons.network className='h-5 w-5 text-brand-cornflower' /> Agent Delegation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='grid gap-3 md:grid-cols-2'>
                {agents.map((agent) => {
                  const state = inferEvidenceState(snapshot ? { ...snapshot, outputs: normalizedResult.outputRoot } : null, agent.terms)
                  return (
                    <div key={agent.name} className={cn('rounded-lg border p-3', panelClass(state))}>
                      <div className='flex items-start justify-between gap-2'>
                        <div>
                          <p className='text-sm font-semibold'>{agent.name}</p>
                          <p className='text-xs opacity-80'>{agent.role}</p>
                        </div>
                        <span className='text-xs font-semibold capitalize'>{state.replace(/_/g, ' ')}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </motion.div>

      <motion.div variants={itemVariants} className='grid gap-6 xl:grid-cols-[0.8fr_1fr_0.8fr]'>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-brand-navy'>
              <Icons.network className='h-5 w-5 text-brand-cornflower' /> Agent State Mix
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DistributionDonut data={agentChartData.length ? agentChartData : [{ name: 'Pending', value: agents.length, color: chartColors.slate }]} centerLabel='agents' />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-brand-navy'>
              <Icons.barChart className='h-5 w-5 text-brand-cornflower' /> Returned Evidence
            </CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalMetricBars data={connectorChartData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-brand-navy'>
              <Icons.trendingUp className='h-5 w-5 text-brand-cornflower' /> Readiness
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ReadinessGauge value={Number.isFinite(readinessValue) ? readinessValue : null} label='score / 100' />
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={itemVariants} className='grid gap-6 xl:grid-cols-3'>
        <Card className='xl:col-span-2'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-brand-navy'>
              <Icons.shield className='h-5 w-5 text-brand-cornflower' /> Dynamic AI Policies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='grid gap-3 md:grid-cols-2'>
              {policies.map((policy) => {
                const state = inferEvidenceState(snapshot ? { ...snapshot, outputs: normalizedResult.outputRoot } : null, policy.terms)
                return (
                  <div key={policy.name} className={cn('rounded-lg border p-3', panelClass(state))}>
                    <p className='text-sm font-semibold'>{policy.name}</p>
                    <p className='text-xs capitalize opacity-80'>{policy.area}</p>
                  </div>
                )
              })}
            </div>
            <div className='mt-5 rounded-lg border border-gray-200 bg-white p-3'>
              <HorizontalMetricBars data={policyChartData.length ? policyChartData : [{ name: 'Pending', value: policies.length, fill: chartColors.slate }]} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-brand-navy'>
              <Icons.workbench className='h-5 w-5 text-brand-cornflower' /> Workbench / Approval
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className={cn('rounded-lg border p-3 text-sm', panelClass(snapshot?.status === 'approval_pending' ? 'running' : snapshot?.status === 'paused_needs_human_input' ? 'paused' : 'pending'))}>
              {snapshot?.status === 'approval_pending'
                ? 'Approval pending in Supervity Human-in-Command.'
                : snapshot?.status === 'paused_needs_human_input'
                  ? 'Paused for Workbench human correction.'
                  : 'No active Workbench item returned yet.'}
            </div>
            <div className='flex gap-2'>
              <Button variant='outline' onClick={refreshReviews} className='flex-1'>Refresh Reviews</Button>
              <Button variant='outline' onClick={openReview} className='flex-1'>Open Form</Button>
            </div>
            <TextField label='Form ID' value={reviewFormId} onChange={setReviewFormId} />
            <label className='block space-y-1.5'>
              <span className='text-xs font-semibold uppercase text-brand-muted'>Primary action</span>
              <select value={reviewAction} onChange={(event) => setReviewAction(event.target.value)} className='w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-brand-navy'>
                <option value='approve'>approve</option>
                <option value='reject'>reject</option>
              </select>
            </label>
            <TextField label='Exception type' value={exceptionType} onChange={setExceptionType} />
            <TextAreaField label='Feedback' value={reviewFeedback} onChange={setReviewFeedback} rows={3} />
            <Button variant='gradient' onClick={submitReview} className='w-full'>Submit Review</Button>
            {reviewDetail?.html && <div className='max-h-56 overflow-auto rounded-lg border border-gray-200 p-3 text-xs' dangerouslySetInnerHTML={{ __html: reviewDetail.html }} />}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={itemVariants} className='grid gap-6 xl:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-brand-navy'>
              <Icons.fileText className='h-5 w-5 text-brand-cornflower' /> Generated Drafts
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            {[
              ['LinkedIn draft', normalizedResult.linkedinDraft],
              ['X draft / summary', normalizedResult.xDraft],
              ['Blog draft', normalizedResult.blogDraft],
            ].map(([label, value]) => (
              <div key={String(label)} className='rounded-lg border border-gray-200 p-3'>
                <p className='text-xs font-semibold uppercase text-brand-muted'>{String(label)}</p>
                <p className='mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-brand-navy'>{String(value)}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-brand-navy'>
              <Icons.checkCircle className='h-5 w-5 text-brand-cornflower' /> Final Result Panel
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            {[
              normalizedResult.teams,
              normalizedResult.sharepoint,
              normalizedResult.hubspot,
            ].map((item) => (
              <div key={item.label} className='rounded-lg border border-gray-200 p-3'>
                <div className='flex items-center justify-between gap-3'>
                  <p className='text-xs font-semibold uppercase text-brand-muted'>{item.label}</p>
                  <span className='rounded-full border border-gray-200 px-2 py-0.5 text-xs font-semibold text-brand-muted'>{item.status}</span>
                </div>
                <p className='mt-2 whitespace-pre-wrap break-words text-sm text-brand-navy'>{formatPanelValue(item.value)}</p>
              </div>
            ))}
            <div className='grid gap-3 md:grid-cols-2'>
              <div className='rounded-lg border border-gray-200 p-3'>
                <p className='text-xs font-semibold uppercase text-brand-muted'>Time Saved</p>
                <p className='mt-1 text-sm font-semibold text-brand-navy'>{normalizedResult.timeSaved}</p>
              </div>
              <div className='rounded-lg border border-gray-200 p-3'>
                <p className='text-xs font-semibold uppercase text-brand-muted'>Readiness Score</p>
                <p className='mt-1 text-sm font-semibold text-brand-navy'>{normalizedResult.readinessScore}</p>
              </div>
            </div>
            <div className='rounded-lg border border-gray-200 p-3'>
              <p className='text-xs font-semibold uppercase text-brand-muted'>AI Insights</p>
              <p className='mt-1 whitespace-pre-wrap break-words text-sm text-brand-navy'>{formatPanelValue(normalizedResult.aiInsights)}</p>
            </div>
            <div className='rounded-lg border border-gray-200 p-3'>
              <p className='text-xs font-semibold uppercase text-brand-muted'>Approval / Workbench</p>
              <p className='mt-1 text-sm text-brand-navy'>Approval: {normalizedResult.approvalStatus}</p>
              <p className='mt-1 text-sm text-brand-navy'>Approval bypass used: {normalizedResult.approvalBypassUsed === null ? 'Unavailable / not returned' : String(normalizedResult.approvalBypassUsed)}</p>
              <p className='mt-1 text-sm text-brand-navy'>Workbench exception: {formatPanelValue(normalizedResult.workbenchException)}</p>
            </div>
            {snapshot?.errorReason && <div className='rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700'>{snapshot.errorReason}</div>}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={itemVariants} className='grid gap-6 xl:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-brand-navy'>
              <Icons.activity className='h-5 w-5 text-brand-cornflower' /> Processed Request / Agent Outputs
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <div className='rounded-lg border border-gray-200 p-3'>
              <p className='text-xs font-semibold uppercase text-brand-muted'>Processed request payload</p>
              <p className='mt-1 whitespace-pre-wrap break-words text-sm text-brand-navy'>{formatPanelValue(normalizedResult.processedRequestPayload)}</p>
            </div>
            <div className='rounded-lg border border-gray-200 p-3'>
              <p className='text-xs font-semibold uppercase text-brand-muted'>Raw agent outputs</p>
              <p className='mt-1 whitespace-pre-wrap break-words text-sm text-brand-navy'>{formatPanelValue(normalizedResult.rawAgentOutputs)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center justify-between gap-2 text-brand-navy'>
              <span className='flex items-center gap-2'><Icons.fileText className='h-5 w-5 text-brand-cornflower' /> Raw API Response</span>
              <Button variant='outline' size='sm' onClick={() => setRawOpen((open) => !open)}>{rawOpen ? 'Hide' : 'Show'}</Button>
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            {rawOpen ? <JsonBlock value={{ normalizedResult, snapshot, reviewQueue, reviewDetail }} /> : <div className='rounded-lg border border-dashed border-gray-200 p-6 text-sm text-muted-foreground'>Raw response drawer is closed.</div>}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}



