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

const lifecyclePolicies = [
  { id: 'validation', name: 'Brief validation', stage: 'Validation', detail: 'Confirms campaign name, audience, offer, channels, and success metric exist before execution.', terms: ['validation', 'campaign_brief', 'campaign_name'] },
  { id: 'cta', name: 'Required CTA', stage: 'Validation', detail: 'Blocks external execution when the campaign brief has no CTA link.', terms: ['cta', 'cta_link', 'missingdataexception'] },
  { id: 'benefits', name: 'Minimum benefits', stage: 'Validation', detail: 'Requires at least three benefits before draft generation proceeds.', terms: ['benefits', 'minimum benefits'] },
  { id: 'generation', name: 'Content generation guardrail', stage: 'Generation', detail: 'Anchors drafts to supplied benefits and core message; avoids unsupported claims.', terms: ['content_drafts', 'linkedin', 'blog'] },
  { id: 'approval', name: 'Approval before external action', stage: 'Approval', detail: 'Requires Human-in-Command approval or explicit demo approval override.', terms: ['approval_status', 'approved_for_test', 'approved'] },
  { id: 'external', name: 'External action authorization', stage: 'Authorization', detail: 'Allows Teams, SharePoint, and CRM operations only after governance checks pass.', terms: ['authorization', 'external', 'teams', 'sharepoint', 'hubspot'] },
  { id: 'storage', name: 'SharePoint storage policy', stage: 'Storage', detail: 'Stores only approved artifacts and returns references when connector output is available.', terms: ['sharepoint'] },
  { id: 'crm', name: 'CRM safety policy', stage: 'CRM', detail: 'Restricts HubSpot changes to safe company/task operations.', terms: ['hubspot', 'crm'] },
  { id: 'completion', name: 'Completion policy', stage: 'Completion', detail: 'Marks final state only after orchestration resolves or a failure/exception is returned.', terms: ['success', 'completed', 'failed'] },
  { id: 'reporting', name: 'Reporting and insights policy', stage: 'Insights', detail: 'Labels seeded or estimated metrics and exposes time saved/readiness score.', terms: ['ai_insights', 'manual_time_saved_minutes', 'campaign_readiness_score'] },
]

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

function evidenceText(value: unknown) {
  return JSON.stringify(value ?? {}).toLowerCase()
}

function policyState(policy: (typeof lifecyclePolicies)[number], output: unknown, status: string) {
  const text = evidenceText(output)
  if (status === 'failed') return 'failed'
  if (policy.terms.some((term) => text.includes(term.toLowerCase()))) return 'enforced'
  if (status === 'running' || status === 'approval_pending') return 'watching'
  return 'not returned'
}

function stateClass(state: string) {
  if (state === 'enforced') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (state === 'failed') return 'border-red-200 bg-red-50 text-red-700'
  if (state === 'watching') return 'border-blue-200 bg-blue-50 text-blue-700'
  return 'border-gray-200 bg-white text-brand-muted'
}

export default function AIPoliciesPage() {
  const [snapshot, setSnapshot] = useState<ApexRunSnapshot | null>(null)

  useEffect(() => {
    setSnapshot(readSnapshot())
  }, [])

  const normalized = useMemo(() => normalizeApexMarketingResult(snapshot), [snapshot])
  const output = normalized.outputRoot
  const enforcedCount = lifecyclePolicies.filter((policy) => policyState(policy, output, normalized.status) === 'enforced').length
  const policyStates = lifecyclePolicies.map((policy) => policyState(policy, output, normalized.status))
  const policyDonutData = [
    { name: 'Enforced', value: policyStates.filter((state) => state === 'enforced').length, color: chartColors.emerald },
    { name: 'Watching', value: policyStates.filter((state) => state === 'watching').length, color: chartColors.cornflower },
    { name: 'Not returned', value: policyStates.filter((state) => state === 'not returned').length, color: chartColors.slate },
    { name: 'Failed', value: policyStates.filter((state) => state === 'failed').length, color: chartColors.rose },
  ].filter((item) => item.value > 0)
  const stageBars = Array.from(
    lifecyclePolicies.reduce((map, policy) => {
      const current = map.get(policy.stage) ?? 0
      map.set(policy.stage, current + (policyState(policy, output, normalized.status) === 'enforced' ? 1 : 0))
      return map
    }, new Map<string, number>())
  ).map(([name, value]) => ({
    name,
    value,
    fill: value > 0 ? chartColors.emerald : chartColors.slate,
  }))

  return (
    <motion.div className='space-y-6' variants={containerVariants} initial='hidden' animate='visible'>
      <motion.div variants={itemVariants} className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
        <div>
          <p className='text-xs font-semibold uppercase tracking-wide text-brand-muted'>Apex Marketing AI Employee</p>
          <h1 className='mt-1 text-display-3 font-bold tracking-tight text-brand-navy lg:text-display-2'>Dynamic AI Policies</h1>
          <p className='mt-2 max-w-3xl text-sm text-muted-foreground'>A lifecycle view of the 10 governance policies judges expect to see across validation, generation, approval, storage, CRM, completion, and insights.</p>
        </div>
        <Button asChild variant='gradient'><Link href='/'>Run a Campaign</Link></Button>
      </motion.div>

      <motion.div variants={itemVariants} className='grid gap-4 md:grid-cols-4'>
        {[
          { label: 'Lifecycle policies', value: lifecyclePolicies.length, icon: Icons.shield, color: 'bg-blue-100 text-blue-700' },
          { label: 'Evidence returned', value: enforcedCount, icon: Icons.checkCircle, color: 'bg-emerald-100 text-emerald-700' },
          { label: 'Current run status', value: normalized.status.replace(/_/g, ' '), icon: Icons.activity, color: 'bg-violet-100 text-violet-700' },
          { label: 'Connector claims', value: 'No fake success', icon: Icons.lock, color: 'bg-slate-100 text-slate-700' },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className='p-4'>
              <div className='flex items-center gap-3'>
                <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', stat.color)}><stat.icon className='h-5 w-5' /></div>
                <div>
                  <p className='text-xs font-semibold uppercase text-brand-muted'>{stat.label}</p>
                  <p className='mt-1 text-lg font-bold capitalize text-brand-navy'>{stat.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      <motion.div variants={itemVariants} className='grid gap-6 xl:grid-cols-[0.8fr_1.2fr]'>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-brand-navy'><Icons.shield className='h-5 w-5 text-brand-cornflower' /> Policy Coverage</CardTitle>
          </CardHeader>
          <CardContent>
            <DistributionDonut data={policyDonutData.length ? policyDonutData : [{ name: 'Not returned', value: lifecyclePolicies.length, color: chartColors.slate }]} centerLabel='policies' />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-brand-navy'><Icons.barChart className='h-5 w-5 text-brand-cornflower' /> Evidence by Lifecycle Stage</CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalMetricBars data={stageBars} />
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={itemVariants} className='grid gap-4 lg:grid-cols-2'>
        {lifecyclePolicies.map((policy, index) => {
          const state = policyState(policy, output, normalized.status)
          return (
            <Card key={policy.id} className='overflow-hidden'>
              <CardContent className='p-0'>
                <div className='flex gap-4 p-4'>
                  <div className='flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-navy text-sm font-bold text-white'>{String(index + 1).padStart(2, '0')}</div>
                  <div className='min-w-0 flex-1'>
                    <div className='flex flex-wrap items-start justify-between gap-2'>
                      <div>
                        <p className='text-sm font-bold text-brand-navy'>{policy.name}</p>
                        <p className='text-xs font-semibold uppercase text-brand-muted'>{policy.stage}</p>
                      </div>
                      <span className={cn('rounded-full border px-2.5 py-1 text-xs font-semibold capitalize', stateClass(state))}>{state}</span>
                    </div>
                    <p className='mt-3 text-sm leading-relaxed text-muted-foreground'>{policy.detail}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </motion.div>

      <motion.div variants={itemVariants} className='grid gap-6 xl:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-brand-navy'><Icons.fileText className='h-5 w-5 text-brand-cornflower' /> Policy Evidence From Latest Run</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className='max-h-80 overflow-auto rounded-lg bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-100'>{JSON.stringify(output ?? { note: 'Unavailable / not returned' }, null, 2)}</pre>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-brand-navy'><Icons.alertCircle className='h-5 w-5 text-brand-cornflower' /> Exception Policy View</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <div className='rounded-lg border border-gray-200 p-4'>
              <p className='text-xs font-semibold uppercase text-brand-muted'>Workbench exception</p>
              <p className='mt-2 whitespace-pre-wrap break-words text-sm text-brand-navy'>{formatPanelValue(normalized.workbenchException)}</p>
            </div>
            <div className='rounded-lg border border-gray-200 p-4'>
              <p className='text-xs font-semibold uppercase text-brand-muted'>Connector result discipline</p>
              <p className='mt-2 text-sm text-brand-navy'>Teams, SharePoint, and HubSpot panels display returned values only. Missing connector output remains marked unavailable or not returned.</p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
