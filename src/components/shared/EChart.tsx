'use client'

import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import {
    BarChart,
    LineChart,
    PieChart,
    RadarChart,
} from 'echarts/charts'
import {
    GridComponent,
    TooltipComponent,
    LegendComponent,
    DatasetComponent,
    PolarComponent,
    RadarComponent,
    TitleComponent,
    GraphicComponent,
} from 'echarts/components'
import { LabelLayout, UniversalTransition } from 'echarts/features'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsCoreOption, EChartsType } from 'echarts/core'
import { COLORS } from '@/constants/chart.constant'
import classNames from '@/utils/classNames'

echarts.use([
    BarChart,
    LineChart,
    PieChart,
    RadarChart,
    GridComponent,
    TooltipComponent,
    LegendComponent,
    DatasetComponent,
    PolarComponent,
    RadarComponent,
    TitleComponent,
    GraphicComponent,
    LabelLayout,
    UniversalTransition,
    CanvasRenderer,
])

export type EChartProps = {
    option: EChartsCoreOption
    height?: number | string
    width?: string | number
    className?: string
    /** Re-init when this changes (e.g. theme) */
    themeKey?: string
}

/**
 * Shared Apache ECharts wrapper for professional analytic dashboards.
 * Prefer this for combo / radar / rich interactive charts; keep Apex `Chart` for simple ECME demos.
 */
const EChart = ({
    option,
    height = 300,
    width = '100%',
    className,
    themeKey = 'light',
}: EChartProps) => {
    const elRef = useRef<HTMLDivElement>(null)
    const chartRef = useRef<EChartsType | null>(null)

    useEffect(() => {
        if (!elRef.current) return

        const el = elRef.current
        const chart = echarts.init(el, undefined, {
            renderer: 'canvas',
        })
        chartRef.current = chart

        const resize = () => {
            if (!chart.isDisposed()) chart.resize()
        }
        window.addEventListener('resize', resize)

        // Grid / card width changes (not just window) need ResizeObserver
        const ro =
            typeof ResizeObserver !== 'undefined'
                ? new ResizeObserver(() => resize())
                : null
        ro?.observe(el)

        return () => {
            window.removeEventListener('resize', resize)
            ro?.disconnect()
            chart.dispose()
            chartRef.current = null
        }
    }, [themeKey])

    useEffect(() => {
        const chart = chartRef.current
        if (!chart) return
        chart.setOption(
            {
                color: COLORS,
                textStyle: {
                    fontFamily: 'inherit',
                },
                ...option,
            },
            { notMerge: true },
        )
        // Ensure layout matches current container after option swap
        requestAnimationFrame(() => {
            if (!chart.isDisposed()) chart.resize()
        })
    }, [option])

    return (
        <div
            ref={elRef}
            className={classNames('w-full min-w-0', className)}
            style={{ height, width }}
        />
    )
}

export default EChart

/** Reusable option builders for MM analytics */
export function buildMovementComboOption(args: {
    categories: string[]
    inbound: number[]
    outbound: number[]
    focus?: 'all' | 'inbound' | 'outbound'
}): EChartsCoreOption {
    const { categories, inbound, outbound, focus = 'all' } = args
    const series: any[] = []

    if (focus === 'all' || focus === 'inbound') {
        series.push({
            name: 'Inbound',
            type: 'bar',
            data: inbound,
            barMaxWidth: 28,
            itemStyle: { borderRadius: [6, 6, 0, 0], color: COLORS[1] },
            emphasis: { focus: 'series' },
        })
    }
    if (focus === 'all' || focus === 'outbound') {
        series.push({
            name: 'Outbound',
            type: focus === 'all' ? 'line' : 'bar',
            data: outbound,
            smooth: true,
            symbol: 'circle',
            symbolSize: 7,
            lineStyle: { width: 3, color: COLORS[0] },
            itemStyle: { color: COLORS[0], borderRadius: [6, 6, 0, 0] },
            areaStyle:
                focus === 'all'
                    ? { color: 'rgba(42,133,255,0.14)' }
                    : undefined,
            emphasis: { focus: 'series' },
        })
    }

    return {
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: focus === 'all' ? 'cross' : 'shadow' },
        },
        legend: {
            type: 'scroll',
            top: 0,
            right: 0,
            icon: 'circle',
            itemWidth: 10,
            itemHeight: 10,
            textStyle: { color: '#6b7280', fontSize: 11 },
        },
        grid: { left: 8, right: 16, top: 40, bottom: 8, containLabel: true },
        xAxis: {
            type: 'category',
            data: categories,
            axisTick: { show: false },
            axisLine: { lineStyle: { color: '#e5e7eb' } },
            axisLabel: {
                color: '#9ca3af',
                hideOverlap: true,
                overflow: 'truncate',
                width: 56,
            },
        },
        yAxis: {
            type: 'value',
            splitLine: { lineStyle: { type: 'dashed', color: '#f3f4f6' } },
            axisLabel: { color: '#9ca3af' },
        },
        series,
    }
}

export function buildDonutOption(args: {
    labels: string[]
    values: number[]
    title?: string
    centerText?: string
    /** Prefer false when a custom HTML breakdown is shown under the chart */
    showLegend?: boolean
}): EChartsCoreOption {
    const total = args.values.reduce((a, b) => a + b, 0)
    const showLegend = args.showLegend ?? true
    const centerY = showLegend ? '42%' : '50%'
    return {
        tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
        legend: showLegend
            ? {
                  type: 'scroll',
                  orient: 'horizontal',
                  bottom: 0,
                  left: 'center',
                  width: '90%',
                  icon: 'circle',
                  itemWidth: 8,
                  itemHeight: 8,
                  itemGap: 12,
                  pageIconSize: 10,
                  textStyle: { color: '#6b7280', fontSize: 11 },
              }
            : { show: false },
        series: [
            {
                type: 'pie',
                radius: showLegend ? ['52%', '72%'] : ['58%', '78%'],
                center: ['50%', centerY],
                avoidLabelOverlap: true,
                itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
                label: { show: false },
                emphasis: {
                    label: { show: true, fontSize: 13, fontWeight: 600 },
                    scaleSize: 6,
                },
                data: args.labels.map((name, i) => ({
                    name,
                    value: args.values[i] ?? 0,
                })),
            },
        ],
        graphic: [
            {
                type: 'text',
                left: 'center',
                top: showLegend ? '34%' : '42%',
                style: {
                    text: args.title ?? 'Total',
                    fill: '#9ca3af',
                    fontSize: 12,
                    textAlign: 'center',
                },
            },
            {
                type: 'text',
                left: 'center',
                top: showLegend ? '42%' : '50%',
                style: {
                    text: args.centerText ?? String(total),
                    fill: '#111827',
                    fontSize: 22,
                    fontWeight: 700,
                    textAlign: 'center',
                },
            },
        ],
    }
}

export function buildRadarOption(args: {
    indicators: { name: string; max?: number }[]
    values: number[]
    seriesName?: string
}): EChartsCoreOption {
    return {
        tooltip: { trigger: 'item' },
        radar: {
            indicator: args.indicators.map((i) => ({
                name: i.name,
                max: i.max ?? 100,
            })),
            radius: '58%',
            center: ['50%', '52%'],
            splitNumber: 4,
            axisName: {
                color: '#6b7280',
                fontSize: 10,
                overflow: 'truncate',
                width: 72,
            },
            splitLine: { lineStyle: { color: '#e5e7eb' } },
            splitArea: {
                areaStyle: {
                    color: ['rgba(42,133,255,0.04)', 'rgba(42,133,255,0.01)'],
                },
            },
            axisLine: { lineStyle: { color: '#e5e7eb' } },
        },
        series: [
            {
                name: args.seriesName ?? 'Health',
                type: 'radar',
                data: [
                    {
                        value: args.values,
                        name: args.seriesName ?? 'Health',
                        areaStyle: { color: 'rgba(42,133,255,0.22)' },
                        lineStyle: { width: 2, color: COLORS[0] },
                        itemStyle: { color: COLORS[0] },
                        symbol: 'circle',
                        symbolSize: 6,
                    },
                ],
            },
        ],
    }
}

export function buildBarOption(args: {
    categories: string[]
    series: { name: string; data: number[]; color?: string }[]
    horizontal?: boolean
}): EChartsCoreOption {
    const multiSeries = args.series.length > 1
    const catCount = args.categories.length
    const rotate = !args.horizontal && catCount > 6 ? 35 : 0
    return {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: multiSeries
            ? {
                  type: 'scroll',
                  top: 0,
                  right: 0,
                  icon: 'circle',
                  itemWidth: 10,
                  itemHeight: 10,
                  textStyle: { color: '#6b7280', fontSize: 11 },
              }
            : { show: false },
        grid: {
            left: args.horizontal ? 96 : 48,
            right: 16,
            top: multiSeries ? 36 : 16,
            bottom: rotate ? 56 : 28,
            containLabel: true,
        },
        xAxis: args.horizontal
            ? {
                  type: 'value',
                  splitLine: { lineStyle: { type: 'dashed', color: '#f3f4f6' } },
                  axisLabel: { color: '#9ca3af' },
              }
            : {
                  type: 'category',
                  data: args.categories,
                  axisTick: { show: false },
                  axisLine: { lineStyle: { color: '#e5e7eb' } },
                  axisLabel: {
                      color: '#9ca3af',
                      rotate,
                      interval: 0,
                      hideOverlap: true,
                      overflow: 'truncate',
                      width: rotate ? 64 : 80,
                  },
              },
        yAxis: args.horizontal
            ? {
                  type: 'category',
                  data: args.categories,
                  axisTick: { show: false },
                  axisLine: { show: false },
                  axisLabel: {
                      color: '#6b7280',
                      overflow: 'truncate',
                      width: 88,
                      ellipsis: '…',
                  },
              }
            : {
                  type: 'value',
                  splitLine: { lineStyle: { type: 'dashed', color: '#f3f4f6' } },
                  axisLabel: { color: '#9ca3af' },
              },
        series: args.series.map((s, i) => ({
            name: s.name,
            type: 'bar',
            data: s.data,
            barMaxWidth: 32,
            itemStyle: {
                borderRadius: args.horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0],
                color: s.color ?? COLORS[i % COLORS.length],
            },
            emphasis: { focus: 'series' },
        })),
    }
}
