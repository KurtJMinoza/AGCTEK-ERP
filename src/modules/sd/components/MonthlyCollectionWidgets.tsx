'use client'

import type { ReactNode } from 'react'
import {
    HiOutlineCash,
    HiOutlineChevronRight,
    HiOutlineCreditCard,
    HiOutlineCurrencyDollar,
    HiOutlineDeviceMobile,
    HiOutlineDocumentText,
    HiOutlineDotsCircleHorizontal,
} from 'react-icons/hi'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Progress from '@/components/ui/Progress'
import Tag from '@/components/ui/Tag'
import Skeleton from '@/components/ui/Skeleton'
import classNames from '@/utils/classNames'
import {
    EmptyState,
    SectionTitle,
    sharePercent,
} from './SalesAnalysisWidgets'
import {
    formatSdMoney,
    SdMoneyCell,
    sdTableRowClassName,
} from './SdDataTableCells'
import type {
    CollectionBucketTotals,
    MonthlyCollectionReport,
} from '../services/monthlyCollectionService'

export const emptyBuckets = (): CollectionBucketTotals => ({
    cash: 0,
    gcash: 0,
    bankTransfer: 0,
    cheque: 0,
    others: 0,
    total: 0,
})

export function sumYearBuckets(
    report: MonthlyCollectionReport | null,
): CollectionBucketTotals {
    if (!report) return emptyBuckets()
    const acc = emptyBuckets()
    for (const row of report.yearSummary ?? []) {
        const s = row.summary
        acc.cash += s.cash
        acc.gcash += s.gcash
        acc.bankTransfer += s.bankTransfer
        acc.cheque += s.cheque
        acc.others += s.others
        acc.total += s.total
    }
    return acc
}

export function yearCollectionCount(report: MonthlyCollectionReport | null) {
    if (!report) return 0
    return (report.months ?? []).reduce(
        (n, m) => n + (m.rows?.length ?? 0),
        0,
    )
}

export const BUCKET_META: Array<{
    key: keyof CollectionBucketTotals
    label: string
    shortLabel: string
    icon: ReactNode
}> = [
    { key: 'cash', label: 'Cash', shortLabel: 'Cash', icon: <HiOutlineCash /> },
    {
        key: 'gcash',
        label: 'GCash & wallets',
        shortLabel: 'GCash',
        icon: <HiOutlineDeviceMobile />,
    },
    {
        key: 'bankTransfer',
        label: 'Bank transfer',
        shortLabel: 'Bank',
        icon: <HiOutlineCreditCard />,
    },
    {
        key: 'cheque',
        label: 'Cheque',
        shortLabel: 'Cheque',
        icon: <HiOutlineDocumentText />,
    },
    {
        key: 'others',
        label: 'Other tenders',
        shortLabel: 'Others',
        icon: <HiOutlineDotsCircleHorizontal />,
    },
    {
        key: 'total',
        label: 'Total collected',
        shortLabel: 'Total',
        icon: <HiOutlineCurrencyDollar />,
    },
]

export function monthTabLabel(full: string, compact: boolean) {
    if (full === 'TOTAL') return compact ? 'All' : 'Year total'
    return compact ? full.slice(0, 3) : full
}

type YearSummaryTableProps = {
    report: MonthlyCollectionReport
    loading?: boolean
    onSelectMonth?: (monthLabel: string) => void
    selectedMonthLabel?: string | null
}

export function YearSummaryTable({
    report,
    loading,
    onSelectMonth,
    selectedMonthLabel,
}: YearSummaryTableProps) {
    const rows = report.yearSummary ?? []
    const maxTotal = Math.max(...rows.map((r) => r.summary.total), 1)
    const yearTotal = sumYearBuckets(report).total

    if (loading) {
        return (
            <div className="space-y-3">
                {Array.from({ length: 6 }, (_, i) => (
                    <Skeleton key={i} height={36} />
                ))}
            </div>
        )
    }

    if (!yearTotal) {
        return (
            <EmptyState
                icon={<HiOutlineCurrencyDollar />}
                message="No collections recorded for this year"
                height={200}
            />
        )
    }

    return (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm ring-1 ring-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:ring-gray-800">
            <div className="overflow-x-auto">
                <table className="w-full min-w-[320px] text-sm">
                    <thead className="bg-gray-50/95 dark:bg-gray-800/80">
                        <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                            <th className="px-3 py-3 sm:px-4">Month</th>
                            <th className="hidden px-3 py-3 sm:table-cell sm:px-4">
                                Share of peak
                            </th>
                            <th className="hidden px-3 py-3 md:table-cell md:px-4">
                                % of year
                            </th>
                            <th className="px-3 py-3 text-right sm:px-4">
                                Collected
                            </th>
                            <th className="w-8 px-2 py-3" aria-hidden />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, index) => {
                            const amount = row.summary.total
                            const active = selectedMonthLabel === row.monthLabel
                            const clickable =
                                Boolean(onSelectMonth) && amount > 0
                            const dense = amount <= 0
                            return (
                                <tr
                                    key={row.month}
                                    className={classNames(
                                        sdTableRowClassName(row, index),
                                        'border-b border-gray-100 dark:border-gray-800',
                                        'border-l-[3px]',
                                        dense
                                            ? 'border-l-gray-200/50 dark:border-l-gray-700'
                                            : 'border-l-primary/60',
                                        clickable &&
                                            'cursor-pointer group/year-row',
                                        active &&
                                            'bg-primary-subtle/50 dark:bg-primary/10',
                                        !dense &&
                                            'odd:bg-white even:bg-gray-50/50 dark:odd:bg-gray-900 dark:even:bg-gray-800/20',
                                    )}
                                    onClick={() => {
                                        if (clickable && onSelectMonth) {
                                            onSelectMonth(row.monthLabel)
                                        }
                                    }}
                                >
                                    <td className="px-3 py-3 sm:px-4">
                                        <div className="flex items-center gap-2">
                                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gray-100 text-xs font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                                                {String(row.month).padStart(
                                                    2,
                                                    '0',
                                                )}
                                            </span>
                                            <div className="min-w-0">
                                                <p className="truncate font-medium text-gray-900 dark:text-gray-100">
                                                    <span className="hidden sm:inline">
                                                        {row.monthLabel}
                                                    </span>
                                                    <span className="sm:hidden">
                                                        {row.monthLabel.slice(
                                                            0,
                                                            3,
                                                        )}
                                                    </span>
                                                </p>
                                                {dense ? (
                                                    <p className="text-[11px] text-gray-400">
                                                        No collections
                                                    </p>
                                                ) : (
                                                    <p className="text-[11px] text-gray-500">
                                                        {sharePercent(
                                                            amount,
                                                            yearTotal,
                                                        )}
                                                        % of year
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="hidden px-3 py-3 sm:table-cell sm:px-4">
                                        <div className="flex min-w-[140px] max-w-[220px] items-center gap-2">
                                            <Progress
                                                percent={sharePercent(
                                                    amount,
                                                    maxTotal,
                                                )}
                                                showInfo={false}
                                                className="flex-1"
                                            />
                                        </div>
                                    </td>
                                    <td className="hidden px-3 py-3 md:table-cell md:px-4">
                                        <span className="text-xs font-medium tabular-nums text-gray-600 dark:text-gray-300">
                                            {amount > 0
                                                ? `${sharePercent(amount, yearTotal)}%`
                                                : '—'}
                                        </span>
                                    </td>
                                    <td className="px-3 py-3 text-right tabular-nums sm:px-4">
                                        {amount > 0 ? (
                                            <SdMoneyCell
                                                amount={amount}
                                                emphasize={active}
                                            />
                                        ) : (
                                            <span className="text-gray-300 dark:text-gray-600">
                                                —
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-2 py-3 text-gray-300 transition-colors group-hover/year-row:text-primary dark:text-gray-600">
                                        {clickable ? (
                                            <HiOutlineChevronRight className="text-lg" />
                                        ) : null}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                    <tfoot className="border-t-2 border-primary/20 bg-gradient-to-r from-primary-subtle/40 to-gray-50 dark:from-primary/10 dark:to-gray-900">
                        <tr>
                            <td
                                className="px-3 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100 sm:px-4"
                                colSpan={2}
                            >
                                Year total
                            </td>
                            <td className="hidden px-3 py-3 md:table-cell md:px-4" />
                            <td className="px-3 py-3 text-right sm:px-4">
                                <SdMoneyCell amount={yearTotal} emphasize />
                            </td>
                            <td />
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    )
}

type ReportMetaBannerProps = {
    report: MonthlyCollectionReport | null
    loading: boolean
    collectionCount: number
}

export function ReportMetaBanner({
    report,
    loading,
    collectionCount,
}: ReportMetaBannerProps) {
    if (loading && !report) {
        return <Skeleton height={48} width="100%" />
    }
    if (!report) return null

    return (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0">
                <p className="font-semibold heading-text">{report.companyName}</p>
                {report.companyAddress ? (
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {report.companyAddress}
                    </p>
                ) : null}
                <p className="mt-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                    {report.reportTitle}
                </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Tag className="border-0 bg-gray-100 font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                    {report.year}
                </Tag>
                <Tag className="border-0 bg-primary-subtle font-medium text-primary-deep dark:bg-primary/15 dark:text-primary-light">
                    {collectionCount.toLocaleString('en-PH')} collection
                    {collectionCount === 1 ? '' : 's'}
                </Tag>
            </div>
        </div>
    )
}

export function formatYearMoney(amount: number) {
    return formatSdMoney(amount, 'PHP')
}

export function YearSummarySection({
    title,
    description,
    extra,
    children,
}: {
    title: string
    description?: string
    extra?: ReactNode
    children: ReactNode
}) {
    return (
        <AdaptiveCard>
            <SectionTitle
                title={title}
                description={description}
                extra={extra}
            />
            {children}
        </AdaptiveCard>
    )
}