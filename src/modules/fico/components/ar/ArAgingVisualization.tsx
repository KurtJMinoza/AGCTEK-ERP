'use client'

import type { ReactNode } from 'react'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import classNames from '@/utils/classNames'
import { formatMoney } from '../journal/journalUi'
import type { ArAgingBuckets } from '../../services/accountsReceivableService'

const BUCKET_META: Array<{
    key: keyof ArAgingBuckets
    label: string
    barClass: string
    credit?: boolean
}> = [
    { key: 'current', label: 'Current', barClass: 'bg-emerald-500' },
    { key: 'days1To30', label: '1–30 days overdue', barClass: 'bg-sky-500' },
    { key: 'days31To60', label: '31–60 days overdue', barClass: 'bg-amber-500' },
    { key: 'days61To90', label: '61–90 days overdue', barClass: 'bg-orange-500' },
    { key: 'over90', label: '90+ days overdue', barClass: 'bg-rose-600' },
    {
        key: 'customerCredits',
        label: 'Customer credits (unapplied)',
        barClass: 'bg-violet-500',
        credit: true,
    },
]

function num(v: string | number | undefined) {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
}

export default function ArAgingVisualization({
    currency,
    buckets,
    asOfLabel,
    loading,
    totalReceivable,
}: {
    currency: string
    buckets?: ArAgingBuckets | null
    asOfLabel: string
    loading?: boolean
    totalReceivable?: string
}) {
    const receivableTotal =
        totalReceivable != null
            ? num(totalReceivable)
            : BUCKET_META.filter((b) => !b.credit).reduce(
                  (sum, b) => sum + num(buckets?.[b.key]),
                  0,
              )

    return (
        <AdaptiveCard className="h-full" bodyClass="p-0">
            <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800/80">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            Receivables aging
                        </h3>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            Open customer debits by due-date bucket · as of {asOfLabel}
                        </p>
                    </div>
                    <motionSkeleton loading={loading}>
                        <div className="text-right">
                            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                                Total outstanding
                            </p>
                            <p className="text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                                {formatMoney(currency, String(receivableTotal))}
                            </p>
                        </div>
                    </motionSkeleton>
                </div>
            </div>
            <div className="space-y-4 p-5">
                {BUCKET_META.map((meta) => {
                    const amount = num(buckets?.[meta.key])
                    const share =
                        meta.credit || receivableTotal <= 0
                            ? 0
                            : (amount / receivableTotal) * 100
                    const width = amount > 0 ? Math.max(share, 6) : 0
                    return (
                        <div key={meta.key}>
                            <div className="flex items-baseline justify-between gap-2 text-sm">
                                <span className="text-gray-700 dark:text-gray-300">
                                    {meta.label}
                                </span>
                                <span
                                    className={classNames(
                                        'tabular-nums font-semibold',
                                        meta.credit
                                            ? 'text-violet-700 dark:text-violet-300'
                                            : amount > 0
                                              ? 'text-gray-900 dark:text-gray-100'
                                              : 'text-gray-400',
                                    )}
                                >
                                    {loading ? '…' : formatMoney(currency, String(amount))}
                                </span>
                            </div>
                            {!meta.credit ? (
                                <div
                                    className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800/80"
                                    role="presentation"
                                >
                                    <div
                                        className={classNames(
                                            'h-full rounded-full transition-all duration-500',
                                            meta.barClass,
                                            loading && 'animate-pulse opacity-40',
                                        )}
                                        style={{ width: `${width}%` }}
                                    />
                                </div>
                            ) : null}
                            {!meta.credit && amount > 0 && receivableTotal > 0 ? (
                                <p className="mt-0.5 text-[11px] tabular-nums text-gray-400">
                                    {share.toFixed(1)}% of outstanding
                                </p>
                            ) : null}
                        </div>
                    )
                })}
            </div>
        </AdaptiveCard>
    )
}

function motionSkeleton({
    loading,
    children,
}: {
    loading?: boolean
    children: ReactNode
}) {
    if (loading) {
        return (
            <div className="h-12 w-32 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
        )
    }
    return children
}