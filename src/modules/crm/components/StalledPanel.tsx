'use client'

import Link from 'next/link'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import StatusBadge from '@/components/shared/StatusBadge'
import type { CrmStalled } from '../types'
import { opportunityHref } from '../utils/deepLinks'
import { crmTone, formatDate, formatEnumLabel, formatMoney } from '../utils/format'

/** Open deals past the stage-age threshold (default 14 days). */
export default function StalledPanel({
    data,
    loading,
    error,
}: {
    data: CrmStalled | null
    loading: boolean
    error: string | null
}) {
    const threshold = data?.thresholdDays ?? 14

    return (
        <AdaptiveCard className="mb-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                    <h5>Stalled opportunities</h5>
                    <p className="text-xs text-gray-500">
                        Open deals in the same stage for more than {threshold} days
                    </p>
                </div>
                {data ? <StatusBadge tone={data.count ? 'danger' : 'default'}>{data.count}</StatusBadge> : null}
            </div>

            {error ? (
                <p className="text-sm text-rose-600">{error}</p>
            ) : loading && !data ? (
                <p className="text-sm text-gray-500">Loading…</p>
            ) : data ? (
                data.items.length === 0 ? (
                    <p className="py-4 text-center text-sm text-gray-500">
                        No stalled opportunities.
                    </p>
                ) : (
                    <ul className="space-y-1">
                        {data.items.map((opp) => (
                            <li key={opp.id}>
                                <Link
                                    href={opportunityHref(opp.id)}
                                    className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium heading-text">
                                            {opp.name}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                            <StatusBadge tone={crmTone(opp.stage)}>
                                                {formatEnumLabel(opp.stage)}
                                            </StatusBadge>
                                            {opp.expectedCloseDate
                                                ? ` · close ${formatDate(opp.expectedCloseDate)}`
                                                : ''}
                                            {` · since ${formatDate(opp.stageEnteredAt)}`}
                                        </p>
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <p className="text-sm tabular-nums">
                                            {opp.amount
                                                ? formatMoney(Number(opp.amount), opp.currency)
                                                : '—'}
                                        </p>
                                        <StatusBadge tone="danger">
                                            {opp.daysInStage}d
                                        </StatusBadge>
                                    </div>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )
            ) : (
                <p className="text-sm text-gray-500">Stalled list unavailable.</p>
            )}
        </AdaptiveCard>
    )
}
