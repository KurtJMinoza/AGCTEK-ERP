'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { HiOutlineCash } from 'react-icons/hi'
import Button from '@/components/ui/Button'
import StatusBadge from '@/components/shared/StatusBadge'
import useResourceAccess from '@/utils/hooks/useResourceAccess'
import { ficoAccountingEventService } from '@/modules/fico/services/ficoService'
import {
    getSalesOrderAccounting,
    type SalesOrderAccounting,
    type SalesOrderAccountingJournal,
} from '../services/salesOrderDashboardService'
import { formatOrderPrice } from './salesOrderPresentation'

const JOURNAL_ROUTE = '/modules/fico/journal-entries'
const EVENT_ROUTE = '/modules/fico/gl-accounts?tab=events'

function journalStatusTone(status: string) {
    if (status === 'POSTED') return 'success'
    if (status === 'REVERSED') return 'warning'
    if (status === 'DRAFT') return 'info'
    if (status === 'LEGACY') return 'default'
    return 'default'
}

function eventStatusTone(status: string) {
    if (status === 'CONSUMED') return 'success'
    if (status === 'FAILED') return 'danger'
    return 'warning'
}

function JournalBlock({
    journal,
    showAmounts,
}: {
    journal: SalesOrderAccountingJournal
    showAmounts: boolean
}) {
    const debitTotal = journal.lines.reduce((sum, line) => sum + line.debit, 0)
    const creditTotal = journal.lines.reduce(
        (sum, line) => sum + line.credit,
        0,
    )
    const typeLabel =
        journal.documentTypeCode ||
        journal.documentTypeName ||
        journal.documentType

    return (
        <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900/40">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <Link
                            href={`${JOURNAL_ROUTE}/${journal.id}`}
                            className="font-mono text-sm font-semibold text-primary hover:underline"
                        >
                            {journal.documentNumber || journal.id.slice(0, 10)}
                        </Link>
                        <StatusBadge tone={journalStatusTone(journal.status)}>
                            {journal.status}
                        </StatusBadge>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                        {typeLabel}
                        <span className="mx-1.5 text-gray-300">·</span>
                        {new Date(journal.postingDate).toLocaleDateString()}
                        {journal.sourceModule ? (
                            <>
                                <span className="mx-1.5 text-gray-300">·</span>
                                {journal.sourceModule}
                            </>
                        ) : null}
                    </p>
                    {journal.headerText ? (
                        <p className="mt-1 text-xs text-gray-500">
                            {journal.headerText}
                        </p>
                    ) : null}
                </div>
                {journal.mmAccountingEventId ? (
                    <Link
                        href={`${EVENT_ROUTE}&eventId=${encodeURIComponent(journal.mmAccountingEventId)}`}
                        className="text-xs font-medium text-primary hover:underline"
                    >
                        Open event
                    </Link>
                ) : null}
            </div>

            {showAmounts ? (
                <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[28rem] text-sm">
                        <thead>
                            <tr className="border-b text-left text-[11px] uppercase tracking-wide text-gray-400">
                                <th className="py-1.5 pr-2">G/L account</th>
                                <th className="py-1.5 pr-2 text-right">Debit</th>
                                <th className="py-1.5 text-right">Credit</th>
                            </tr>
                        </thead>
                        <tbody>
                            {journal.lines.map((line) => (
                                <tr
                                    key={`${journal.id}-${line.lineNumber}`}
                                    className="border-b border-gray-100 dark:border-gray-800"
                                >
                                    <td className="py-1.5 pr-2">
                                        <div className="font-mono text-xs text-primary">
                                            {line.accountCode || '—'}
                                        </div>
                                        <div className="text-xs text-gray-600 dark:text-gray-300">
                                            {line.accountName ||
                                                line.description ||
                                                '—'}
                                        </div>
                                    </td>
                                    <td className="py-1.5 pr-2 text-right tabular-nums">
                                        {line.debit > 0
                                            ? formatOrderPrice(line.debit)
                                            : '—'}
                                    </td>
                                    <td className="py-1.5 text-right tabular-nums">
                                        {line.credit > 0
                                            ? formatOrderPrice(line.credit)
                                            : '—'}
                                    </td>
                                </tr>
                            ))}
                            {journal.lines.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={3}
                                        className="py-3 text-center text-xs text-gray-500"
                                    >
                                        No journal lines
                                    </td>
                                </tr>
                            ) : null}
                        </tbody>
                        {journal.lines.length > 0 ? (
                            <tfoot>
                                <tr className="text-xs font-semibold">
                                    <td className="pt-2 pr-2 text-right text-gray-500">
                                        Totals
                                    </td>
                                    <td className="pt-2 pr-2 text-right tabular-nums">
                                        {formatOrderPrice(debitTotal)}
                                    </td>
                                    <td className="pt-2 text-right tabular-nums">
                                        {formatOrderPrice(creditTotal)}
                                    </td>
                                </tr>
                            </tfoot>
                        ) : null}
                    </table>
                </div>
            ) : (
                <p className="mt-2 text-xs text-gray-500">
                    Accounting posted — amounts hidden (no FICO journal read
                    permission).
                </p>
            )}
        </div>
    )
}

type Props = {
    orderId: string
    companyId?: string | null
}

const SalesOrderAccountingSection = ({ orderId, companyId }: Props) => {
    const ficoAccess = useResourceAccess('fico.journal-entries')
    const [data, setData] = useState<SalesOrderAccounting | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [retryingId, setRetryingId] = useState<string | null>(null)

    const reload = useCallback(() => {
        setLoading(true)
        setError(null)
        return getSalesOrderAccounting(orderId, companyId ?? undefined)
            .then((result) => setData(result))
            .catch((err: unknown) => {
                setData(null)
                setError(
                    err instanceof Error
                        ? err.message
                        : 'Unable to load order accounting',
                )
            })
            .finally(() => setLoading(false))
    }, [orderId, companyId])

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(null)
        void getSalesOrderAccounting(orderId, companyId ?? undefined)
            .then((result) => {
                if (!cancelled) setData(result)
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setData(null)
                    setError(
                        err instanceof Error
                            ? err.message
                            : 'Unable to load order accounting',
                    )
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [orderId, companyId])

    const retryEvent = async (eventId: string) => {
        setRetryingId(eventId)
        setError(null)
        try {
            await ficoAccountingEventService.retry(eventId)
            await reload()
        } catch (err: unknown) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Unable to retry accounting event',
            )
        } finally {
            setRetryingId(null)
        }
    }

    const journals = data?.journals ?? []
    const events = data?.events ?? []
    const pendingOrFailed = events.filter(
        (event) =>
            (event.status === 'PENDING' || event.status === 'FAILED') &&
            !event.journalEntryId,
    )
    const showAmounts = ficoAccess.canRead

    return (
        <section className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900/30">
            <h6 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                <HiOutlineCash className="text-base" />
                Accounting
            </h6>

            {loading ? (
                <p className="text-sm text-gray-500">Loading accounting…</p>
            ) : null}

            {error ? (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            ) : null}

            {!loading && !error && journals.length === 0 && pendingOrFailed.length === 0 ? (
                <p className="text-sm text-gray-500">
                    No accounting document for this order
                </p>
            ) : null}

            {!loading && journals.length > 0 ? (
                <div className="space-y-3">
                    {journals.map((journal) => (
                        <JournalBlock
                            key={journal.id}
                            journal={journal}
                            showAmounts={showAmounts}
                        />
                    ))}
                </div>
            ) : null}

            {!loading && pendingOrFailed.length > 0 ? (
                <div className="mt-3 space-y-2">
                    {pendingOrFailed.map((event) => (
                        <div
                            key={event.id}
                            className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-sm dark:border-amber-500/30 dark:bg-amber-500/10"
                        >
                            <div className="flex flex-wrap items-center gap-2">
                                <StatusBadge tone={eventStatusTone(event.status)}>
                                    {event.status}
                                </StatusBadge>
                                <span className="text-xs text-gray-600 dark:text-gray-300">
                                    {event.sourceModule} · {event.documentType} ·{' '}
                                    {event.eventType}
                                </span>
                            </div>
                            {event.lastError ? (
                                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                                    {event.lastError}
                                </p>
                            ) : (
                                <p className="mt-1 text-xs text-gray-500">
                                    Accounting event has not produced a journal
                                    yet.
                                </p>
                            )}
                            <div className="mt-2 flex flex-wrap items-center gap-3">
                                <Link
                                    href={`${EVENT_ROUTE}&eventId=${encodeURIComponent(event.id)}`}
                                    className="text-xs font-medium text-primary hover:underline"
                                >
                                    Open posting monitor event
                                </Link>
                                {event.status === 'FAILED' &&
                                    ficoAccess.canUpdate && (
                                        <Button
                                            size="sm"
                                            loading={retryingId === event.id}
                                            onClick={() =>
                                                void retryEvent(event.id)
                                            }
                                        >
                                            Retry posting
                                        </Button>
                                    )}
                            </div>
                        </div>
                    ))}
                </div>
            ) : null}
        </section>
    )
}

export default SalesOrderAccountingSection
