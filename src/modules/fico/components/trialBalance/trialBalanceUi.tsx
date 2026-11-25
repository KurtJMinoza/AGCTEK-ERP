'use client'

import classNames from 'classnames'
import { formatJournalMoney } from '../journal/journalUi'
import { FICO_TABLE_COL_RIGHT } from '../ficoTableUi'

export function TrialBalanceAmountCell({
    currency,
    amount,
    muted,
    emphasis,
}: {
    currency: string
    amount?: string | null
    muted?: boolean
    emphasis?: boolean
}) {
    const n = Number(amount ?? 0)
    if (!n) {
        return (
            <span className="block w-full text-right text-sm tabular-nums text-gray-300 dark:text-gray-600">
                —
            </span>
        )
    }
    return (
        <span
            className={classNames(
                'block w-full text-right text-sm tabular-nums tracking-tight',
                emphasis
                    ? 'font-semibold text-primary'
                    : muted
                      ? 'font-medium text-gray-600 dark:text-gray-300'
                      : 'font-medium text-gray-900 dark:text-gray-100',
            )}
        >
            {formatJournalMoney(currency, amount!)}
        </span>
    )
}

export const TRIAL_BALANCE_AMOUNT_COL = {
    meta: FICO_TABLE_COL_RIGHT,
    size: 118,
    minSize: 104,
} as const

export function trialBalanceAmountHeader(label: string, section?: string) {
    return (
        <span className="block w-full text-right">
            {section ? (
                <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-widest text-primary/80">
                    {section}
                </span>
            ) : null}
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {label}
            </span>
        </span>
    )
}