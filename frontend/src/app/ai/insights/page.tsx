'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
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
import { type ApexRunSnapshot } from '@/lib/apex-marketing-api'
import { formatPanelValue, normalizeApexMarketingResult } from '@/lib/apex-marketing-normalizer'
import { cn } from '@/lib/utils'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0 },
}

function readSnapshot() {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem('apexMarketing:lastSnapshot')
  if (!raw) return null
  try {
    return JSON.parse(raw) as ApexRunSnapshot
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function findDeep(value: unknown, keys: string[]): unknown {
  if (isRecord(value)) {
    for (const key of keys) {
      if (value[key] !== undefined && value[key] !== null && value[key] !== '') return value[key]
    }
    const lowerKeys = keys.map((key) => key.toLowerCase())
    for (const [key, item] of Object.entries(value)) {
      if (lowerKeys.includes(key.toLowerCase()) && item !== undefined && item !== null && item !== '') return item
    }
    for (const item of Object.values(value)) {
      const found = findDeep(item, keys)
      if (found !== undefined && found !== null && found !== '') return found
    }
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findDeep(item, keys)
      if (found !== undefined && found !== null && found !== '') return found
    }
  }
  return undefined
}

function metricClass(value: string) {
  if (value === 'Unavailable / not returned') return 'border-gray-200 bg-white text-brand-muted'
  return 'border-emerald-200 bg-emerald-50 text-emerald-700'
}

function DraftPreview({ title, value }: { title: string; value: string }) {
  return (
    <div className='rounded-lg border border-gray-200 bg-white p-4'>
      <p className='text-xs font-semibold uppercase text-brand-muted'>{title}</p>
      <p className='mt-2 line-clamp-5 whitespace-pre-wrap text-sm leading-relaxed text-brand-navy'>{value}</p>
    </div>
  )
}

export default function AIInsightsPage() {
  const [snapshot, setSnapshot] = useState<ApexRunSnapshot | null>(null)

  useEffect(() => {
    setSnapshot(readSnapshot())
  }, [])

  const normalized = useMemo(() => normalizeApexMarketingResult(snapshot), [snapshot])
  const nextBestAction = findDeep(normalized.aiInsights, ['next_best_action', 'nextBestAction', 'recommended_action', 'suggested_action'])
  const reasoningTrace = findDeep(normalized.aiInsights, ['reasoning_trace', 'reasoningTrace', 'trace'])
  const metricSource = findDeep(normalized.aiInsights, ['metric_source', 'metricSource', 'source'])
  const draftCount = [normalized.linkedinDraft, normalized.xDraft, normalized.blogDraft].filter((draft) => draft !== 'Unavailable / not returned').length
  const readinessValue = normalized.readinessScore === 'Unavailable / not returned'
    ? null
    : Number.parseInt(normalized.readinessScore, 10)
  const connectorBars = [
    { name: 'Teams', value: normalized.teams.status === 'Unavailable / not returned' ? 0 : 1, fill: normalized.teams.status === 'Not returned by connector' ? chartColors.amber : chartColors.emerald },
    { name: 'SharePoint', value: normalized.sharepoint.status === 'Unavailable / not returned' ? 0 : 1, fill: normalized.sharepoint.status === 'Not returned by connector' ? chartColors.amber : chartColors.emerald },
    { name: 'HubSpot', value: normalized.hubspot.status === 'Unavailable / not returned' ? 0 : 1, fill: normalized.hubspot.status === 'Not returned by connector' ? chartColors.amber : chartColors.emerald },
  ]
  const draftCoverageData = [
    { name: 'Returned', value: draftCount, color: chartColors.emerald },
    { name: 'Missing', value: Math.max(0, 3 - draftCount), color: chartColors.slate },
  ].filter((item) => item.value > 0)

  return (
    <motion.div className='space-y-6' variants={containerVariants} initial='hidden' animate='visible'>
      <motion.div variants={itemVariants} className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
        <div>
          <p className='text-xs font-semibold uppercase tracking-wide text-brand-muted'>Apex Marketing AI Employee</p>
          <h1 className='mt-1 text-display-3 font-bold tracking-tight text-brand-navy lg:text-display-2'>AI Insights Board</h1>
          <p className='mt-2 max-w-3xl text-sm text-muted-foreground'>Business-value evidence from the Analytics & Reporting Agent: time saved, readiness score, reasoning trace, next action, and content coverage.</p>
        </div>
        <Button asChild variant='gradient'><Link href='/'>Run Latest Campaign</Link></Button>
      </motion.div>

      <motion.div variants={itemVariants} className='grid gap-4 md:grid-cols-4'>
        {[
          { label: 'Time Saved', value: normalized.timeSaved, icon: Icons.clock },
          { label: 'Readiness Score', value: normalized.readinessScore, icon: Icons.trendingUp },
          { label: 'Draft Coverage', value: `${draftCount}/3 channels`, icon: Icons.fileText },
          { label: 'Run Status', value: normalized.status.replace(/_/g, ' '), icon: Icons.activity },
        ].map((metric) => (
          <Card key={metric.label} className={cn('overflow-hidden border', metricClass(metric.value))}>
            <CardContent className='p-4'>
              <div className='flex items-center gap-3'>
                <div className='flex h-10 w-10 items-center justify-center rounded-lg bg-white/70'><metric.icon className='h-5 w-5' /></div>
                <div>
                  <p className='text-xs font-semibold uppercase opacity-80'>{metric.label}</p>
                  <p className='mt-1 text-lg font-bold capitalize'>{metric.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      <motion.div variants={itemVariants} className='grid gap-6 xl:grid-cols-[0.8fr_0.8fr_1.2fr]'>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-brand-navy'><Icons.trendingUp className='h-5 w-5 text-brand-cornflower' /> Readiness Gauge</CardTitle>
          </CardHeader>
          <CardContent>
            <ReadinessGauge value={Number.isFinite(readinessValue) ? readinessValue : null} label='score / 100' />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-brand-navy'><Icons.fileText className='h-5 w-5 text-brand-cornflower' /> Draft Coverage</CardTitle>
          </CardHeader>
          <CardContent>
            <DistributionDonut data={draftCoverageData.length ? draftCoverageData : [{ name: 'Missing', value: 3, color: chartColors.slate }]} centerLabel='channels' />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-brand-navy'><Icons.network className='h-5 w-5 text-brand-cornflower' /> Connector Evidence</CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalMetricBars data={connectorBars} />
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={itemVariants} className='grid gap-6 xl:grid-cols-[0.95fr_1.05fr]'>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-brand-navy'><Icons.lightbulb className='h-5 w-5 text-brand-cornflower' /> Business Value Summary</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='rounded-lg border border-gray-200 p-4'>
              <p className='text-xs font-semibold uppercase text-brand-muted'>Next best action</p>
              <p className='mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-brand-navy'>{formatPanelValue(nextBestAction)}</p>
            </div>
            <div className='rounded-lg border border-gray-200 p-4'>
              <p className='text-xs font-semibold uppercase text-brand-muted'>Metric source</p>
              <p className='mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-brand-navy'>{formatPanelValue(metricSource)}</p>
            </div>
            <div className='rounded-lg border border-gray-200 p-4'>
              <p className='text-xs font-semibold uppercase text-brand-muted'>Connector status discipline</p>
              <p className='mt-2 text-sm leading-relaxed text-brand-navy'>Teams: {normalized.teams.status}. SharePoint: {normalized.sharepoint.status}. HubSpot: {normalized.hubspot.status}.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-brand-navy'><Icons.brain className='h-5 w-5 text-brand-cornflower' /> Reasoning Trace / AI Insights</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className='max-h-96 overflow-auto rounded-lg bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-100'>
              {JSON.stringify({ ai_insights: normalized.aiInsights ?? 'Unavailable / not returned', reasoning_trace: reasoningTrace ?? 'Unavailable / not returned' }, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={itemVariants} className='grid gap-6 xl:grid-cols-3'>
        <DraftPreview title='LinkedIn draft' value={normalized.linkedinDraft} />
        <DraftPreview title='X draft' value={normalized.xDraft} />
        <DraftPreview title='Blog draft' value={normalized.blogDraft} />
      </motion.div>

      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-brand-navy'><Icons.fileText className='h-5 w-5 text-brand-cornflower' /> Raw Normalized Evidence</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className='max-h-80 overflow-auto rounded-lg bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-100'>{JSON.stringify(normalized, null, 2)}</pre>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
