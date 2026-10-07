'use client'

import Link from 'next/link'
import NextActivityBadge from './NextActivityBadge'
import { OPPORTUNITY_STAGES, type Opportunity, type OpportunityPipeline } from '../types'
import { formatDate, formatEnumLabel, formatMoney } from '../utils/format'

type OpportunityBoardProps = {
    opportunities: Opportunity[]
    /** Server totals for open stages (all matching rows, not just the loaded cards). */
    pipeline: OpportunityPipeline | null
    onOpen: (opportunity: Opportunity) => void
    onOpenActivities: (opportunity: Opportunity) => void
}

/** Read-only stage columns; stage changes go through the edit dialog so the server validates them. */
export default function OpportunityBoard({
    opportunities,
    pipeline,
    onOpen,
    onOpenActivities,
}: OpportunityBoardProps) {
    return (
        <div className="flex gap-3 overflow-x-auto pb-2">
            {OPPORTUNITY_STAGES.map((stage) => {
                const rows = opportunities.filter((row) => row.stage === stage)
                const stageTotals = pipeline?.stages.find((s) => s.stage === stage)
                return (
                    <div
                        key={stage}
                        className="flex w-64 shrink-0 flex-col rounded-xl bg-gray-50 p-2 dark:bg-gray-800/60"
                    >
                        <div className="mb-2 flex items-center justify-between px-1">
                            <span className="text-sm font-semibold heading-text">
                                {formatEnumLabel(stage)}
                            </span>
                            <span className="text-xs text-gray-500">{rows.length}</span>
                        </div>
                        {stageTotals?.byCurrency.length ? (
                            <div className="mb-2 px-1 text-xs text-gray-500">
                                {stageTotals.byCurrency.map((total) => (
                                    <p key={total.currency}>
                                        Weighted{' '}
                                        <span className="font-semibold tabular-nums text-gray-700 dark:text-gray-200">
                                            {formatMoney(Number(total.weightedAmount), total.currency)}
                                        </span>
                                    </p>
                                ))}
                            </div>
                        ) : null}
                        <div className="flex flex-col gap-2">
                            {rows.map((row) => (
                                <div
                                    key={row.id}
                                    className="rounded-lg border border-gray-200 bg-white p-3 transition hover:border-primary/40 dark:border-gray-700 dark:bg-gray-900"
                                >
                                    <button
                                        type="button"
                                        className="block w-full truncate text-left text-sm font-medium hover:text-primary"
                                        onClick={() => onOpen(row)}
                                    >
                                        {row.name}
                                    </button>
                                    <Link
                                        href={`/crm/customers/${row.customerId}`}
                                        className="block truncate text-xs text-primary hover:underline"
                                    >
                                        {row.customer.companyName}
                                    </Link>
                                    <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                                        <span className="font-semibold text-gray-700 dark:text-gray-200">
                                            {formatMoney(row.amount, row.currency)}
                                        </span>
                                        <span>{formatDate(row.expectedCloseDate)}</span>
                                    </div>
                                    <div className="mt-2 flex items-center justify-between gap-2">
                                        <NextActivityBadge opportunity={row} />
                                        <button
                                            type="button"
                                            className="ml-auto text-xs text-primary hover:underline"
                                            onClick={() => onOpenActivities(row)}
                                        >
                                            Activities
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {rows.length === 0 ? (
                                <p className="px-1 py-4 text-center text-xs text-gray-400">Empty</p>
                            ) : null}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
