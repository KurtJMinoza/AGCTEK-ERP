'use client'

import classNames from 'classnames'
import StatusBadge from '@/components/shared/StatusBadge'
import { formatJournalMoney } from './journal/journalUi'

/** Account-ledger page subtotals — debits vs credits on one G/L account are not expected to match. */
export function FicoLedgerPageTotals({
    currency,
    debit,
    credit,
    lineCount,
}: {
    currency: string
    debit: string
    credit: string
    lineCount: number
}) {
    const d = Number(debit)
    const c = Number(credit)
    const net = d - c
    const netLabel = net >= 0 ? 'Net debit' : 'Net credit'
    const netAmount = Math.abs(net).toFixed(2)

    return (
        <div
            className={classNames(
                'flex flex-col gap-2 rounded-xl border border-gray-200/90 bg-gray-50/50 px-3 py-2.5',
                'sm:flex-row sm:items-center sm:gap-0 sm:divide-x sm:divide-gray-200/90 sm:px-0',
                'dark:border-gray-700 dark:bg-gray-800/30 dark:divide-gray-700/80',
            )}
        >
            <div className="flex flex-1 flex-col sm:px-4">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Page debit
                </span>
                <span className="text-base font-semibold tabular-nums text-gray-900 dark:text-gray-50">
                    {formatJournalMoney(currency, debit)}
                </span>
            </div>
            <div className="flex flex-1 flex-col sm:px-4">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Page credit
                </span>
                <span className="text-base font-semibold tabular-nums text-gray-900 dark:text-gray-50">
                    {formatJournalMoney(currency, credit)}
                </span>
            </div>
            <div className="flex flex-1 flex-col sm:px-4">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {netLabel}
                </span>
                <span className="text-base font-semibold tabular-nums text-primary">
                    {formatJournalMoney(currency, netAmount)}
                </span>
            </div>
            <div className="flex items-center sm:px-4 sm:pl-5">
                <StatusBadge tone="info">{lineCount} lines</StatusBadge>
            </div>
        </div>
    )
}

function diffBalanced(amount?: string) {
    return Math.abs(Number(amount ?? 0)) < 0.005
}

export function FicoTrialBalanceTotalsTable({
    currency,
    loading,
    rows,
}: {
    currency: string
    loading?: boolean
    rows: Array<{
        key: string
        section: string
        debit: string
        credit: string
        difference?: string
    }>
}) {
    return (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
            <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                    <tr className="border-b border-gray-200 bg-gray-50/90 text-left dark:border-gray-700 dark:bg-gray-800/50">
                        <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                            Section
                        </th>
                        <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                            Debit
                        </th>
                        <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                            Credit
                        </th>
                        <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                            Difference
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => {
                        const balanced = diffBalanced(row.difference)
                        return (
                            <tr
                                key={row.key}
                                className={classNames(
                                    'border-b border-gray-100 last:border-0 dark:border-gray-800',
                                    'motion-safe:animate-mm-row-in motion-reduce:animate-none',
                                    index % 2 === 1 &&
                                        'bg-gray-50/40 dark:bg-gray-800/20',
                                )}
                                style={{ animationDelay: `${index * 40}ms` }}
                            >
                                <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                                    {row.section}
                                </td>
                                <td className="px-4 py-3 text-right font-medium tabular-nums text-gray-800 dark:text-gray-200">
                                    {loading
                                        ? '—'
                                        : formatJournalMoney(currency, row.debit)}
                                </td>
                                <td className="px-4 py-3 text-right font-medium tabular-nums text-gray-800 dark:text-gray-200">
                                    {loading
                                        ? '—'
                                        : formatJournalMoney(currency, row.credit)}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    {loading ? (
                                        '—'
                                    ) : (
                                        <div className="inline-flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                                            <span className="font-medium tabular-nums text-gray-800 dark:text-gray-200">
                                                {formatJournalMoney(
                                                    currency,
                                                    row.difference ?? '0',
                                                )}
                                            </span>
                                            <StatusBadge
                                                tone={balanced ? 'success' : 'danger'}
                                            >
                                                {balanced ? 'Balanced' : 'Variance'}
                                            </StatusBadge>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}