'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    HiOutlineCalendar,
    HiOutlineCash,
    HiOutlineChartBar,
    HiOutlineCube,
    HiOutlineReceiptTax,
    HiOutlineRefresh,
    HiOutlineShoppingCart,
    HiOutlineUserGroup,
} from 'react-icons/hi'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import ErpBackLink from '@/components/erp/ErpBackLink'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import { type ColumnDef } from '@/components/shared/DataTable'
import Chart from '@/components/shared/Chart'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Segment from '@/components/ui/Segment'
import Skeleton from '@/components/ui/Skeleton'
import Progress from '@/components/ui/Progress'
import Tag from '@/components/ui/Tag'
import Alert from '@/components/ui/Alert'
import { COLORS } from '@/constants/chart.constant'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import SdDataTable from '../components/SdDataTable'
import {
    SdDateCell,
    SdDocCell,
    SdMoneyCell,
    formatSdMoney,
} from '../components/SdDataTableCells'
import {
    CustomerAvatar,
    EmptyState,
    KpiCard,
    ProductBuyersPanel,
    SectionTitle,
    TopCustomersList,
    sharePercent,
} from '../components/SalesAnalysisWidgets'
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
type RecentOrder = SalesAnalytics['recentOrders'][number]

const productKey = (product: TopProduct) => product.sku ?? product.productName

const compactPhp = (amount: number) =>
    `₱${new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 1 }).format(amount)}`

const formatPeriodDate = (value: string) =>
    new Date(value).toLocaleDateString('en-PH', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'Asia/Manila',
    })

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

const truncateLabel = (label: string, max = 28) =>
    label.length > max ? `${label.slice(0, max - 1)}…` : label

const SalesAnalysisDashboard = () => {
    const breadcrumbItems = useMemo(() => buildErpBreadcrumbs(ROUTE_PATH), [])
    const [dateRange, setDateRange] = useState<SalesAnalyticsRange>('month')
    const [channel, setChannel] = useState<SalesAnalyticsChannel>('ALL')
    const [data, setData] = useState<SalesAnalytics | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [reloadKey, setReloadKey] = useState(0)
    const [selectedProductKey, setSelectedProductKey] = useState<
        string | null
    >(null)

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
    const money = (value: number) => formatSdMoney(value, currency)
    const totalRevenue = data?.totalRevenue ?? 0
    const products = useMemo(() => data?.topProducts ?? [], [data])
    const selectedProduct =
        products.find((p) => productKey(p) === selectedProductKey) ??
        products[0] ??
        null
    const split = data?.channelSplit.filter((c) => c.revenue > 0) ?? []
    const hasTrend = data?.trend.some((t) => t.revenue > 0 || t.orders > 0)

    const buyersPanelRef = useRef<HTMLDivElement>(null)
    const selectProduct = useCallback((key: string) => {
        setSelectedProductKey(key)
        buyersPanelRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
        })
    }, [])
    const productByName = useMemo(
        () => new Map(products.map((p) => [p.productName, p])),
        [products],
    )

    const productColumns = useMemo<ColumnDef<TopProduct>[]>(
        () => [
            {
                header: '#',
                id: 'rank',
                size: 40,
                cell: ({ row }) => (
                    <span className="font-semibold text-gray-500">
                        {row.index + 1}
                    </span>
                ),
            },
            {
                header: 'Product',
                id: 'product',
                cell: ({ row }) => (
                    <button
                        type="button"
                        className="block min-w-[12rem] max-w-[22rem] text-left"
                        title="Show who bought this product"
                        onClick={() => selectProduct(productKey(row.original))}
                    >
                        <p className="truncate font-semibold heading-text hover:text-primary">
                            {row.original.productName}
                        </p>
                        <p className="font-mono text-[11px] text-gray-500">
                            {row.original.sku ?? '—'}
                        </p>
                    </button>
                ),
            },
            {
                header: 'Customers',
                id: 'customers',
                cell: ({ row }) => {
                    const [first, ...rest] = row.original.buyers
                    if (!first) {
                        return <span className="text-gray-400">—</span>
                    }
                    return (
                        <button
                            type="button"
                            className="flex min-w-[10rem] max-w-[14rem] items-center gap-2 text-left"
                            onClick={() =>
                                selectProduct(productKey(row.original))
                            }
                        >
                            <CustomerAvatar name={first.customerName} size={26} />
                            <span className="min-w-0">
                                <span className="block truncate text-sm font-medium heading-text hover:text-primary">
                                    {first.customerName}
                                </span>
                                {rest.length ? (
                                    <span className="block text-[11px] text-gray-500">
                                        +{rest.length} more customer
                                        {rest.length === 1 ? '' : 's'}
                                    </span>
                                ) : null}
                            </span>
                        </button>
                    )
                },
            },
            {
                header: 'Units',
                id: 'units',
                cell: ({ row }) => (
                    <span className="tabular-nums">
                        {row.original.units.toLocaleString('en-PH')}
                    </span>
                ),
            },
            {
                header: 'Orders',
                id: 'orders',
                cell: ({ row }) => (
                    <span className="tabular-nums">
                        {row.original.orders.toLocaleString('en-PH')}
                    </span>
                ),
            },
            {
                header: 'Revenue',
                id: 'revenue',
                cell: ({ row }) => (
                    <SdMoneyCell
                        emphasize
                        amount={row.original.revenue}
                        currency={currency}
                    />
                ),
            },
            {
                header: 'Share',
                id: 'share',
                cell: ({ row }) => {
                    const share = sharePercent(
                        row.original.revenue,
                        totalRevenue,
                    )
                    return (
                        <div className="flex min-w-[7rem] items-center gap-2">
                            <Progress
                                className="flex-1"
                                size="sm"
                                percent={share}
                                showInfo={false}
                            />
                            <span className="w-11 text-right text-xs tabular-nums text-gray-500">
                                {share}%
                            </span>
                        </div>
                    )
                },
            },
            {
                header: 'Buyers',
                id: 'buyers',
                cell: ({ row }) => {
                    const active =
                        selectedProduct !== null &&
                        productKey(row.original) ===
                            productKey(selectedProduct)
                    return (
                        <Button
                            size="xs"
                            variant={active ? 'solid' : 'default'}
                            icon={<HiOutlineUserGroup />}
                            onClick={() =>
                                selectProduct(productKey(row.original))
                            }
                        >
                            {row.original.customers}
                        </Button>
                    )
                },
            },
        ],
        [currency, totalRevenue, selectedProduct, selectProduct],
    )

    const recentColumns = useMemo<ColumnDef<RecentOrder>[]>(
        () => [
            {
                header: 'Order',
                id: 'order',
                cell: ({ row }) => (
                    <SdDocCell
                        primary={row.original.orderNumber}
                        secondary={
                            CHANNEL_LABEL[row.original.channel] ??
                            row.original.channel
                        }
                    />
                ),
            },
            {
                header: 'Date',
                id: 'date',
                cell: ({ row }) => (
                    <SdDateCell value={row.original.createdAt} withTime />
                ),
            },
            {
                header: 'Customer',
                id: 'customer',
                cell: ({ row }) => (
                    <div className="flex min-w-[10rem] items-center gap-2">
                        <CustomerAvatar
                            name={row.original.customerName}
                            size={28}
                        />
                        <span className="min-w-0">
                            <span className="block truncate text-sm font-medium heading-text">
                                {row.original.customerName}
                            </span>
                            {row.original.customerNumber ? (
                                <span className="block font-mono text-[11px] text-gray-500">
                                    {row.original.customerNumber}
                                </span>
                            ) : null}
                        </span>
                    </div>
                ),
            },
            {
                header: 'Products',
                id: 'products',
                cell: ({ row }) => {
                    if (!row.original.products.length) {
                        return <span className="text-gray-400">—</span>
                    }
                    return (
                        <ul className="min-w-[12rem] max-w-[22rem] space-y-0.5">
                            {row.original.products.map((name) => {
                                const product = productByName.get(name)
                                return (
                                    <li key={name} className="truncate text-sm">
                                        {product ? (
                                            <button
                                                type="button"
                                                className="max-w-full truncate text-left hover:text-primary hover:underline"
                                                title="Show who bought this product"
                                                onClick={() =>
                                                    selectProduct(
                                                        productKey(product),
                                                    )
                                                }
                                            >
                                                {name}
                                            </button>
                                        ) : (
                                            name
                                        )}
                                    </li>
                                )
                            })}
                        </ul>
                    )
                },
            },
            {
                header: 'Units',
                id: 'units',
                cell: ({ row }) => (
                    <span className="tabular-nums">
                        {row.original.units.toLocaleString('en-PH')}
                    </span>
                ),
            },
            {
                header: 'Amount',
                id: 'amount',
                cell: ({ row }) => (
                    <SdMoneyCell
                        emphasize
                        amount={row.original.revenue}
                        currency={currency}
                    />
                ),
            },
        ],
        [currency, productByName, selectProduct],
    )

    const kpis = data
        ? [
              {
                  label: 'Total revenue',
                  value: money(data.totalRevenue),
                  current: data.totalRevenue,
                  previous: data.previous.totalRevenue,
                  icon: <HiOutlineCash />,
              },
              {
                  label: 'Orders',
                  value: data.totalOrders.toLocaleString('en-PH'),
                  current: data.totalOrders,
                  previous: data.previous.totalOrders,
                  icon: <HiOutlineShoppingCart />,
              },
              {
                  label: 'Average order value',
                  value: money(data.averageOrderValue),
                  current: data.averageOrderValue,
                  previous: data.previous.averageOrderValue,
                  icon: <HiOutlineReceiptTax />,
              },
              {
                  label: 'Units sold',
                  value: data.totalUnits.toLocaleString('en-PH'),
                  current: data.totalUnits,
                  previous: data.previous.totalUnits,
                  icon: <HiOutlineCube />,
              },
              {
                  label: 'Customers',
                  value: data.uniqueCustomers.toLocaleString('en-PH'),
                  current: data.uniqueCustomers,
                  previous: data.previous.uniqueCustomers,
                  icon: <HiOutlineUserGroup />,
              },
          ]
        : [
              'Total revenue',
              'Orders',
              'Average order value',
              'Units sold',
              'Customers',
          ].map((label) => ({
              label,
              value: '—',
              current: 0,
              previous: 0,
              icon: <HiOutlineChartBar />,
          }))

    return (
        <PageContainer>
            <ErpBackLink items={breadcrumbItems} />
            <Breadcrumb items={breadcrumbItems} className="mb-4" />
            <PageHeader
                title="Sales Analysis"
                description="Revenue, products and customers from shipped, delivered, completed or paid sales orders. Voided and cancelled sales are not counted."
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

            <AdaptiveCard className="mb-4" bodyClass="p-3 sm:p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <Segment
                        size="sm"
                        value={dateRange}
                        onChange={(value) =>
                            changeRange(value as SalesAnalyticsRange)
                        }
                    >
                        {RANGE_OPTIONS.map((option) => (
                            <Segment.Item
                                key={option.value}
                                value={option.value}
                            >
                                {option.label}
                            </Segment.Item>
                        ))}
                    </Segment>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        {data ? (
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                <HiOutlineCalendar className="text-base text-gray-400" />
                                <span>
                                    <span className="font-semibold text-gray-700 dark:text-gray-200">
                                        {formatPeriodDate(data.from)} –{' '}
                                        {formatPeriodDate(data.to)}
                                    </span>
                                    <span className="hidden xl:inline">
                                        {' '}
                                        · compared with{' '}
                                        {formatPeriodDate(data.previous.from)} –{' '}
                                        {formatPeriodDate(data.previous.to)}
                                    </span>
                                </span>
                            </div>
                        ) : null}
                        <div className="sm:w-44">
                            <Select<ChannelOption>
                                size="sm"
                                isSearchable={false}
                                options={CHANNEL_OPTIONS}
                                value={CHANNEL_OPTIONS.find(
                                    (o) => o.value === channel,
                                )}
                                onChange={(option) =>
                                    option && changeChannel(option.value)
                                }
                            />
                        </div>
                    </div>
                </div>
            </AdaptiveCard>

            {error ? (
                <Alert showIcon type="danger" className="mb-4">
                    {error}
                </Alert>
            ) : null}

            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
                {kpis.map((kpi) => (
                    <KpiCard key={kpi.label} loading={loading} {...kpi} />
                ))}
            </div>

            <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
                <AdaptiveCard className="xl:col-span-2">
                    <SectionTitle
                        title="Revenue & orders trend"
                        description={
                            data?.bucket === 'month'
                                ? 'Monthly revenue with the number of orders'
                                : 'Daily revenue with the number of orders'
                        }
                    />
                    {loading ? (
                        <Skeleton height={320} />
                    ) : hasTrend && data ? (
                        <Chart
                            type="line"
                            height={320}
                            xAxis={data.trend.map((t) =>
                                bucketLabel(t.bucket, data.bucket),
                            )}
                            series={[
                                {
                                    name: 'Revenue',
                                    type: 'area',
                                    data: data.trend.map((t) => t.revenue),
                                },
                                {
                                    name: 'Orders',
                                    type: 'column',
                                    data: data.trend.map((t) => t.orders),
                                },
                            ]}
                            customOptions={{
                                chart: {
                                    toolbar: { show: false },
                                    zoom: { enabled: false },
                                },
                                stroke: { width: [3, 0], curve: 'smooth' },
                                fill: {
                                    type: ['gradient', 'solid'],
                                    opacity: [1, 0.85],
                                    gradient: {
                                        shadeIntensity: 1,
                                        opacityFrom: 0.4,
                                        opacityTo: 0.05,
                                        stops: [0, 90, 100],
                                    },
                                },
                                plotOptions: {
                                    bar: { columnWidth: '40%', borderRadius: 4 },
                                },
                                dataLabels: { enabled: false },
                                legend: {
                                    position: 'top',
                                    horizontalAlign: 'right',
                                },
                                yaxis: [
                                    {
                                        labels: {
                                            formatter: (v: number) =>
                                                compactPhp(v),
                                        },
                                    },
                                    {
                                        opposite: true,
                                        labels: {
                                            formatter: (v: number) =>
                                                `${Math.round(v)}`,
                                        },
                                    },
                                ],
                                tooltip: {
                                    shared: true,
                                    intersect: false,
                                    y: {
                                        formatter: (
                                            v: number,
                                            opts?: { seriesIndex?: number },
                                        ) =>
                                            opts?.seriesIndex === 1
                                                ? `${v} order${v === 1 ? '' : 's'}`
                                                : money(v),
                                    },
                                },
                            }}
                        />
                    ) : (
                        <EmptyState height={320} />
                    )}
                </AdaptiveCard>

                <AdaptiveCard>
                    <SectionTitle
                        title="Channel mix"
                        description="Revenue by order-entry channel"
                    />
                    {loading ? (
                        <Skeleton height={320} />
                    ) : split.length ? (
                        <>
                            <Chart
                                type="donut"
                                height={220}
                                series={split.map((c) => c.revenue)}
                                donutTitle="Revenue"
                                donutText={compactPhp(totalRevenue)}
                                customOptions={{
                                    labels: split.map(
                                        (c) =>
                                            CHANNEL_LABEL[c.channel] ??
                                            c.channel,
                                    ),
                                    legend: { show: false },
                                    tooltip: {
                                        y: {
                                            formatter: (v: number) => money(v),
                                        },
                                    },
                                }}
                            />
                            <ul className="mt-4 space-y-3">
                                {split.map((c, index) => (
                                    <li
                                        key={c.channel}
                                        className="flex items-center justify-between gap-3 text-sm"
                                    >
                                        <span className="flex min-w-0 items-center gap-2">
                                            <span
                                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                                style={{
                                                    backgroundColor:
                                                        COLORS[
                                                            index %
                                                                COLORS.length
                                                        ],
                                                }}
                                            />
                                            <span className="truncate font-medium heading-text">
                                                {CHANNEL_LABEL[c.channel] ??
                                                    c.channel}
                                            </span>
                                            <span className="text-xs text-gray-500">
                                                {c.orders} order
                                                {c.orders === 1 ? '' : 's'}
                                            </span>
                                        </span>
                                        <span className="shrink-0 text-right">
                                            <span className="block font-semibold tabular-nums heading-text">
                                                {money(c.revenue)}
                                            </span>
                                            <span className="text-[11px] text-gray-500">
                                                {sharePercent(
                                                    c.revenue,
                                                    totalRevenue,
                                                )}
                                                %
                                            </span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </>
                    ) : (
                        <EmptyState height={320} />
                    )}
                </AdaptiveCard>
            </div>

            <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
                <AdaptiveCard className="xl:col-span-2">
                    <SectionTitle
                        title="Best-selling products"
                        description="Top products by revenue in the period"
                    />
                    {loading ? (
                        <Skeleton height={340} />
                    ) : products.length ? (
                        <Chart
                            type="bar"
                            height={Math.max(220, products.length * 38)}
                            xAxis={products.map((p) =>
                                truncateLabel(p.productName),
                            )}
                            series={[
                                {
                                    name: 'Revenue',
                                    data: products.map((p) => p.revenue),
                                },
                            ]}
                            customOptions={{
                                plotOptions: {
                                    bar: {
                                        horizontal: true,
                                        borderRadius: 4,
                                        barHeight: '60%',
                                        distributed: true,
                                    },
                                },
                                legend: { show: false },
                                dataLabels: { enabled: false },
                                grid: {
                                    xaxis: { lines: { show: true } },
                                    yaxis: { lines: { show: false } },
                                },
                                tooltip: {
                                    y: {
                                        formatter: (v: number) => money(v),
                                    },
                                },
                            }}
                        />
                    ) : (
                        <EmptyState height={340} />
                    )}
                </AdaptiveCard>

                <AdaptiveCard>
                    <SectionTitle
                        title="Top customers"
                        description="Who bought the most in the period"
                        extra={
                            data ? (
                                <Tag className="shrink-0">
                                    {data.uniqueCustomers} total
                                </Tag>
                            ) : null
                        }
                    />
                    <TopCustomersList
                        customers={data?.topCustomers ?? []}
                        totalRevenue={totalRevenue}
                        currency={currency}
                        loading={loading}
                    />
                </AdaptiveCard>
            </div>

            <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
                <AdaptiveCard className="xl:col-span-2">
                    <SectionTitle
                        title="Product performance"
                        description="Click a product to see the customers who bought it and their amount"
                    />
                    {loading ? (
                        <div className="space-y-3">
                            {Array.from({ length: 6 }, (_, i) => (
                                <Skeleton key={i} height={40} />
                            ))}
                        </div>
                    ) : (
                        <SdDataTable
                            columns={productColumns}
                            data={products}
                            noData={!products.length}
                            hidePagination
                            rowClassName={(row) =>
                                selectedProduct &&
                                productKey(row as TopProduct) ===
                                    productKey(selectedProduct)
                                    ? 'bg-primary-subtle/60 dark:bg-primary/10'
                                    : undefined
                            }
                        />
                    )}
                </AdaptiveCard>

                <div ref={buyersPanelRef} className="scroll-mt-4">
                    <AdaptiveCard className="h-full">
                        <SectionTitle
                            title="Who bought it"
                            description="Customers of the selected product and their amount"
                        />
                        <ProductBuyersPanel
                            product={selectedProduct}
                            currency={currency}
                            loading={loading}
                        />
                    </AdaptiveCard>
                </div>
            </div>

            <AdaptiveCard>
                <SectionTitle
                    title="Recent sales"
                    description="Latest orders in the period — click a product to see all its buyers"
                />
                {loading ? (
                    <div className="space-y-3">
                        {Array.from({ length: 5 }, (_, i) => (
                            <Skeleton key={i} height={40} />
                        ))}
                    </div>
                ) : (
                    <SdDataTable
                        columns={recentColumns}
                        data={data?.recentOrders ?? []}
                        noData={!data?.recentOrders.length}
                        hidePagination
                    />
                )}
            </AdaptiveCard>
        </PageContainer>
    )
}

export default SalesAnalysisDashboard
