'use client'

import { useRef, useEffect, useCallback, useMemo } from 'react'
import {
    apexLineChartDefaultOption,
    apexBarChartDefaultOption,
    apexAreaChartDefaultOption,
    apexDonutChartDefaultOption,
    apexRadarChartDefultOption,
} from '@/configs/chart.config'
import { DIR_RTL } from '@/constants/theme.constant'
import dynamic from 'next/dynamic'
import type { ApexOptions } from 'apexcharts'
import type { Direction } from '@/@types/theme'
import type { ReactNode, Ref } from 'react'

const notDonut = ['line', 'bar', 'area']

type ChartType = 'line' | 'bar' | 'area' | 'donut' | 'radar'

export interface ChartProps {
    id?: string
    series?: ApexOptions['series']
    width?: string | number
    height?: string | number
    /* eslint-disable @typescript-eslint/no-explicit-any */
    xAxis?: any
    customOptions?: ApexOptions
    type?: ChartType
    direction?: Direction
    donutTitle?: string | ReactNode
    donutText?: string | ReactNode
    className?: string
    ref?: Ref<ChartRef>
}

export type ChartRef = {
    rerender: () => void
}

const ApexChart = dynamic(
    () => import('react-apexcharts').then((mod) => mod.default),
    {
        ssr: false,
    },
)

const Chart = (props: ChartProps) => {
    const {
        series = [],
        width = '100%',
        height = 300,
        xAxis,
        customOptions,
        type = 'line',
        direction,
        donutTitle,
        donutText,
        className,
        ...rest
    } = props

    const chartRef = useRef<HTMLDivElement>(null)

    const chartDefaultOption = useMemo(() => {
        switch (type) {
            case 'line':
                return apexLineChartDefaultOption
            case 'bar':
                return apexBarChartDefaultOption
            case 'area':
                return apexAreaChartDefaultOption
            case 'donut':
                return apexDonutChartDefaultOption
            case 'radar':
                return apexRadarChartDefultOption
            default:
                return apexLineChartDefaultOption
        }
    }, [type])

    let options = JSON.parse(JSON.stringify(chartDefaultOption))

    const setLegendOffset = useCallback(() => {
        const isMobile = window.innerWidth < 768
        if (chartRef.current) {
            const lengend = chartRef.current.querySelectorAll<HTMLDivElement>(
                'div.apexcharts-legend',
            )[0]
            if (direction === DIR_RTL && lengend?.style) {
                lengend.style.right = 'auto'
                lengend.style.left = '0'
            }
            if (isMobile && lengend?.style) {
                lengend.style.position = 'relative'
                lengend.style.top = '0'
                lengend.style.justifyContent = 'start'
                lengend.style.padding = '0'
            }
        }
    }, [direction])

    useEffect(() => {
        if (
            typeof window !== 'undefined' &&
            notDonut.includes(type as ChartType)
        ) {
            setLegendOffset()
        }
    }, [type, setLegendOffset])

    if (notDonut.includes(type as ChartType)) {
        options.xaxis.categories = xAxis
    }

    if (customOptions) {
        options = { ...options, ...customOptions }
    }

    if (type === 'donut') {
        if (donutTitle) {
            options.plotOptions.pie.donut.labels.total.label = donutTitle
        }
        if (donutText) {
            options.plotOptions.pie.donut.labels.total.formatter = () =>
                donutText
        }
    }

    return (
        <div
            ref={chartRef}
            style={direction === DIR_RTL ? { direction: 'ltr' } : {}}
        >
            <ApexChart
                options={options}
                type={type}
                series={series}
                width={width}
                height={height}
                className={className}
                {...rest}
            />
        </div>
    )
}

export default Chart
