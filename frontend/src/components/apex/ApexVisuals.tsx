'use client'

import { useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const palette = {
  navy: '#141A42',
  cornflower: '#5B8DEF',
  purple: '#7C5CE7',
  emerald: '#10B981',
  amber: '#F59E0B',
  rose: '#EF4444',
  slate: '#94A3B8',
}

function useMounted() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return mounted
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; payload?: Record<string, unknown> }>
  label?: string
}) {
  if (!active || !payload?.length) return null

  return (
    <div className='rounded-lg border border-white/70 bg-white/95 p-3 shadow-lg backdrop-blur-sm'>
      {label && <p className='mb-1 text-xs font-semibold text-brand-navy'>{label}</p>}
      {payload.map((entry) => (
        <div key={entry.name} className='flex items-center justify-between gap-4 text-xs text-brand-muted'>
          <span>{entry.name}</span>
          <span className='font-semibold text-brand-navy'>{entry.value}</span>
        </div>
      ))}
    </div>
  )
}

export function DistributionDonut({
  data,
  centerLabel,
}: {
  data: Array<{ name: string; value: number; color?: string }>
  centerLabel: string
}) {
  const mounted = useMounted()
  const total = data.reduce((sum, item) => sum + item.value, 0)

  if (!mounted) {
    return <div className='h-56 w-full rounded-lg bg-slate-100/70' />
  }

  return (
    <div className='relative h-56 w-full'>
      <ResponsiveContainer width='100%' height='100%'>
        <PieChart>
          <Pie data={data} dataKey='value' innerRadius={64} outerRadius={88} paddingAngle={3}>
            {data.map((item) => (
              <Cell key={item.name} fill={item.color ?? palette.cornflower} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className='pointer-events-none absolute inset-0 flex flex-col items-center justify-center'>
        <p className='text-3xl font-bold text-brand-navy'>{total}</p>
        <p className='text-xs font-semibold uppercase text-brand-muted'>{centerLabel}</p>
      </div>
    </div>
  )
}

export function HorizontalMetricBars({
  data,
}: {
  data: Array<{ name: string; value: number; fill?: string }>
}) {
  const mounted = useMounted()

  if (!mounted) {
    return <div className='h-64 w-full rounded-lg bg-slate-100/70' />
  }

  return (
    <div className='h-64 w-full'>
      <ResponsiveContainer width='100%' height='100%'>
        <BarChart data={data} layout='vertical' margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray='3 3' horizontal={false} stroke='rgba(20, 26, 66, 0.08)' />
          <XAxis type='number' allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#7B8AB8', fontSize: 11 }} />
          <YAxis
            type='category'
            dataKey='name'
            width={92}
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#141A42', fontSize: 11 }}
          />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey='value' radius={[0, 8, 8, 0]}>
            {data.map((item) => (
              <Cell key={item.name} fill={item.fill ?? palette.cornflower} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function ReadinessGauge({
  value,
  label,
}: {
  value: number | null
  label: string
}) {
  const mounted = useMounted()
  const safeValue = value ?? 0
  const color = safeValue >= 90 ? palette.emerald : safeValue >= 70 ? palette.cornflower : safeValue > 0 ? palette.amber : palette.slate
  const data = [{ name: 'readiness', value: safeValue, fill: color }]

  if (!mounted) {
    return <div className='h-56 w-full rounded-lg bg-slate-100/70' />
  }

  return (
    <div className='relative h-56 w-full'>
      <ResponsiveContainer width='100%' height='100%'>
        <RadialBarChart
          data={data}
          innerRadius='72%'
          outerRadius='100%'
          startAngle={210}
          endAngle={-30}
        >
          <RadialBar dataKey='value' cornerRadius={16} background={{ fill: '#E8EBF2' }} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className='pointer-events-none absolute inset-0 flex flex-col items-center justify-center'>
        <p className='text-4xl font-bold text-brand-navy'>{value === null ? '--' : value}</p>
        <p className='text-xs font-semibold uppercase text-brand-muted'>{label}</p>
      </div>
    </div>
  )
}

export const chartColors = palette
