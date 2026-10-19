'use client'

import { useEffect, useMemo, useState } from 'react'
import { HiOutlineChartBar, HiOutlineRefresh } from 'react-icons/hi'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import ErpBackLink from '@/components/erp/ErpBackLink'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import Chart from '@/components/shared/Chart'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Segment from '@/components/ui/Segment'
import Skeleton from '@/components/ui/Skeleton'
import Alert from '@/components/ui/Alert'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    fetchSalesAnalytics,
    type SalesAnalytics,
    type SalesAnalyticsChannel,
    type SalesAnalyticsRange,
} from '../services/salesAnalyticsService'

const ROUTE_PATH = '/modules/sd/sales-analysis'

const RANGE_OPTIONS: { value: SalesAnalyticsRange; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: '7days', label: 'Last 7 days' },
    { value: 'month', label: 'This month' },
    { value: 'ytd', label: 'Year to date' },
]

type ChannelOption = { value: SalesAnalyticsChannel; label: string }

const CHANNEL_OPTIONS: ChannelOption[] = [
    { value: 'ALL', label: 'All channels' },
    { value: 'ECOMMERCE', label: 'E-commerce' },
    { value: 'POS', label: 'POS' },
]

const CHANNEL_LABEL: Record<string, string> = {
    ECOMMERCE: 'E-commerce',
    POS: 'POS',
    STANDARD: 'Standard',
}

type TopProduct = SalesAnalytics['topProducts'][number]

const formatPhp = (amount: number, currency = 'PHP') =>
    new Intl.NumberFormat('en-PH', { style: 'currency', currency }).format(
        amount,
    )

const compactPhp = (amount: number) =>
    `₱${new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 1 }).format(amount)}`

const bucketLabel = (bucket: string, granularity: SalesAnalytics['bucket']) => {
    const [y, m, d] = bucket.split('-').map(Number)
    const date = new Date(Date.UTC(y, m - 1, d || 1))
    return granularity === 'day'
        ? date.toLocaleDateString('en-PH', {
              month: 'short',
              day: 'numeric',
              timeZone: 'UTC',
          })
        : date.toLocaleDateString('en-PH', {
              month: 'short',
              year: 'numeric',
              timeZone: 'UTC',
          })
}

const KpiCard = ({
    label,
    value,
    hint,
    loading,
}: {
    label: string
    value: string
    hint?: string
    loading: boolean
}) => (
    <Card>
        <div className="text-sm text-gray-500">{label}</div>
        {loading ? (
            <Skeleton className="mt-2" height={32} width="60%" />
        ) : (
            <div className="mt-1 text-2xl font-bold">{value}</div>
        )}
        {hint ? <div className="mt-1 text-xs text-gray-400">{hint}</div> : null}
    </Card>
)

const productColumns: ColumnDef<TopProduct>[] = [
    {
        header: '#',
        id: 'rank',
        size: 40,
        cell: ({ row }) => (
            <span className="font-semibold">{row.index + 1}</span>
        ),
    },
    {
        header: 'Product',
        id: 'product',
        cell: ({ row }) => (
            <div className="min-w-[10rem]">
                <div className="font-semibold">{row.original.productName}</div>
                <div className="font-mono text-xs text-gray-500">
                    {row.original.sku ?? '—'}
                </div>
            </div>
        ),
    },
    {
        header: 'Units sold',
        id: 'units',
        cell: ({ row }) => row.original.units.toLocaleString('en-PH'),
    },
    {
        header: 'Revenue',
        id: 'revenue',
        cell: ({ row }) => (
            <span className="whitespace-nowrap font-semibold">
                {formatPhp(row.original.revenue)}
            </span>
        ),
    },
]

const SalesAnalysisDashboard = () => {
    const breadcrumbItems = useMemo(() => buildErpBreadcrumbs(ROUTE_PATH), [])
    const [dateRange, setDateRange] = useState<SalesAnalyticsRange>('month')
    const [channel, setChannel] = useState<SalesAnalyticsChannel>('ALL')
    const [data, setData] = useState<SalesAnalytics | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [reloadKey, setReloadKey] = useState(0)

    useEffect(() => {
        let active = true
        fetchSalesAnalytics({ range: dateRange, channel })
            .then((result) => {
                if (!active) return
                setData(result)
                setError(null)
            })
            .catch((err) => {
                if (active)
                    setError(
                        err instanceof Error
                            ? err.message
                            : 'Unable to load sales analytics',
                    )
            })
            .finally(() => {
                if (active) setLoading(false)
            })
        return () => {
            active = false
        }
    }, [dateRange, channel, reloadKey])

    const changeRange = (next: SalesAnalyticsRange) => {
        setLoading(true)
        setDateRange(next)
    }
    const changeChannel = (next: SalesAnalyticsChannel) => {
        setLoading(true)
        setChannel(next)
    }
    const reload = () => {
        setLoading(true)
        setReloadKey((key) => key + 1)
    }

    const currency = data?.currency ?? 'PHP'
    const trendCategories =
        data?.trend.map((t) => bucketLabel(t.bucket, data.bucket)) ?? []
    const trendSeries = [
        { name: 'Revenue', data: data?.trend.map((t) => t.revenue) ?? [] },
    ]
    const split = data?.channelSplit.filter((c) => c.revenue > 0) ?? []

    return (
        <PageContainer>
            <ErpBackLink items={breadcrumbItems} />
            <Breadcrumb items={breadcrumbItems} className="mb-4" />
            <PageHeader
                title="Sales Analysis"
                description="Revenue, order volume and product mix from shipped, delivered, completed or paid sales orders."
                icon={<HiOutlineChartBar />}
                actions={
                    <Button
                        size="sm"
                        icon={<HiOutlineRefresh />}
                        loading={loading}
                        onClick={reload}
                    >
                        Refresh
                    </Button>
                }
            />

            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <Segment
                    size="sm"
                    value={dateRange}
                    onChange={(value) =>
                        changeRange(value as SalesAnalyticsRange)
                    }
                >
                    {RANGE_OPTIONS.map((option) => (
                        <Segment.Item key={option.value} value={option.value}>
                            {option.label}
                        </Segment.Item>
                    ))}
                </Segment>
                <div className="md:w-48">
                    <Select<ChannelOption>
                        size="sm"
                        isSearchable={false}
                        options={CHANNEL_OPTIONS}
                        value={CHANNEL_OPTIONS.find((o) => o.value === channel)}
                        onChange={(option) =>
                            option && changeChannel(option.value)
                        }
                    />
                </div>
            </div>

            {error ? (
                <Alert showIcon type="danger" className="mb-4">
                    {error}
                </Alert>
            ) : null}

            <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                <KpiCard
                    label="Total Revenue"
                    value={formatPhp(data?.totalRevenue ?? 0, currency)}
                    loading={loading}
                />
                <KpiCard
                    label="Total Orders"
                    value={(data?.totalOrders ?? 0).toLocaleString('en-PH')}
                    loading={loading}
                />
                <KpiCard
                    label="Average Order Value"
                    value={formatPhp(data?.averageOrderValue ?? 0, currency)}
                    hint="Total revenue ÷ total orders"
                    loading={loading}
                />
            </div>

            <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
                <Card className="xl:col-span-2">
                    <h6 className="mb-2 font-semibold heading-text">
                        Revenue trend
                    </h6>
                    {loading ? (
                        <Skeleton height={300} />
                    ) : (
                        <Chart
                            type="bar"
                            height={300}
                            series={trendSeries}
                            xAxis={trendCategories}
                            customOptions={{
                                dataLabels: { enabled: false },
                                yaxis: {
                                    labels: {
                                        formatter: (v: number) => compactPhp(v),
                                    },
                                },
                                tooltip: {
                                    y: {
                                        formatter: (v: number) =>
                                            formatPhp(v, currency),
                                    },
                                },
                            }}
                        />
                    )}
                </Card>
                <Card>
                    <h6 className="mb-2 font-semibold heading-text">
                        Channel split
                    </h6>
                    {loading ? (
                        <Skeleton height={300} />
                    ) : split.length ? (
                        <Chart
                            type="donut"
                            height={300}
                            series={split.map((c) => c.revenue)}
                            donutTitle="Revenue"
                            donutText={compactPhp(data?.totalRevenue ?? 0)}
                            customOptions={{
                                labels: split.map(
                                    (c) =>
                                        CHANNEL_LABEL[c.channel] ?? c.channel,
                                ),
                                tooltip: {
                                    y: {
                                        formatter: (v: number) =>
                                            formatPhp(v, currency),
                                    },
                                },
                                legend: { position: 'bottom' },
                            }}
                        />
                    ) : (
                        <div className="flex h-[300px] items-center justify-center text-sm text-gray-400">
                            No sales in this period
                        </div>
                    )}
                </Card>
            </div>

            <Card>
                <h6 className="mb-2 font-semibold heading-text">
                    Top products
                </h6>
                {loading ? (
                    <div className="space-y-3">
                        {Array.from({ length: 5 }, (_, i) => (
                            <Skeleton key={i} height={36} />
                        ))}
                    </div>
                ) : (
                    <DataTable
                        columns={productColumns}
                        data={data?.topProducts ?? []}
                        noData={!data?.topProducts.length}
                        hidePagination
                        compact
                    />
                )}
            </Card>
        </PageContainer>
    )
}

export default SalesAnalysisDashboard
