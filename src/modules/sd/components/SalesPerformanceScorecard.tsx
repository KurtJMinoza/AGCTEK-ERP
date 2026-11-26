'use client'

import { useEffect, useState, type ReactNode } from 'react'
import {
    HiOutlineAdjustments,
    HiOutlineCalendar,
    HiOutlineCash,
    HiOutlineCreditCard,
    HiOutlineLocationMarker,
    HiOutlineTrendingUp,
} from 'react-icons/hi'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Chart from '@/components/shared/Chart'
import StatusBadge, { type StatusTone } from '@/components/shared/StatusBadge'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Progress from '@/components/ui/Progress'
import Skeleton from '@/components/ui/Skeleton'
import Tag from '@/components/ui/Tag'
import { COLOR_1, COLOR_4, COLOR_7 } from '@/constants/chart.constant'
import useResourceAccess from '@/utils/hooks/useResourceAccess'
import {
    fetchSalesPerformance,
    type SalesAnalyticsChannel,
    type SalesLocationKind,
    type SalesPerformance,
    type SalesPerformanceLocation,
    type SalesPerformanceWindow,
} from '../services/salesAnalyticsService'
import { formatSdMoney } from './SdDataTableCells'
import { EmptyState, SectionTitle } from './SalesAnalysisWidgets'
import SalesTargetsDialog from './SalesTargetsDialog'

const compactPhp = (amount: number) =>
    `₱${new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 1 }).format(amount)}`

const formatPercent = (value: number) =>
    `${value.toLocaleString('en-PH', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`

/** Staggered fade-in used by the redesigned MM / SD screens (inline delay so it always applies). */
const ENTER_CLASS = 'h-full animate-mm-row-in motion-reduce:animate-none'
const enterStyle = (index: number) => ({
    animationDelay: `${Math.min(index, 10) * 55}ms`,
})

type Level = 'good' | 'warn' | 'bad' | 'none'

const LEVEL_TONE: Record<Level, StatusTone> = {
    good: 'success',
    warn: 'warning',
    bad: 'danger',
    none: 'default',
}

const LEVEL_BAR: Record<Level, string> = {
    good: 'bg-emerald-500',
    warn: 'bg-amber-500',
    bad: 'bg-red-500',
    none: 'bg-gray-300 dark:bg-gray-600',
}

/** Attainment against a target or quota: under half is behind, 100% or more is met. */
const attainmentLevel = (percent: number | null): Level =>
    percent === null
        ? 'none'
        : percent >= 100
          ? 'good'
          : percent >= 50
            ? 'warn'
            : 'bad'

/** Gross profit rate rating. */
const gprRating = (rate: number | null): { label: string; level: Level } => {
    if (rate === null) return { label: 'No cost data', level: 'none' }
    if (rate >= 25) return { label: 'Excellent', level: 'good' }
    if (rate >= 10) return { label: 'Good', level: 'warn' }
    return { label: 'Low', level: 'bad' }
}

const Metric = ({
    label,
    children,
    title,
}: {
    label: string
    children: ReactNode
    title?: string
}) => (
    <div className="min-w-0" title={title}>
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm font-semibold tabular-nums heading-text">
            {children}
        </div>
    </div>
)

/** Same card shell as the page's KPI cards, with attainment progress and a metrics footer. */
const PerformanceCard = ({
    index,
    label,
    icon,
    value,
    loading,
    attainment,
    attainmentText,
    footer,
}: {
    index: number
    label: string
    icon: ReactNode
    value: string
    loading: boolean
    /** Percent of target / quota; null when none is set. */
    attainment: number | null
    attainmentText: string
    footer: ReactNode
}) => {
    const level = attainmentLevel(attainment)
    return (
        <div className={ENTER_CLASS} style={enterStyle(index)}>
            <AdaptiveCard className="h-full">
                <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        {label}
                    </p>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-lg text-primary-deep dark:bg-primary/15 dark:text-primary-light">
                        {icon}
                    </span>
                </div>
                {loading ? (
                    <>
                        <Skeleton className="mt-1" height={30} width="70%" />
                        <Skeleton className="mt-3" height={8} />
                        <Skeleton className="mt-4" height={36} />
                    </>
                ) : (
                    <>
                        <p
                            className="mt-1 truncate text-xl font-bold tabular-nums heading-text 2xl:text-2xl"
                            title={value}
                        >
                            {value}
                        </p>
                        <div className="mt-3">
                            <div className="origin-left animate-mm-progress-grow motion-reduce:animate-none">
                                <Progress
                                    size="sm"
                                    showInfo={false}
                                    percent={Math.min(100, attainment ?? 0)}
                                    customColorClass={LEVEL_BAR[level]}
                                />
                            </div>
                            <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
                                <span
                                    className="truncate text-gray-500"
                                    title={attainmentText}
                                >
                                    {attainmentText}
                                </span>
                                <StatusBadge tone={LEVEL_TONE[level]}>
                                    {attainment === null
                                        ? '—'
                                        : formatPercent(attainment)}
                                </StatusBadge>
                            </div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-gray-200 pt-3 dark:border-gray-700">
                            {footer}
                        </div>
                    </>
                )}
            </AdaptiveCard>
        </div>
    )
}

const KIND_META: Record<SalesLocationKind, { label: string; color: string }> = {
    BRANCH: { label: 'Physical store (branch)', color: COLOR_1 },
    ONLINE: { label: 'Online (e-commerce, Shopee, Lazada…)', color: COLOR_4 },
    OTHER: { label: 'Other sales', color: COLOR_7 },
}

const KIND_ORDER: SalesLocationKind[] = ['BRANCH', 'ONLINE', 'OTHER']

/** Sales per location: physical branches and online platforms as separate colors. */
const LocationChart = ({
    title,
    description,
    rows,
    loading,
    currency,
    index,
}: {
    title: string
    description: string
    rows: SalesPerformanceLocation[]
    loading: boolean
    currency: string
    index: number
}) => {
    const height = Math.max(240, rows.length * 46 + 90)
    const total = rows.reduce((sum, row) => sum + row.sales, 0)
    const kinds = KIND_ORDER.filter((kind) =>
        rows.some((row) => row.kind === kind),
    )
    return (
        <div className={ENTER_CLASS} style={enterStyle(index)}>
            <AdaptiveCard className="h-full">
                <SectionTitle
                    title={title}
                    description={description}
                    extra={
                        !loading && rows.length ? (
                            <Tag className="shrink-0">
                                {formatSdMoney(total, currency)}
                            </Tag>
                        ) : null
                    }
                />
                {loading ? (
                    <Skeleton height={260} />
                ) : rows.length ? (
                    <Chart
                        type="bar"
                        height={height}
                        xAxis={rows.map((row) => row.location)}
                        series={kinds.map((kind) => ({
                            name: KIND_META[kind].label,
                            data: rows.map((row) =>
                                row.kind === kind ? row.sales : 0,
                            ),
                        }))}
                        customOptions={{
                            chart: {
                                stacked: true,
                                toolbar: { show: false },
                                zoom: { enabled: false },
                            },
                            colors: kinds.map((kind) => KIND_META[kind].color),
                            plotOptions: {
                                bar: {
                                    horizontal: true,
                                    barHeight: '55%',
                                    borderRadius: 4,
                                    borderRadiusApplication: 'end',
                                },
                            },
                            stroke: { show: false },
                            dataLabels: { enabled: false },
                            legend: {
                                show: true,
                                position: 'top',
                                horizontalAlign: 'left',
                            },
                            grid: { strokeDashArray: 4 },
                            xaxis: {
                                categories: rows.map((row) => row.location),
                                labels: {
                                    formatter: (value: string) =>
                                        compactPhp(Number(value)),
                                },
                            },
                            tooltip: {
                                shared: false,
                                intersect: true,
                                y: {
                                    formatter: (
                                        value: number,
                                        opts?: { dataPointIndex?: number },
                                    ) => {
                                        const share =
                                            rows[opts?.dataPointIndex ?? -1]
                                                ?.share
                                        return `${formatSdMoney(value, currency)}${
                                            share !== undefined
                                                ? ` · ${formatPercent(share)}`
                                                : ''
                                        }`
                                    },
                                },
                            },
                        }}
                    />
                ) : (
                    <EmptyState
                        icon={<HiOutlineLocationMarker />}
                        message="No sales by location in this period"
                        height={240}
                    />
                )}
            </AdaptiveCard>
        </div>
    )
}

type Props = {
    /** Follows the page's channel filter. */
    channel: SalesAnalyticsChannel
    /**
     * Calendar month `YYYY-MM` the scorecard reports on, derived from the
     * page's period filter (so there is a single filter on the page).
     */
    month: string
    /** Bump to refetch (the page's Refresh button). */
    reloadKey: number
}

/**
 * Scorecard for Sales Analysis: YTD / month sales with gross profit rate and
 * quantity, collections against quota, and sales by location (physical branch
 * vs online platform). It follows the page's period and channel filters.
 */
const SalesPerformanceScorecard = ({ channel, month, reloadKey }: Props) => {
    const [targetsOpen, setTargetsOpen] = useState(false)
    const [targetsVersion, setTargetsVersion] = useState(0)
    const { canUpdate } = useResourceAccess('sd.reports')

    // The latest finished request; loading is whenever it is not for the current inputs.
    const requestKey = `${month}|${channel}|${reloadKey}|${targetsVersion}`
    const [settled, setSettled] = useState<{
        key: string
        data: SalesPerformance | null
        error: string | null
    } | null>(null)

    useEffect(() => {
        let active = true
        fetchSalesPerformance({ month, channel })
            .then((result) => {
                if (active)
                    setSettled({ key: requestKey, data: result, error: null })
            })
            .catch((err) => {
                if (active)
                    setSettled({
                        key: requestKey,
                        data: null,
                        error:
                            err instanceof Error
                                ? err.message
                                : 'Unable to load the sales scorecard',
                    })
            })
        return () => {
            active = false
        }
    }, [month, channel, requestKey])

    const loading = settled?.key !== requestKey
    const data = settled?.data ?? null
    const error = loading ? null : (settled?.error ?? null)

    const currency = data?.currency ?? 'PHP'
    const money = (value: number) => formatSdMoney(value, currency)
    const year = Number(month.slice(0, 4))

    const salesFooter = (period: SalesPerformanceWindow | undefined) => {
        if (!period) return null
        const rating = gprRating(period.grossProfitRate)
        return (
            <>
                <Metric
                    label="Gross profit rate"
                    title={
                        period.costCoverage === null
                            ? 'No sold item has a standard cost, so the gross profit rate cannot be computed.'
                            : `Calculated on sales whose items have a standard cost (${formatPercent(period.costCoverage)} of sales).`
                    }
                >
                    <span>
                        {period.grossProfitRate === null
                            ? '—'
                            : formatPercent(period.grossProfitRate)}
                    </span>
                    <StatusBadge tone={LEVEL_TONE[rating.level]}>
                        {rating.label}
                    </StatusBadge>
                </Metric>
                <Metric label="Units sold">
                    {period.qty.toLocaleString('en-PH')}
                </Metric>
            </>
        )
    }

    const collectionFooter = (
        period: SalesPerformanceWindow | undefined,
        quotaLabel: string,
    ) => {
        if (!period) return null
        return (
            <>
                <Metric label={`${quotaLabel} quota`}>
                    {period.collectionQuota > 0
                        ? money(period.collectionQuota)
                        : 'Not set'}
                </Metric>
                <Metric label="Quota attainment">
                    {period.quotaPercent === null
                        ? '—'
                        : formatPercent(period.quotaPercent)}
                </Metric>
            </>
        )
    }

    const targetText = (period: SalesPerformanceWindow | undefined) =>
        period && period.salesTarget > 0
            ? `of ${money(period.salesTarget)} target`
            : 'No target set'

    const quotaText = (period: SalesPerformanceWindow | undefined) =>
        period && period.collectionQuota > 0
            ? `of ${money(period.collectionQuota)} quota`
            : 'No quota set'

    return (
        <section className="mb-4" aria-label="Sales performance scorecard">
            {canUpdate ? (
                <div className="mb-3 flex justify-end">
                    <Button
                        size="sm"
                        icon={<HiOutlineAdjustments />}
                        onClick={() => setTargetsOpen(true)}
                    >
                        Set targets
                    </Button>
                </div>
            ) : null}

            {error ? (
                <Alert showIcon type="danger" className="mb-4">
                    {error}
                </Alert>
            ) : null}

            {data && !data.targetsConfigured && !loading ? (
                <Alert showIcon type="info" className="mb-4">
                    No sales targets or collection quotas are set for {year}, so
                    target and quota percentages are not shown.
                    {canUpdate
                        ? ' Use “Set targets” to enter them.'
                        : ' Ask an administrator to set them.'}
                </Alert>
            ) : null}

            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <PerformanceCard
                    index={0}
                    label="YTD overall sales"
                    icon={<HiOutlineTrendingUp />}
                    value={money(data?.ytd.sales ?? 0)}
                    loading={loading}
                    attainment={data?.ytd.targetPercent ?? null}
                    attainmentText={targetText(data?.ytd)}
                    footer={salesFooter(data?.ytd)}
                />
                <PerformanceCard
                    index={1}
                    label="YTD collection"
                    icon={<HiOutlineCash />}
                    value={money(data?.ytd.collected ?? 0)}
                    loading={loading}
                    attainment={data?.ytd.quotaPercent ?? null}
                    attainmentText={quotaText(data?.ytd)}
                    footer={collectionFooter(data?.ytd, 'YTD')}
                />
                <PerformanceCard
                    index={2}
                    label="Month overall sales"
                    icon={<HiOutlineCalendar />}
                    value={money(data?.mth.sales ?? 0)}
                    loading={loading}
                    attainment={data?.mth.targetPercent ?? null}
                    attainmentText={targetText(data?.mth)}
                    footer={salesFooter(data?.mth)}
                />
                <PerformanceCard
                    index={3}
                    label="Month collection"
                    icon={<HiOutlineCreditCard />}
                    value={money(data?.mth.collected ?? 0)}
                    loading={loading}
                    attainment={data?.mth.quotaPercent ?? null}
                    attainmentText={quotaText(data?.mth)}
                    footer={collectionFooter(data?.mth, 'Month')}
                />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <LocationChart
                    index={4}
                    title="YTD sales by location"
                    description={`January through ${month} · physical stores and online platforms`}
                    rows={data?.ytd.byLocation ?? []}
                    loading={loading}
                    currency={currency}
                />
                <LocationChart
                    index={5}
                    title="Monthly sales by location"
                    description={`${month} · physical stores and online platforms`}
                    rows={data?.mth.byLocation ?? []}
                    loading={loading}
                    currency={currency}
                />
            </div>

            <SalesTargetsDialog
                isOpen={targetsOpen}
                year={year}
                onClose={() => setTargetsOpen(false)}
                onSaved={() => setTargetsVersion((v) => v + 1)}
            />
        </section>
    )
}

export default SalesPerformanceScorecard
