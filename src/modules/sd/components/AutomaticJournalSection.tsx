'use client'

import Link from 'next/link'
import {
    HiOutlineBookOpen,
    HiOutlineDocumentText,
    HiOutlineExternalLink,
    HiOutlineUser,
} from 'react-icons/hi'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import StatusBadge from '@/components/shared/StatusBadge'
import { formatOrderDateTime } from './salesOrderPresentation'
import { formatOrderPrice } from './salesOrderPresentation'

export type AutomaticJournalLine = {
    lineNumber: number
    accountCode: string
    accountName: string
    debitAmount: string
    creditAmount: string
    description: string | null
}

export type AutomaticJournalSummary = {
    id: string
    documentNumber: string | null
    documentType: string
    status: string
    postingDate: string
    currencyCode: string
    totalAmount: string
    primaryGlAccountId?: string | null
    lines?: AutomaticJournalLine[]
}

export type AutomaticAccountingEvent = {
    id: string
    eventType: string
    status: string
    lastError?: string | null
    lastErrorCode?: string | null
}

export type ArDocumentSummary = {
    id: string
    documentType: string
    status: string
    referenceNumber: string | null
    journalEntryId: string | null
    receivableAmount: string
}

export type AutomaticJournalSectionProps = {
    loading: boolean
    error: string | null
    companyId: string | null
    journals: AutomaticJournalSummary[]
    inventoryJournals?: AutomaticJournalSummary[]
    arDocuments?: ArDocumentSummary[]
    salesInvoiceId?: string | null
    accountingEvents: AutomaticAccountingEvent[]
    performerLabel: string
    performerName: string | null
    performerEmployeeCode: string | null
    secondaryPerformer?: {
        label: string
        name: string | null
        employeeCode: string | null
    }
    emptyHint?: string
    onRetryPosting?: () => void
    retrying?: boolean
    showPostingErrors?: boolean
}

const statusTone = (status: string) => {
    if (status === 'POSTED') return 'success' as const
    if (status === 'FAILED' || status === 'CANCELLED') return 'danger' as const
    if (status === 'PENDING' || status === 'DRAFT') return 'warning' as const
    return 'default' as const
}

const lineMoney = (value: string, currency: string) => {
    const n = Number(value)
    if (!Number.isFinite(n) || n <= 0) return '—'
    return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function AutomaticJournalSection({
    loading,
    error,
    companyId,
    journals,
    inventoryJournals = [],
    arDocuments = [],
    salesInvoiceId = null,
    accountingEvents,
    performerLabel,
    performerName,
    performerEmployeeCode,
    secondaryPerformer,
    emptyHint,
    onRetryPosting,
    retrying = false,
    showPostingErrors = false,
}: AutomaticJournalSectionProps) {
    const revenueJournal =
        journals.find((row) => row.documentType === 'SD_REVENUE') ?? journals[0]

    return (
        <section className="mt-4 rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/30">
            <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h6 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                        <HiOutlineDocumentText className="text-base text-primary" />
                        Automatic journal entry
                    </h6>
                    {revenueJournal?.primaryGlAccountId && companyId ? (
                        <Link
                            href={`/modules/fico/general-ledger?glAccountId=${encodeURIComponent(revenueJournal.primaryGlAccountId)}`}
                        >
                            <Button size="xs" variant="plain" icon={<HiOutlineBookOpen />}>
                                General ledger
                            </Button>
                        </Link>
                    ) : revenueJournal ? (
                        <Link href={`/modules/fico/journal-entries/${revenueJournal.id}`}>
                            <Button size="xs" variant="plain" icon={<HiOutlineBookOpen />}>
                                Journal reference
                            </Button>
                        </Link>
                    ) : null}
                </div>
            </div>

            <div className="space-y-4 px-4 py-4 sm:px-5">
                <div className="flex flex-wrap gap-4">
                    <div className="flex min-w-[12rem] flex-1 items-start gap-2 rounded-xl border border-gray-100 bg-gray-50/80 p-3 dark:border-gray-800 dark:bg-gray-800/40">
                        <HiOutlineUser className="mt-0.5 text-base text-gray-500" />
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                                {performerLabel}
                            </p>
                            <p className="mt-1 text-sm font-semibold heading-text">
                                {performerName ?? '—'}
                            </p>
                            {performerEmployeeCode ? (
                                <p className="mt-0.5 font-mono text-xs text-gray-500">
                                    {performerEmployeeCode}
                                </p>
                            ) : null}
                        </div>
                    </div>
                    {secondaryPerformer ? (
                        <div className="flex min-w-[12rem] flex-1 items-start gap-2 rounded-xl border border-gray-100 bg-gray-50/80 p-3 dark:border-gray-800 dark:bg-gray-800/40">
                            <HiOutlineUser className="mt-0.5 text-base text-gray-500" />
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                                    {secondaryPerformer.label}
                                </p>
                                <p className="mt-1 text-sm font-semibold heading-text">
                                    {secondaryPerformer.name ?? '—'}
                                </p>
                                {secondaryPerformer.employeeCode ? (
                                    <p className="mt-0.5 font-mono text-xs text-gray-500">
                                        {secondaryPerformer.employeeCode}
                                    </p>
                                ) : null}
                            </div>
                        </div>
                    ) : null}
                </div>

                {loading ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Spinner size={18} />
                        Loading posted journals…
                    </div>
                ) : error ? (
                    <p className="text-sm text-amber-700 dark:text-amber-300">{error}</p>
                ) : !revenueJournal ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {emptyHint ??
                            'No automatic journal yet. Posting runs when the sale completes and company accounting is active.'}
                    </p>
                ) : (
                    <>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <p className="font-mono text-sm font-bold heading-text">
                                    {revenueJournal.documentNumber ?? '—'}
                                </p>
                                <p className="mt-0.5 text-xs text-gray-500">
                                    {revenueJournal.documentType.replace(/_/g, ' ')} ·{' '}
                                    {formatOrderDateTime(revenueJournal.postingDate)}
                                </p>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <StatusBadge tone={statusTone(revenueJournal.status)}>
                                        {revenueJournal.status}
                                    </StatusBadge>
                                    <span className="text-sm tabular-nums text-gray-700 dark:text-gray-200">
                                        {formatOrderPrice(Number(revenueJournal.totalAmount))}
                                    </span>
                                </div>
                            </div>
                            <Link
                                href={`/modules/fico/journal-entries/${revenueJournal.id}`}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                            >
                                View full journal
                                <HiOutlineExternalLink />
                            </Link>
                        </div>

                        {revenueJournal.lines && revenueJournal.lines.length > 0 ? (
                            <div className="-mx-1 overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-gray-200 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:border-gray-700">
                                            <th className="px-2 py-2">#</th>
                                            <th className="px-2 py-2">G/L account</th>
                                            <th className="px-2 py-2 text-right">Debit</th>
                                            <th className="px-2 py-2 text-right">Credit</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {revenueJournal.lines.map((line) => (
                                            <tr key={line.lineNumber}>
                                                <td className="px-2 py-2 tabular-nums text-gray-500">
                                                    {line.lineNumber}
                                                </td>
                                                <td className="px-2 py-2">
                                                    <span className="font-mono text-xs text-primary">
                                                        {line.accountCode}
                                                    </span>
                                                    <span className="mt-0.5 block text-xs text-gray-600 dark:text-gray-300">
                                                        {line.accountName}
                                                    </span>
                                                    {line.description ? (
                                                        <span className="mt-0.5 block text-[11px] text-gray-400">
                                                            {line.description}
                                                        </span>
                                                    ) : null}
                                                </td>
                                                <td className="px-2 py-2 text-right tabular-nums">
                                                    {lineMoney(
                                                        line.debitAmount,
                                                        revenueJournal.currencyCode,
                                                    )}
                                                </td>
                                                <td className="px-2 py-2 text-right tabular-nums">
                                                    {lineMoney(
                                                        line.creditAmount,
                                                        revenueJournal.currencyCode,
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : null}
                    </>
                )}

                {accountingEvents.length > 0 ? (
                    <div className="border-t border-dashed border-gray-200 pt-3 dark:border-gray-700">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                            Accounting events
                        </p>
                        <ul className="mt-2 space-y-1.5 text-xs">
                            {accountingEvents.slice(0, 4).map((ev) => (
                                <li key={ev.id} className="space-y-1">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="font-medium text-gray-700 dark:text-gray-200">
                                            {ev.eventType}
                                        </span>
                                        <StatusBadge tone={statusTone(ev.status)}>
                                            {ev.status}
                                        </StatusBadge>
                                    </div>
                                    {showPostingErrors && ev.lastError ? (
                                        <p className="text-[11px] text-red-600 dark:text-red-300">
                                            {ev.lastError}
                                        </p>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                        {onRetryPosting &&
                        accountingEvents.some((ev) =>
                            ['FAILED', 'RETRY_SCHEDULED', 'DEAD_LETTER'].includes(
                                ev.status,
                            ),
                        ) ? (
                            <Button
                                className="mt-2"
                                size="xs"
                                variant="solid"
                                loading={retrying}
                                onClick={onRetryPosting}
                            >
                                Retry posting
                            </Button>
                        ) : null}
                    </div>
                ) : null}

                {journals.length > 1 ? (
                    <p className="text-[11px] text-gray-500">
                        {journals.length} related journals (inventory, collections, reversals, …).
                    </p>
                ) : null}

                {inventoryJournals.length > 0 ? (
                    <div className="border-t border-dashed border-gray-200 pt-3 dark:border-gray-700">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                            COGS / inventory (MM)
                        </p>
                        <ul className="mt-2 space-y-2 text-xs">
                            {inventoryJournals.map((row) => (
                                <li
                                    key={row.id}
                                    className="flex flex-wrap items-center justify-between gap-2"
                                >
                                    <span className="font-mono font-semibold">
                                        {row.documentNumber ?? row.id.slice(0, 8)}
                                    </span>
                                    <Link
                                        href={`/modules/fico/journal-entries/${row.id}`}
                                        className="text-primary hover:underline"
                                    >
                                        View journal
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : null}

                {arDocuments.length > 0 ? (
                    <div className="border-t border-dashed border-gray-200 pt-3 dark:border-gray-700">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                            Accounts receivable
                        </p>
                        <ul className="mt-2 space-y-2 text-xs">
                            {arDocuments.map((doc) => (
                                <li
                                    key={doc.id}
                                    className="flex flex-wrap items-center justify-between gap-2"
                                >
                                    <span>
                                        {doc.documentType.replace(/_/g, ' ')} ·{' '}
                                        {doc.referenceNumber ?? doc.id.slice(0, 8)}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        {doc.journalEntryId ? (
                                            <Link
                                                href={`/modules/fico/journal-entries/${doc.journalEntryId}`}
                                                className="text-primary hover:underline"
                                            >
                                                Journal
                                            </Link>
                                        ) : null}
                                        <Link
                                            href="/modules/fico/accounts-receivable"
                                            className="text-primary hover:underline"
                                        >
                                            AR workbench
                                        </Link>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : null}

                {salesInvoiceId ? (
                    <p className="text-[11px] text-gray-500">
                        SD billing document linked. Invoice-driven revenue posts at delivery (POD)
                        unless the sale was settled at the register.
                    </p>
                ) : null}
            </div>
        </section>
    )
}