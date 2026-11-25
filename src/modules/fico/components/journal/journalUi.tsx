'use client'

import classNames from 'classnames'
import StatusBadge from '@/components/shared/StatusBadge'
import type { FicoBadgeTone } from '../ficoTableUi'

const POSTING_STATUS_TONE: Record<string, FicoBadgeTone> = {
    DRAFT: 'default',
    POSTED: 'success',
    REVERSED: 'info',
    CANCELLED: 'warning',
    LEGACY: 'default',
}

const APPROVAL_STATUS_TONE: Record<string, FicoBadgeTone> = {
    DRAFT: 'default',
    PENDING_APPROVAL: 'warning',
    APPROVED: 'success',
    REJECTED: 'danger',
    NOT_REQUIRED: 'info',
    POSTED: 'success',
    REVERSED: 'info',
}

export const JOURNAL_TABS = [
    { id: 'all', label: 'All Journals' },
    { id: 'manual', label: 'Manual' },
    { id: 'my-drafts', label: 'My Drafts' },
    { id: 'posted', label: 'Posted' },
    { id: 'reversed', label: 'Reversed' },
] as const

export function JournalPostingStatus({ status }: { status: string }) {
    return (
        <StatusBadge tone={POSTING_STATUS_TONE[status] ?? 'default'}>
            {status.replace(/_/g, ' ')}
        </StatusBadge>
    )
}

export function JournalApprovalStatus({ status }: { status: string }) {
    return (
        <StatusBadge tone={APPROVAL_STATUS_TONE[status] ?? 'default'}>
            {status.replace(/_/g, ' ')}
        </StatusBadge>
    )
}

export const formatJournalDate = (value?: string | null) =>
    value ? new Date(value).toLocaleDateString() : '—'

export const formatMoney = (currency: string, amount: string) =>
    `${currency} ${amount}`

export function formatJournalMoney(currency: string, amount: string) {
    const n = Number(amount)
    if (Number.isNaN(n)) return formatMoney(currency, amount)
    return `${currency} ${n.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`
}

/** Right-aligned debit/credit cell for journal line tables. */
export function JournalAccountingLinesTotals({
    currency,
    debit,
    credit,
    balanced,
}: {
    currency: string
    debit: string
    credit: string
    balanced: boolean
}) {
    return (
        <div
            className={classNames(
                'flex flex-col gap-2 rounded-xl border px-3 py-2.5 sm:flex-row sm:items-center sm:gap-0 sm:divide-x sm:divide-gray-200/90 sm:px-0 dark:divide-gray-700/80',
                balanced
                    ? 'border-emerald-200/80 bg-gradient-to-br from-emerald-50/80 via-white to-gray-50/50 dark:border-emerald-900/40 dark:from-emerald-950/30 dark:via-gray-900/50 dark:to-gray-900/30'
                    : 'border-amber-200/80 bg-gradient-to-br from-amber-50/60 via-white to-gray-50/50 dark:border-amber-900/40 dark:from-amber-950/20 dark:via-gray-900/50 dark:to-gray-900/30',
            )}
        >
            <div className="flex flex-1 flex-col sm:px-4">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Total debit
                </span>
                <span className="text-base font-semibold tabular-nums tracking-tight text-gray-900 dark:text-gray-50">
                    {formatJournalMoney(currency, debit)}
                </span>
            </div>
            <div className="flex flex-1 flex-col sm:px-4">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Total credit
                </span>
                <span className="text-base font-semibold tabular-nums tracking-tight text-gray-900 dark:text-gray-50">
                    {formatJournalMoney(currency, credit)}
                </span>
            </div>
            <div className="flex items-center sm:px-4 sm:pl-5">
                <StatusBadge tone={balanced ? 'success' : 'danger'}>
                    {balanced ? 'Balanced' : 'Out of balance'}
                </StatusBadge>
            </div>
        </div>
    )
}

function amountColumnHeader(label: string) {
    return (
        <span className="block w-full text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {label}
        </span>
    )
}

export const journalAmountColumnHeader = {
    debit: () => amountColumnHeader('Debit'),
    credit: () => amountColumnHeader('Credit'),
}

export function JournalLineAmountCell({
    currency,
    amount,
    emphasis = false,
}: {
    currency: string
    amount?: string | null
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
                    ? 'font-semibold text-gray-900 dark:text-gray-100'
                    : 'font-medium text-gray-800 dark:text-gray-200',
            )}
        >
            {formatJournalMoney(currency, amount!)}
        </span>
    )
}

/** Parse money strings to integer minor units (4 decimal places → ×10000). */
export function toMinorUnits(value: string): bigint {
    const cleaned = value.replace(/,/g, '').trim()
    if (!cleaned) return 0n
    const [whole, frac = ''] = cleaned.split('.')
    const padded = (frac + '0000').slice(0, 4)
    return BigInt(whole || '0') * 10000n + BigInt(padded || '0')
}

export function fromMinorUnits(minor: bigint): string {
    const negative = minor < 0n
    const abs = negative ? -minor : minor
    const whole = abs / 10000n
    const frac = (abs % 10000n).toString().padStart(4, '0')
    const text = `${whole}.${frac}`.replace(/\.?0+$/, '').replace(/\.$/, '')
    return negative ? `-${text}` : text
}

/** Portals react-select menus to document.body (required inside scrollable tables). */
export const journalPortalSelectProps = {
    menuPortalTarget:
        typeof document !== 'undefined' ? document.body : undefined,
    menuPosition: 'fixed' as const,
    menuPlacement: 'auto' as const,
    maxMenuHeight: 240,
    styles: {
        menuPortal: (base: Record<string, unknown>) => ({
            ...base,
            zIndex: 9999,
        }),
        menu: (base: Record<string, unknown>) => ({
            ...base,
            minWidth: 280,
            width: 'auto',
            maxWidth: 'min(100vw - 2rem, 420px)',
        }),
    },
}

export function sumLineTotals(
    lines: Array<{ debit: string; credit: string }>,
) {
    let debit = 0n
    let credit = 0n
    for (const line of lines) {
        debit += toMinorUnits(line.debit)
        credit += toMinorUnits(line.credit)
    }
    return {
        debit: fromMinorUnits(debit),
        credit: fromMinorUnits(credit),
        difference: fromMinorUnits(debit - credit),
        balanced: debit === credit && debit > 0n,
    }
}