'use client'

import Link from 'next/link'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import StatusBadge from '@/components/shared/StatusBadge'
import type { CrmPipelineMetrics } from '../types'
import { CRM_PATHS, crmHref } from '../utils/deepLinks'
import { crmTone, formatEnumLabel, formatMoney } from '../utils/format'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Stage funnel snapshot + period win-rate chip for CRM home. */
export default function PipelineMetricsPanel({
    data,
    loading,
    error,
    periodLabel,
}: {
    data: CrmPipelineMetrics | null
    loading: boolean
    error: string | null
    periodLabel: string
}) {
    const openCount = data?.totals.reduce((sum, t) => sum + t.count, 0) ?? 0
    const maxStageCount = Math.max(1, ...(data?.stages.map((s) => s.count) ?? [1]))

    return (
        <AdaptiveCard className="mb-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h5>Pipeline</h5>
                    <p className="text-xs text-gray-500">
                        Open opportunities by stage · win rate for {periodLabel.toLowerCase()}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={data?.winRate == null ? 'default' : 'success'}>
                        Win rate{' '}
                        {data?.winRate == null ? '—' : `${data.winRate}%`}
                    </StatusBadge>
                    {data ? (
                        <span className="text-xs text-gray-500">
                            {data.won} won · {data.lost} lost
                        </span>
                    ) : null}
                    <Link
                        href={crmHref(CRM_PATHS.opportunities, { view: 'board' })}
                        className="text-sm text-primary"
                    >
                        Open board
                    </Link>
                </div>
            </div>

            {error ? (
                <p className="text-sm text-rose-600">{error}</p>
            ) : loading && !data ? (
                <p className="text-sm text-gray-500">Loading…</p>
            ) : data ? (
                openCount === 0 ? (
                    <p className="py-4 text-center text-sm text-gray-500">
                        No open opportunities.
                    </p>
                ) : (
                    <>
                        <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1">
                            {data.totals.map((total) => (
                                <div key={total.currency}>
                                    <p className="text-2xl font-bold tabular-nums heading-text">
                                        {formatMoney(Number(total.totalAmount), total.currency)}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        {plural(total.count, 'opportunity', 'opportunities')} open
                                    </p>
                                </div>
                            ))}
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                            {data.stages.map((stage) => (
                                <Link
                                    key={stage.stage}
                                    href={crmHref(CRM_PATHS.opportunities, {
                                        stage: stage.stage,
                                    })}
                                    className="rounded-md border border-gray-100 px-3 py-2 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/40"
                                >
                                    <div className="mb-1 flex items-center justify-between gap-2">
                                        <StatusBadge tone={crmTone(stage.stage)}>
                                            {formatEnumLabel(stage.stage)}
                                        </StatusBadge>
                                        <span className="text-sm font-semibold tabular-nums heading-text">
                                            {stage.count}
                                        </span>
                                    </div>
                                    <div className="mb-2 h-1.5 overflow-hidden rounded bg-gray-100 dark:bg-gray-700">
                                        <div
                                            className="h-full rounded bg-primary/70"
                                            style={{
                                                width: `${Math.round(
                                                    (stage.count / maxStageCount) * 100,
                                                )}%`,
                                            }}
                                        />
                                    </div>
                                    <p className="truncate text-xs text-gray-500">
                                        {stage.byCurrency.length === 0
                                            ? '—'
                                            : stage.byCurrency
                                                  .map((c) =>
                                                      formatMoney(
                                                          Number(c.totalAmount),
                                                          c.currency,
                                                      ),
                                                  )
                                                  .join(' · ')}
                                    </p>
                                </Link>
                            ))}
                        </div>
                    </>
                )
            ) : (
                <p className="text-sm text-gray-500">Pipeline unavailable.</p>
            )}
        </AdaptiveCard>
    )
}
