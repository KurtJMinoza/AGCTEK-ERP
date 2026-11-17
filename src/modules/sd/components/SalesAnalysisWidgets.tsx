'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { HiOutlineChartPie, HiOutlineUserGroup } from 'react-icons/hi'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import GrowShrinkValue from '@/components/shared/GrowShrinkValue'
import Avatar from '@/components/ui/Avatar'
import Progress from '@/components/ui/Progress'
import Segment from '@/components/ui/Segment'
import Skeleton from '@/components/ui/Skeleton'
import classNames from '@/utils/classNames'
import { formatSdMoney } from './SdDataTableCells'
import type { SalesAnalytics } from '../services/salesAnalyticsService'

type TopProduct = SalesAnalytics['topProducts'][number]
type TopCustomer = SalesAnalytics['topCustomers'][number]

export const sharePercent = (part: number, whole: number) =>
    whole > 0 ? Math.min(100, Math.round((part / whole) * 1000) / 10) : 0

const initials = (name: string) =>
    name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => word[0]?.toUpperCase())
        .join('') || '?'

export const CustomerAvatar = ({
    name,
    size = 36,
}: {
    name: string
    size?: number
}) => (
    <Avatar
        size={size}
        shape="circle"
        className="shrink-0 bg-primary-subtle font-semibold text-primary-deep dark:bg-primary/15 dark:text-primary-light"
    >
        {initials(name)}
    </Avatar>
)

export const SectionTitle = ({
    title,
    description,
    extra,
}: {
    title: string
    description?: string
    extra?: ReactNode
}) => (
    <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
            <h5 className="font-semibold heading-text">{title}</h5>
            {description ? (
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {description}
                </p>
            ) : null}
        </div>
        {extra}
    </div>
)

export const EmptyState = ({
    icon = <HiOutlineChartPie />,
    message = 'No sales in this period',
    height = 240,
}: {
    icon?: ReactNode
    message?: string
    height?: number
}) => (
    <div
        className="flex flex-col items-center justify-center gap-2 text-sm text-gray-400"
        style={{ minHeight: height }}
    >
        <span className="text-3xl">{icon}</span>
        {message}
    </div>
)

const ListSkeleton = ({ rows = 5 }: { rows?: number }) => (
    <div className="space-y-4">
        {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
                <Skeleton variant="circle" height={36} width={36} />
                <div className="flex-1 space-y-2">
                    <Skeleton height={12} width="60%" />
                    <Skeleton height={8} />
                </div>
            </div>
        ))}
    </div>
)

/** Change against the previous period; null when there is no baseline. */
const changePercent = (current: number, previous: number) =>
    previous > 0
        ? Math.round(((current - previous) / previous) * 1000) / 10
        : null

export const KpiCard = ({
    label,
    value,
    current,
    previous,
    icon,
    loading,
}: {
    label: string
    value: string
    current: number
    previous: number
    icon: ReactNode
    loading: boolean
}) => {
    const change = changePercent(current, previous)
    return (
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
                    <Skeleton className="mt-3" height={12} width="50%" />
                </>
            ) : (
                <>
                    <p className="mt-1 truncate text-2xl font-bold tabular-nums heading-text">
                        {value}
                    </p>
                    <div className="mt-2 flex items-center gap-1.5 text-xs">
                        {change === null ? (
                            <span className="font-semibold text-gray-500">
                                {current > 0 ? 'New' : 'No change'}
                            </span>
                        ) : (
                            <GrowShrinkValue
                                className="font-semibold"
                                value={change}
                                suffix="%"
                                positiveIcon="+"
                                negativeIcon=""
                            />
                        )}
                        <span className="text-gray-500">vs previous period</span>
                    </div>
                </>
            )}
        </AdaptiveCard>
    )
}

export const TopCustomersList = ({
    customers,
    totalRevenue,
    currency,
    loading,
}: {
    customers: TopCustomer[]
    totalRevenue: number
    currency: string
    loading: boolean
}) => {
    if (loading) return <ListSkeleton />
    if (!customers.length) {
        return (
            <EmptyState
                icon={<HiOutlineUserGroup />}
                message="No customers bought in this period"
            />
        )
    }
    return (
        <ul className="space-y-4">
            {customers.map((customer, index) => {
                const share = sharePercent(customer.revenue, totalRevenue)
                return (
                    <li key={customer.customerKey}>
                        <div className="flex items-center gap-3">
                            <CustomerAvatar name={customer.customerName} />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-baseline justify-between gap-2">
                                    <p className="truncate text-sm font-semibold heading-text">
                                        <span className="mr-1.5 text-gray-400">
                                            {index + 1}.
                                        </span>
                                        {customer.customerName}
                                    </p>
                                    <span className="shrink-0 text-sm font-bold tabular-nums heading-text">
                                        {formatSdMoney(
                                            customer.revenue,
                                            currency,
                                        )}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between gap-2 text-[11px] text-gray-500">
                                    <span className="truncate">
                                        {customer.customerNumber
                                            ? `${customer.customerNumber} · `
                                            : ''}
                                        {customer.orders} order
                                        {customer.orders === 1 ? '' : 's'} ·{' '}
                                        {customer.units.toLocaleString('en-PH')}{' '}
                                        unit{customer.units === 1 ? '' : 's'}
                                    </span>
                                    <span className="shrink-0">{share}%</span>
                                </div>
                                <Progress
                                    className="mt-1"
                                    size="sm"
                                    percent={share}
                                    showInfo={false}
                                />
                            </div>
                        </div>
                    </li>
                )
            })}
        </ul>
    )
}

type BestSellerMetric = 'revenue' | 'units'

/** Gold / silver / bronze for the podium, neutral after that. */
const RANK_CLASS = [
    'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    'bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-100',
    'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
]

/**
 * Ranked best-seller list with proportional bars. Long product names get a
 * full row each, so the layout stays clean however many products there are.
 */
export const BestSellersLeaderboard = ({
    products,
    totalRevenue,
    currency,
    loading,
    selectedProduct,
    onSelect,
}: {
    products: TopProduct[]
    totalRevenue: number
    currency: string
    loading: boolean
    selectedProduct: TopProduct | null
    onSelect: (product: TopProduct) => void
}) => {
    const [metric, setMetric] = useState<BestSellerMetric>('revenue')
    const ranked = useMemo(
        () => [...products].sort((a, b) => b[metric] - a[metric] || b.revenue - a.revenue),
        [products, metric],
    )

    if (loading) return <ListSkeleton rows={6} />
    if (!products.length) return <EmptyState height={300} />

    const max = Math.max(...ranked.map((p) => p[metric]), 1)
    const totalUnits = products.reduce((sum, p) => sum + p.units, 0)

    return (
        <div>
            <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-xs text-gray-500">
                    Top {products.length} by {metric === 'revenue' ? 'revenue' : 'units sold'}
                </span>
                <Segment
                    size="xs"
                    value={metric}
                    onChange={(value) => setMetric(value as BestSellerMetric)}
                >
                    <Segment.Item value="revenue">Revenue</Segment.Item>
                    <Segment.Item value="units">Units</Segment.Item>
                </Segment>
            </div>
            <ol className="max-h-[360px] space-y-1 overflow-y-auto pr-1">
                {ranked.map((product, index) => {
                    const value = product[metric]
                    const share =
                        metric === 'revenue'
                            ? sharePercent(product.revenue, totalRevenue)
                            : sharePercent(product.units, totalUnits)
                    const selected = product === selectedProduct
                    return (
                        <li key={`${product.sku ?? ''}-${product.productName}`}>
                            <button
                                type="button"
                                title={`${product.productName} — show who bought it`}
                                onClick={() => onSelect(product)}
                                className={classNames(
                                    'w-full rounded-lg px-2.5 py-2 text-left transition-colors',
                                    selected
                                        ? 'bg-primary-subtle ring-1 ring-primary/30'
                                        : 'hover:bg-gray-50 dark:hover:bg-gray-800/60',
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <span
                                        className={classNames(
                                            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums',
                                            RANK_CLASS[index] ??
                                                'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300',
                                        )}
                                    >
                                        {index + 1}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-baseline justify-between gap-3">
                                            <p className="truncate text-sm font-semibold heading-text">
                                                {product.productName}
                                            </p>
                                            <span className="shrink-0 text-sm font-bold tabular-nums heading-text">
                                                {metric === 'revenue'
                                                    ? formatSdMoney(product.revenue, currency)
                                                    : `${product.units.toLocaleString('en-PH')} units`}
                                            </span>
                                        </div>
                                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                                            <div
                                                className={classNames(
                                                    'h-full rounded-full',
                                                    index === 0 ? 'bg-primary' : 'bg-primary/60',
                                                )}
                                                style={{ width: `${Math.max(2, (value / max) * 100)}%` }}
                                            />
                                        </div>
                                        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-gray-500">
                                            <span className="truncate font-mono">
                                                {product.sku ?? '—'}
                                                <span className="font-sans">
                                                    {' · '}
                                                    {metric === 'revenue'
                                                        ? `${product.units.toLocaleString('en-PH')} units`
                                                        : formatSdMoney(product.revenue, currency)}
                                                    {' · '}
                                                    {product.orders} order{product.orders === 1 ? '' : 's'}
                                                </span>
                                            </span>
                                            <span className="shrink-0 tabular-nums">{share}% of {metric === 'revenue' ? 'sales' : 'units'}</span>
                                        </div>
                                    </div>
                                </div>
                            </button>
                        </li>
                    )
                })}
            </ol>
        </div>
    )
}

export const ProductBuyersPanel = ({
    product,
    currency,
    loading,
}: {
    product: TopProduct | null
    currency: string
    loading: boolean
}) => {
    if (loading) return <ListSkeleton />
    if (!product) {
        return (
            <EmptyState
                icon={<HiOutlineUserGroup />}
                message="Select a product to see who bought it"
            />
        )
    }
    return (
        <div>
            <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-800/40">
                <p className="line-clamp-2 text-sm font-semibold heading-text">
                    {product.productName}
                </p>
                <p className="font-mono text-[11px] text-gray-500">
                    {product.sku ?? '—'}
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    {[
                        {
                            label: 'Revenue',
                            value: formatSdMoney(product.revenue, currency),
                        },
                        {
                            label: 'Units',
                            value: product.units.toLocaleString('en-PH'),
                        },
                        {
                            label: 'Buyers',
                            value: product.customers.toLocaleString('en-PH'),
                        },
                    ].map((stat) => (
                        <div key={stat.label}>
                            <p className="truncate text-sm font-bold tabular-nums heading-text">
                                {stat.value}
                            </p>
                            <p className="text-[11px] text-gray-500">
                                {stat.label}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
            {product.buyers.length ? (
                <ul className="space-y-3">
                    {product.buyers.map((buyer) => {
                        const share = sharePercent(
                            buyer.revenue,
                            product.revenue,
                        )
                        return (
                            <li
                                key={buyer.customerKey}
                                className="flex items-center gap-3"
                            >
                                <CustomerAvatar
                                    name={buyer.customerName}
                                    size={32}
                                />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-baseline justify-between gap-2">
                                        <p className="truncate text-sm font-semibold heading-text">
                                            {buyer.customerName}
                                        </p>
                                        <span className="shrink-0 text-sm font-bold tabular-nums heading-text">
                                            {formatSdMoney(
                                                buyer.revenue,
                                                currency,
                                            )}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between gap-2 text-[11px] text-gray-500">
                                        <span className="truncate">
                                            {buyer.units.toLocaleString(
                                                'en-PH',
                                            )}{' '}
                                            unit{buyer.units === 1 ? '' : 's'}{' '}
                                            · {buyer.orders} order
                                            {buyer.orders === 1 ? '' : 's'}
                                        </span>
                                        <span
                                            className={classNames(
                                                'shrink-0',
                                                share >= 50 &&
                                                    'font-semibold text-primary',
                                            )}
                                        >
                                            {share}%
                                        </span>
                                    </div>
                                </div>
                            </li>
                        )
                    })}
                </ul>
            ) : (
                <EmptyState
                    height={120}
                    icon={<HiOutlineUserGroup />}
                    message="No buyer details for this product"
                />
            )}
        </div>
    )
}
