'use client'

import { useMemo, useState } from 'react'
import type { ApexOptions } from 'apexcharts'
import Chart from '@/components/shared/Chart'
import Segment from '@/components/ui/Segment'
import Spinner from '@/components/ui/Spinner'
import { COLORS } from '@/constants/chart.constant'
import type { DemandPlanGrid } from '../../types'
import {
    computeDelta,
    deltaFromParts,
    deltaToneClass,
    formatDelta,
} from '../../utils/demandDelta'

type Props = {
    grid: DemandPlanGrid | null
    loading: boolean
}

type ChartMode = 'series' | 'total'

const fmt = (n: number) =>
    Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })

const BASIS_SHORT = {
    COMPARE: 'vs comparison',
    HISTORY: 'vs history',
    SYSTEM: 'vs system',
} as const

/**
 * Renders the server-built `grid.chart` block. Series, density (Top 5 + Other /
 * family) and KPIs are decided server-side; this only maps them to Apex.
 */
export default function DemandPlanChart({ grid, loading }: Props) {
    const [mode, setMode] = useState<ChartMode>('series')

    const model = useMemo(() => {
        if (!grid) return null
        const { chart, periods } = grid
        const history = mode === 'total' ? (chart.history ?? []) : []
        const offset = history.length
        const labels = [...history.map((p) => p.label), ...periods.map((p) => p.label)]
        const n = labels.length
        const lastFrozen = chart.freezePeriodIndexes.length
            ? offset + Math.max(...chart.freezePeriodIndexes)
            : -1
        const color = (i: number) => COLORS[i % COLORS.length]

        let series: ApexOptions['series']
        let colors: string[]
        let dash: number[]
        let widths: number[]
        let discrete: NonNullable<ApexOptions['markers']>['discrete'] = []
        let tooltipY: (
            val: number | null,
            opts: { seriesIndex: number; dataPointIndex: number },
        ) => string

        if (mode === 'series') {
            const main = chart.series.map((s) => ({
                name: s.label,
                type: 'line',
                data: s.values.map((y, x) => ({ x, y })),
            }))
            const compare = chart.meta.hasCompare
                ? chart.series.map((s) => ({
                      name: `${s.label} (compare)`,
                      type: 'line',
                      data: (s.compareValues ?? []).map((y, x) => ({ x, y })),
                  }))
                : []
            series = [...main, ...compare]
            colors = [
                ...chart.series.map((_, i) => color(i)),
                ...compare.map((_, i) => color(i)),
            ]
            dash = [...main.map(() => 0), ...compare.map(() => 6)]
            widths = [...main.map(() => 2.5), ...compare.map(() => 1.5)]
            discrete = chart.series.flatMap((s, si) =>
                s.adjusted.flatMap((adj, dp) =>
                    adj
                        ? [
                              {
                                  seriesIndex: si,
                                  dataPointIndex: dp,
                                  size: 5,
                                  fillColor: '#f59e0b',
                                  strokeColor: '#fff',
                              },
                          ]
                        : [],
                ),
            )
            const m = chart.series.length
            tooltipY = (val, { seriesIndex, dataPointIndex }) => {
                if (val == null) return '—'
                if (seriesIndex >= m) return `${fmt(val)} units`
                const s = chart.series[seriesIndex]
                const cmp = s.compareValues?.[dataPointIndex]
                const d = computeDelta(val, cmp)
                const parts = [`${fmt(val)} units`]
                if (d && cmp != null) {
                    parts.push(`compare ${fmt(cmp)} · ${formatDelta(d)}`)
                }
                if (s.adjusted[dataPointIndex]) parts.push('override')
                return parts.join(' · ')
            }
        } else {
            const h = history.length
            const compareTotals = chart.meta.hasCompare
                ? periods.map((_, i) =>
                      chart.series.reduce(
                          (sum, s) => sum + (s.compareValues?.[i] ?? 0),
                          0,
                      ),
                  )
                : null
            series = [
                {
                    name: 'Actual / final',
                    type: 'column',
                    data: [
                        ...history.map((p, x) => ({
                            x,
                            y: p.qty,
                            fillColor: '#9ca3af',
                        })),
                        ...chart.finalTotals.map((y, i) => ({
                            x: h + i,
                            y,
                            fillColor: color(0),
                        })),
                    ],
                },
                {
                    name: 'System forecast',
                    type: 'line',
                    data: chart.systemTotals.map((y, i) => ({ x: h + i, y })),
                },
                ...(compareTotals
                    ? [
                          {
                              name: 'Comparison',
                              type: 'line',
                              data: compareTotals.map((y, i) => ({ x: h + i, y })),
                          },
                      ]
                    : []),
            ]
            colors = [color(0), '#f59e0b', '#6b7280']
            dash = [0, 5, 2]
            widths = [0, 2, 2]
            tooltipY = (val, { seriesIndex, dataPointIndex }) => {
                if (val == null) return '—'
                if (seriesIndex === 0 && dataPointIndex < h) {
                    return `${fmt(val)} units (past sales)`
                }
                if (seriesIndex === 0) {
                    const i = dataPointIndex - h
                    const parts = [`${fmt(val)} units final`]
                    const vsSystem = computeDelta(val, chart.systemTotals[i])
                    if (vsSystem && vsSystem.direction !== 'flat') {
                        parts.push(`vs system ${formatDelta(vsSystem)}`)
                    }
                    const vsCompare = compareTotals
                        ? computeDelta(val, compareTotals[i])
                        : null
                    if (vsCompare) parts.push(`vs comparison ${formatDelta(vsCompare)}`)
                    return parts.join(' · ')
                }
                return `${fmt(val)} units`
            }
        }

        const options: ApexOptions = {
            chart: {
                zoom: { enabled: false },
                toolbar: { show: false },
                animations: { enabled: false },
            },
            colors,
            dataLabels: { enabled: false },
            stroke: { width: widths, dashArray: dash, curve: 'straight' },
            legend: { show: false },
            markers: { size: 0, hover: { size: 4 }, discrete },
            plotOptions: { bar: { columnWidth: '55%', borderRadius: 3 } },
            fill: { opacity: mode === 'total' ? [0.85, 1] : 1 },
            xaxis: {
                type: 'numeric',
                min: 0,
                max: Math.max(n - 1, 1),
                tickAmount: Math.max(n - 1, 1),
                labels: {
                    formatter: (v: string) => {
                        const i = Math.round(Number(v))
                        return labels[i] ?? ''
                    },
                },
                tooltip: { enabled: false },
            },
            yaxis: {
                min: 0,
                labels: { formatter: (v: number) => fmt(v) },
                title: { text: 'Demand qty' },
            },
            annotations: {
                xaxis:
                    lastFrozen >= 0
                        ? [
                              {
                                  x: offset > 0 ? offset - 0.5 : 0,
                                  x2: Math.min(lastFrozen + 0.5, n - 1),
                                  fillColor: '#9ca3af',
                                  opacity: 0.15,
                                  borderColor: 'transparent',
                                  label: {
                                      text: 'Freeze fence',
                                      orientation: 'horizontal',
                                      position: 'top',
                                      textAnchor: 'start',
                                      offsetX: 4,
                                      borderColor: 'transparent',
                                      style: {
                                          background: 'transparent',
                                          color: '#6b7280',
                                      },
                                  },
                              },
                          ]
                        : [],
            },
            tooltip: {
                shared: true,
                intersect: false,
                x: {
                    formatter: (v: number) => {
                        const i = Math.round(v)
                        if (i < offset) return `${labels[i] ?? ''} · actual`
                        const p = periods[i - offset]
                        if (!p) return ''
                        return p.frozen ? `${p.label} · frozen` : p.label
                    },
                },
                y: { formatter: tooltipY as never },
            },
        }
        return { options, series, chart }
    }, [grid, mode])

    if (!grid || !model) {
        return (
            <div className="flex h-[360px] items-center justify-center text-sm text-gray-400">
                {loading ? <Spinner size={32} /> : 'No data for this scope.'}
            </div>
        )
    }

    const { chart } = model
    const noteByMode: Record<string, string | null> = {
        TOP5_OTHER: `${chart.seriesCount} series in scope — showing Top 5 movers by |variance| ${BASIS_SHORT[chart.kpis.varianceBasis]} + Other.`,
        FAMILY:
            chart.meta.granularity === 'SKU'
                ? 'SKUs rolled up to product family (server-side).'
                : null,
        FULL: null,
    }
    const note = noteByMode[chart.densityMode]

    return (
        <div className="relative">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-gray-400">
                    {mode === 'series' ? (
                        <>
                            Solid = this version
                            {chart.meta.hasCompare ? ' · dashed = comparison' : ''} ·
                            shaded band = freeze fence · amber dot = override
                        </>
                    ) : (
                        <>
                            Grey = past sales · blue = final forecast · dashed amber =
                            system forecast
                            {chart.meta.hasCompare ? ' · dotted = comparison' : ''} ·
                            shaded band = freeze fence
                        </>
                    )}
                </p>
                <Segment
                    size="xs"
                    value={mode}
                    onChange={(v) => v && setMode(v as ChartMode)}
                >
                    <Segment.Item value="series">By series</Segment.Item>
                    <Segment.Item value="total">History + total</Segment.Item>
                </Segment>
            </div>
            {note && mode === 'series' ? (
                <p className="mb-2 text-xs font-medium text-amber-600">{note}</p>
            ) : null}
            <div className={loading ? 'opacity-60 transition-opacity' : ''}>
                <Chart
                    type="line"
                    height={360}
                    series={model.series}
                    customOptions={model.options}
                />
            </div>
            {mode === 'series' ? (
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                    {chart.series.map((s, i) => {
                        const d =
                            s.varianceAbs == null
                                ? null
                                : deltaFromParts(s.varianceAbs, s.variancePct)
                        return (
                            <div
                                key={s.key}
                                className="flex items-center gap-2 text-xs"
                                title={
                                    s.memberCount > 1
                                        ? `${s.memberCount} rows aggregated`
                                        : undefined
                                }
                            >
                                <span
                                    className="inline-block h-2.5 w-2.5 rounded-full"
                                    style={{
                                        backgroundColor: COLORS[i % COLORS.length],
                                    }}
                                />
                                <span className="font-medium text-gray-700 dark:text-gray-200">
                                    {s.label}
                                </span>
                                <span className="text-gray-400">
                                    {fmt(s.total)}
                                </span>
                                {d ? (
                                    <span
                                        className={`whitespace-nowrap ${deltaToneClass(d)}`}
                                        title={BASIS_SHORT[chart.kpis.varianceBasis]}
                                    >
                                        {formatDelta(d)}
                                    </span>
                                ) : null}
                            </div>
                        )
                    })}
                </div>
            ) : null}
        </div>
    )
}
