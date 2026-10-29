'use client'

import { useMemo } from 'react'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatCard from '@/components/shared/StatCard'
import Chart from '@/components/shared/Chart'
import Pagination from '@/components/ui/Pagination'
import AbbreviateNumber from '@/components/shared/AbbreviateNumber'
import {
    HiOutlineArchive,
    HiOutlineCollection,
    HiOutlineCube,
    HiOutlineLocationMarker,
    HiOutlineQrcode,
    HiOutlineTag,
    HiOutlineViewGrid,
} from 'react-icons/hi'
import classNames from 'classnames'

export type StockGroupBy =
    | 'material'
    | 'category'
    | 'warehouse'
    | 'bin'
    | 'batch'
    | 'serial'
    | 'status'

export type StockReportRow = {
    key: string
    label: string
    quantity: number
    stockStatus?: string
}

export type StockReportPayload = {
    groupBy?: string
    data?: StockReportRow[]
    meta?: { total?: number; page?: number; limit?: number; totalPages?: number }
    totals?: { quantity?: number }
}

const GROUP_LABELS: Record<StockGroupBy, string> = {
    material: 'Material',
    category: 'Category',
    warehouse: 'Warehouse',
    bin: 'Storage bin',
    batch: 'Batch',
    serial: 'Serial number',
    status: 'Stock status',
}

function groupIcon(groupBy: StockGroupBy) {
    switch (groupBy) {
        case 'material':
            return HiOutlineCube
        case 'category':
            return HiOutlineCollection
        case 'warehouse':
            return HiOutlineArchive
        case 'bin':
            return HiOutlineViewGrid
        case 'batch':
            return HiOutlineTag
        case 'serial':
            return HiOutlineQrcode
        case 'status':
            return HiOutlineLocationMarker
        default:
            return HiOutlineCube
    }
}

function rowEnterClass(index: number) {
    const delay = Math.min(index, 14) * 40
    return `animate-mm-row-in motion-reduce:animate-none opacity-0 [animation-delay:${delay}ms]`
}

function formatQty(n: number) {
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: 4 })
}

type Props = {
    data: StockReportPayload | null
    loading: boolean
    groupBy: StockGroupBy
    page: number
    limit: number
    onPageChange: (page: number) => void
}

export default function StockReportsContent({
    data,
    loading,
    groupBy,
    page,
    limit,
    onPageChange,
}: Props) {
    const rows = data?.data ?? []
    const totalQty = Number(data?.totals?.quantity ?? 0)
    const meta = data?.meta
    const totalPages = meta?.totalPages ?? 1
    const totalRows = meta?.total ?? rows.length
    const maxQty = useMemo(
        () => Math.max(...rows.map((r) => Number(r.quantity)), 1),
        [rows],
    )

    const chartSeries = useMemo(
        () => [
            {
                name: 'On-hand qty',
                data: rows.slice(0, 8).map((r) => Number(r.quantity)),
            },
        ],
        [rows],
    )

    const chartCategories = useMemo(
        () =>
            rows.slice(0, 8).map((r) => {
                const label = r.label ?? ''
                return label.length > 22 ? `${label.slice(0, 20)}…` : label
            }),
        [rows],
    )

    const columns = useMemo<ColumnDef<StockReportRow>[]>(() => {
        const dimensionHeader = GROUP_LABELS[groupBy] ?? 'Dimension'
        return [
            {
                id: 'rank',
                header: '#',
                size: 48,
                cell: ({ row }) => (
                    <span className="tabular-nums text-xs font-semibold text-gray-500">
                        {(page - 1) * limit + row.index + 1}
                    </span>
                ),
            },
            {
                accessorKey: 'label',
                header: dimensionHeader,
                cell: ({ row }) => {
                    const Icon = groupIcon(groupBy)
                    return (
                        <div className="flex min-w-0 items-center gap-2.5">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary-deep dark:bg-primary/15">
                                <Icon className="text-base" />
                            </span>
                            <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                                {row.original.label || '—'}
                            </span>
                        </div>
                    )
                },
            },
            {
                accessorKey: 'quantity',
                header: 'Quantity',
                cell: ({ row }) => (
                    <span className="tabular-nums text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {formatQty(Number(row.original.quantity))}
                    </span>
                ),
            },
            {
                id: 'share',
                header: 'Share',
                cell: ({ row }) => {
                    const qty = Number(row.original.quantity)
                    const pct = totalQty > 0 ? (qty / totalQty) * 100 : 0
                    return (
                        <div className="min-w-[7rem]">
                            <div className="mb-1 flex justify-between text-[11px] tabular-nums text-gray-500">
                                <span>{pct.toFixed(1)}%</span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                                <div
                                    className="h-full origin-left rounded-full bg-primary animate-mm-progress-grow motion-reduce:animate-none"
                                    style={{
                                        width: `${Math.min(100, (qty / maxQty) * 100)}%`,
                                        animationDelay: `${Math.min(row.index, 12) * 35}ms`,
                                    }}
                                />
                            </div>
                        </div>
                    )
                },
            },
        ]
    }, [groupBy, limit, maxQty, page, totalQty])

    const avgPerLine = totalRows > 0 ? totalQty / totalRows : 0

    return (
        <div className="space-y-5">
            <div className="grid grid-cols-1 gap-3 xs:grid-cols-2 xl:grid-cols-4">
                {[
                    {
                        label: 'Total on-hand',
                        value: loading ? '—' : formatQty(totalQty),
                        tone: 'info' as const,
                        icon: <HiOutlineCube className="text-xl" />,
                    },
                    {
                        label: GROUP_LABELS[groupBy],
                        value: loading ? '—' : totalRows.toLocaleString(),
                        tone: 'default' as const,
                        icon: <HiOutlineViewGrid className="text-xl" />,
                    },
                    {
                        label: 'Avg per line',
                        value: loading ? '—' : formatQty(avgPerLine),
                        tone: 'success' as const,
                        icon: <HiOutlineTag className="text-xl" />,
                    },
                    {
                        label: 'Page',
                        value: loading ? '—' : `${page} / ${totalPages}`,
                        tone: 'warning' as const,
                        icon: <HiOutlineArchive className="text-xl" />,
                    },
                ].map((stat, i) => (
                    <div key={stat.label} className={rowEnterClass(i)}>
                        <StatCard
                            label={stat.label}
                            value={stat.value}
                            tone={stat.tone}
                            icon={stat.icon}
                            loading={loading}
                        />
                    </div>
                ))}
            </div>

            {!loading && rows.length > 0 && (
                <div className={classNames('rounded-xl border border-gray-200 bg-gray-50/50 p-3 dark:border-gray-700 dark:bg-gray-900/30 sm:p-4', rowEnterClass(0))}>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                            Top {Math.min(8, rows.length)} by quantity
                        </p>
                        <div className="min-h-[220px] w-full overflow-x-auto">
                            <Chart
                                type="bar"
                                height={240}
                                series={chartSeries}
                                xAxis={chartCategories}
                                customOptions={{
                                    plotOptions: {
                                        bar: {
                                            borderRadius: 6,
                                            columnWidth: '55%',
                                        },
                                    },
                                    dataLabels: { enabled: false },
                                    colors: ['var(--primary)'],
                                }}
                            />
                        </div>
                </div>
            )}

            {/* Mobile / tablet card list */}
            <div className="space-y-3 lg:hidden">
                {loading ? (
                    <div className="space-y-3">
                        {[0, 1, 2].map((i) => (
                            <div
                                key={i}
                                className="h-24 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800"
                            />
                        ))}
                    </div>
                ) : rows.length === 0 ? (
                    <p className="py-8 text-center text-sm text-gray-500">
                        No stock balances match the current filters.
                    </p>
                ) : (
                    rows.map((row, index) => {
                        const qty = Number(row.quantity)
                        const pct = totalQty > 0 ? (qty / totalQty) * 100 : 0
                        const Icon = groupIcon(groupBy)
                        return (
                            <article
                                key={row.key}
                                className={classNames(
                                    'rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/50',
                                    rowEnterClass(index),
                                )}
                            >
                                <div className="flex items-start gap-3">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-primary-deep">
                                        <Icon className="text-lg" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                                            {row.label}
                                        </p>
                                        <p className="mt-1 text-lg font-bold tabular-nums text-primary">
                                            <AbbreviateNumber value={qty} />
                                        </p>
                                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                                            <div
                                                className="h-full rounded-full bg-primary"
                                                style={{
                                                    width: `${Math.min(100, (qty / maxQty) * 100)}%`,
                                                }}
                                            />
                                        </div>
                                        <p className="mt-1 text-[11px] text-gray-500">
                                            {pct.toFixed(1)}% of filtered total
                                        </p>
                                    </div>
                                    <span className="text-xs font-medium text-gray-400">
                                        #{(page - 1) * limit + index + 1}
                                    </span>
                                </div>
                            </article>
                        )
                    })
                )}
            </div>

            {/* Desktop table */}
            <div className="hidden lg:block">
                <DataTable
                    loading={loading}
                    columns={columns}
                    data={rows}
                    getRowId={(row) => row.key}
                    rowClassName={(_, index) => rowEnterClass(index)}
                    hidePagination
                    fit
                />
            </div>

            {totalPages > 1 && (
                <div className="flex flex-col items-center justify-between gap-3 border-t border-gray-200 pt-4 dark:border-gray-700 sm:flex-row">
                    <p className="text-sm text-gray-500">
                        Showing{' '}
                        <span className="font-medium text-gray-800 dark:text-gray-200">
                            {(page - 1) * limit + 1}–
                            {Math.min(page * limit, totalRows)}
                        </span>{' '}
                        of {totalRows.toLocaleString()} lines
                    </p>
                    <Pagination
                        currentPage={page}
                        total={totalRows}
                        pageSize={limit}
                        onChange={onPageChange}
                    />
                </div>
            )}
        </div>
    )
}
