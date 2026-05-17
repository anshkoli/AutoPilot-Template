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
} from '@/components/apex/ApexVisuals'
import { type ApexRunSnapshot, listApexReviews } from '@/lib/apex-marketing-api'
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

function readJson<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function statusClass(status: string) {
  if (status === 'completed') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === 'failed') return 'border-red-200 bg-red-50 text-red-700'
  if (status === 'paused_needs_human_input') return 'border-amber-200 bg-amber-50 text-amber-800'
  if (status === 'approval_pending' || status === 'running') return 'border-blue-200 bg-blue-50 text-blue-700'
  return 'border-gray-200 bg-gray-50 text-brand-muted'
}

function JsonPanel({ value }: { value: unknown }) {
  return (
    <pre className='max-h-72 overflow-auto rounded-lg bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-100'>
      {JSON.stringify(value ?? { note: 'Unavailable / not returned' }, null, 2)}
    </pre>
  )
}

function queueCount(value: unknown): number {
  if (Array.isArray(value)) return value.length
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (Array.isArray(record.items)) return record.items.length
    if (Array.isArray(record.data)) return record.data.length
  }
  return 0
}

export default function WorkbenchPage() {
  const [snapshot, setSnapshot] = useState<ApexRunSnapshot | null>(null)
  const [reviewQueue, setReviewQueue] = useState<unknown>(null)
  const [reviewDetail, setReviewDetail] = useState<unknown>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSnapshot(readJson<ApexRunSnapshot>('apexMarketing:lastSnapshot'))
    setReviewQueue(readJson<unknown>('apexMarketing:lastReviewQueue'))
    setReviewDetail(readJson<unknown>('apexMarketing:lastReviewDetail'))
  }, [])

  const normalized = useMemo(() => normalizeApexMarketingResult(snapshot), [snapshot])
  const isException = normalized.status === 'paused_needs_human_input' || Boolean(normalized.workbenchException)
  const isApproval = normalized.status === 'approval_pending' || normalized.approvalStatus !== 'Unavailable / not returned'
  const pendingReviewCount = queueCount(reviewQueue)
  const workbenchChartData = [
    { name: 'Exception', value: isException ? 1 : 0, color: chartColors.amber },
    { name: 'Approval', value: isApproval ? 1 : 0, color: chartColors.cornflower },
    { name: 'Bypass', value: normalized.approvalBypassUsed ? 1 : 0, color: chartColors.purple },
  ].filter((item) => item.value > 0)
  const reviewBars = [
    { name: 'Pending forms', value: pendingReviewCount, fill: chartColors.cornflower },
    { name: 'Exception active', value: isException ? 1 : 0, fill: chartColors.amber },
    { name: 'Approval active', value: isApproval ? 1 : 0, fill: chartColors.emerald },
  ]

  const refreshReviews = async () => {
    setIsRefreshing(true)
    setError(null)
    try {
      const response = await listApexReviews()
      setReviewQueue(response.raw)
      window.localStorage.setItem('apexMarketing:lastReviewQueue', JSON.stringify(response.raw))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to refresh Supervity review forms')
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <motion.div className='space-y-6' variants={containerVariants} initial='hidden' animate='visible'>
      <motion.div variants={itemVariants} className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
        <div>
          <p className='text-xs font-semibold uppercase tracking-wide text-brand-muted'>Apex Marketing AI Employee</p>
          <h1 className='mt-1 text-display-3 font-bold tracking-tight text-brand-navy lg:text-display-2'>Workbench Control Room</h1>
          <p className='mt-2 max-w-3xl text-sm text-muted-foreground'>Human-in-Command exception routing, approval state, correction payloads, and returned Supervity review evidence.</p>
        </div>
        <div className={cn('inline-flex items-center rounded-full border px-4 py-2 text-sm font-semibold capitalize', statusClass(normalized.status))}>
          {normalized.status.replace(/_/g, ' ')}
        </div>
      </motion.div>

      {error && <motion.div variants={itemVariants} className='rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700'>{error}</motion.div>}

      <motion.div variants={itemVariants} className='grid gap-4 md:grid-cols-4'>
        {[
          { label: 'Exception route', value: isException ? 'Active / returned' : 'Unavailable / not returned', icon: Icons.alertTriangle, tone: isException ? 'amber' : 'slate' },
          { label: 'Approval state', value: normalized.approvalStatus, icon: Icons.checkCircle, tone: isApproval ? 'emerald' : 'slate' },
          { label: 'Reviewer feedback', value: normalized.reviewerFeedback, icon: Icons.messageSquare, tone: 'blue' },
          { label: 'Bypass used', value: normalized.approvalBypassUsed === null ? 'Unavailable / not returned' : String(normalized.approvalBypassUsed), icon: Icons.shield, tone: normalized.approvalBypassUsed ? 'amber' : 'slate' },
        ].map((item) => (
          <Card key={item.label} className='overflow-hidden'>
            <CardContent className='p-4'>
              <div className='flex items-start gap-3'>
                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', item.tone === 'emerald' && 'bg-emerald-100 text-emerald-700', item.tone === 'amber' && 'bg-amber-100 text-amber-700', item.tone === 'blue' && 'bg-blue-100 text-blue-700', item.tone === 'slate' && 'bg-slate-100 text-slate-600')}>
                  <item.icon className='h-5 w-5' />
                </div>
                <div className='min-w-0'>
                  <p className='text-xs font-semibold uppercase text-brand-muted'>{item.label}</p>
                  <p className='mt-1 break-words text-sm font-semibold text-brand-navy'>{item.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      <motion.div variants={itemVariants} className='grid gap-6 xl:grid-cols-[0.8fr_1.2fr]'>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-brand-navy'><Icons.workbench className='h-5 w-5 text-brand-cornflower' /> Human-in-Command Mix</CardTitle>
          </CardHeader>
          <CardContent>
            <DistributionDonut
              data={workbenchChartData.length ? workbenchChartData : [{ name: 'Idle', value: 1, color: chartColors.slate }]}
              centerLabel='signals'
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-brand-navy'><Icons.barChart className='h-5 w-5 text-brand-cornflower' /> Review Queue Shape</CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalMetricBars data={reviewBars} />
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={itemVariants} className='grid gap-6 xl:grid-cols-[1.1fr_0.9fr]'>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-brand-navy'><Icons.workbench className='h-5 w-5 text-brand-cornflower' /> Workbench / Exception Detail</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='rounded-lg border border-gray-200 bg-white p-4'>
              <p className='text-xs font-semibold uppercase text-brand-muted'>Workbench exception</p>
              <p className='mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-brand-navy'>{formatPanelValue(normalized.workbenchException)}</p>
            </div>
            <div className='rounded-lg border border-gray-200 bg-white p-4'>
              <p className='text-xs font-semibold uppercase text-brand-muted'>Processed correction / request payload</p>
              <p className='mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-brand-navy'>{formatPanelValue(normalized.processedRequestPayload)}</p>
            </div>
            <div className='flex flex-wrap gap-3'>
              <Button variant='gradient' onClick={refreshReviews} disabled={isRefreshing}>{isRefreshing ? <Icons.loader className='mr-2 h-4 w-4 animate-spin' /> : <Icons.refresh className='mr-2 h-4 w-4' />}Refresh Review Queue</Button>
              <Button asChild variant='outline'><Link href='/'>Return to Command Center</Link></Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-brand-navy'><Icons.inbox className='h-5 w-5 text-brand-cornflower' /> Supervity Review Evidence</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div>
              <p className='mb-2 text-xs font-semibold uppercase text-brand-muted'>Latest review queue</p>
              <JsonPanel value={reviewQueue} />
            </div>
            <div>
              <p className='mb-2 text-xs font-semibold uppercase text-brand-muted'>Opened form detail</p>
              <JsonPanel value={reviewDetail} />
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
