'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Input from '@/components/ui/Input'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import StatusBadge from '@/components/shared/StatusBadge'
import useResourceAccess from '@/utils/hooks/useResourceAccess'
import {
    notifyError,
    notifySuccess,
} from './FicoCompanySelect'
import JournalEntrySourceCard from './JournalEntrySourceCard'
import { useJournalEntry } from '../hooks/useJournalEntry'
import { useJournalEntryMutations } from '../hooks/useJournalEntries'
import { ficoErrorMessage } from '../services/ficoService'
import type { FicoJournalEntryStatus } from '../types'
import { isAutomatedJournal } from '../utils/journalSourceLinks'

const ROUTE = '/modules/fico/journal-entries'

const money = (value: number) =>
    value.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })

const tone = (status: FicoJournalEntryStatus) =>
    status === 'POSTED'
        ? 'success'
        : status === 'REVERSED'
          ? 'warning'
          : status === 'LEGACY'
            ? 'default'
            : 'info'

type Props = {
    entryId: string | null
    companyId: string | undefined
    companyLabel: string
    onMutated?: () => void
}

export default function JournalEntryPreviewPanel({
    entryId,
    companyId,
    companyLabel,
    onMutated,
}: Props) {
    const access = useResourceAccess('fico.journal-entries')
    const state = useJournalEntry(entryId || '', companyId)
    const mutations = useJournalEntryMutations(async () => {
        await state.reload()
        await onMutated?.()
    })
    const [error, setError] = useState<string | null>(null)
    const [reverseOpen, setReverseOpen] = useState(false)
    const [reverseReason, setReverseReason] = useState('')
    const entry = state.data

    const totals = useMemo(() => {
        if (!entry?.lines?.length) return { debit: 0, credit: 0 }
        return entry.lines.reduce(
            (sum, line) => ({
                debit: sum.debit + Number(line.debitAmount),
                credit: sum.credit + Number(line.creditAmount),
            }),
            { debit: 0, credit: 0 },
        )
    }, [entry])
    const balanced = Math.abs(totals.debit - totals.credit) < 0.00001

    const post = async () => {
        if (!entryId) return
        setError(null)
        try {
            await mutations.post(entryId)
            notifySuccess('Journal entry posted.')
        } catch (err) {
            const message = ficoErrorMessage(err, 'Posting failed')
            setError(message)
            notifyError(err, message)
        }
    }

    const confirmReverse = async () => {
        if (!entry || !companyId) return
        if (reverseReason.trim().length < 3) {
            setError('A reversal reason of at least 3 characters is required.')
            return
        }
        setError(null)
        try {
            const result = await mutations.reverse(entry.id, {
                companyId: entry.companyId || companyId,
                reason: reverseReason.trim(),
            })
            setReverseOpen(false)
            setReverseReason('')
            notifySuccess(
                result.reversalDocumentNumber
                    ? `Reversal posted as ${result.reversalDocumentNumber}.`
                    : 'Journal entry reversed.',
            )
        } catch (err) {
            const message = ficoErrorMessage(err, 'Reversal failed')
            setError(message)
            notifyError(err, message)
        }
    }

    if (!entryId) {
        return (
            <AdaptiveCard className="flex h-full min-h-[24rem] items-center justify-center">
                <p className="text-sm text-gray-500">
                    Select a journal to preview
                </p>
            </AdaptiveCard>
        )
    }

    if (!companyId) {
        return (
            <AdaptiveCard>
                <p className="p-4 text-sm text-gray-500">
                    Select a company to load the journal preview.
                </p>
            </AdaptiveCard>
        )
    }

    if (state.loading && !entry) {
        return <AdaptiveCard>Loading journal preview…</AdaptiveCard>
    }

    if (state.error && !entry) {
        return (
            <AdaptiveCard>
                <Alert showIcon type="danger">
                    {state.error}
                </Alert>
            </AdaptiveCard>
        )
    }

    if (!entry) {
        return (
            <AdaptiveCard className="flex h-full min-h-[24rem] items-center justify-center">
                <p className="text-sm text-gray-500">
                    Select a journal to preview
                </p>
            </AdaptiveCard>
        )
    }

    const legacyEmpty =
        entry.status === 'LEGACY' && (!entry.lines || entry.lines.length === 0)

    return (
        <>
            <AdaptiveCard className="mb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-lg font-semibold">
                                {entry.documentNumber?.trim() ||
                                    (entry.status === 'DRAFT'
                                        ? 'Draft'
                                        : '—')}
                            </h4>
                            <StatusBadge tone={tone(entry.status)}>
                                {entry.status}
                            </StatusBadge>
                        </div>
                        <p className="mt-1 text-sm text-gray-500">
                            {entry.documentTypeRef
                                ? `${entry.documentTypeRef.code} — ${entry.documentTypeRef.name}`
                                : entry.documentType}
                            {!isAutomatedJournal(entry) ? ' · Manual' : ''}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Link href={`${ROUTE}/${entry.id}`}>
                            <Button size="sm">Open full page</Button>
                        </Link>
                        {entry.status === 'DRAFT' && access.canUpdate && (
                            <Button
                                size="sm"
                                variant="solid"
                                loading={mutations.saving}
                                onClick={() => void post()}
                            >
                                Post
                            </Button>
                        )}
                        {entry.status === 'POSTED' &&
                            !entry.reversedBy &&
                            access.canUpdate && (
                                <Button
                                    size="sm"
                                    variant="solid"
                                    loading={mutations.saving}
                                    onClick={() => {
                                        setReverseReason('')
                                        setReverseOpen(true)
                                    }}
                                >
                                    Reverse
                                </Button>
                            )}
                    </div>
                </div>
            </AdaptiveCard>

            {(state.error || error) && (
                <Alert showIcon type="danger" className="mb-3">
                    {state.error || error}
                </Alert>
            )}
            {entry.status === 'POSTED' && (
                <Alert showIcon type="info" className="mb-3">
                    Posted documents are immutable; corrections are recorded
                    through reversal.
                </Alert>
            )}
            {legacyEmpty && (
                <Alert showIcon type="info" className="mb-3">
                    This is a header-only legacy stub. Line detail is not
                    available for LEGACY documents.
                    {entry.mmAccountingEventId || entry.sourceEventId
                        ? ' Use Open event on the source card when an accounting event id exists.'
                        : ''}
                </Alert>
            )}

            <div className="mb-3">
                <JournalEntrySourceCard entry={entry} />
            </div>

            <AdaptiveCard className="mb-3">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <Fact label="Company">{companyLabel}</Fact>
                    <Fact label="Posting date">
                        {new Date(entry.postingDate).toLocaleDateString()}
                    </Fact>
                    <Fact label="Document date">
                        {entry.documentDate
                            ? new Date(entry.documentDate).toLocaleDateString()
                            : '—'}
                    </Fact>
                    <Fact label="Currency">{entry.currencyCode}</Fact>
                    <Fact label="Period">
                        {entry.fiscalPeriod
                            ? `${entry.fiscalPeriod.name} (${entry.fiscalPeriod.status})`
                            : entry.fiscalYear ?? '—'}
                    </Fact>
                    <Fact label="Balance">
                        <span
                            className={
                                balanced ? 'text-emerald-600' : 'text-red-600'
                            }
                        >
                            {balanced ? 'Balanced' : 'Unbalanced'}
                        </span>
                    </Fact>
                    <Fact label="Reference">{entry.reference || '—'}</Fact>
                    <Fact label="Header text">
                        {entry.headerText || entry.description || '—'}
                    </Fact>
                    {entry.reversalOf ? (
                        <Fact label="Reverses">
                            <Link
                                className="text-primary"
                                href={`${ROUTE}/${entry.reversalOf.id}`}
                            >
                                {entry.reversalOf.documentNumber ||
                                    entry.reversalOf.id}
                            </Link>
                        </Fact>
                    ) : null}
                    {entry.reversedBy ? (
                        <Fact label="Reversed by">
                            <Link
                                className="text-primary"
                                href={`${ROUTE}/${entry.reversedBy.id}`}
                            >
                                {entry.reversedBy.documentNumber ||
                                    entry.reversedBy.id}
                            </Link>
                        </Fact>
                    ) : null}
                </div>
            </AdaptiveCard>

            <AdaptiveCard>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-sm">
                        <thead>
                            <tr className="border-b text-left">
                                <th className="p-2">#</th>
                                <th className="p-2">G/L Account</th>
                                <th className="p-2">Text</th>
                                <th className="p-2 text-right">Debit</th>
                                <th className="p-2 text-right">Credit</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(entry.lines ?? []).map((line) => (
                                <tr key={line.id} className="border-b">
                                    <td className="p-2">{line.lineNumber}</td>
                                    <td className="p-2">
                                        {line.glAccount
                                            ? `${line.glAccount.accountCode} — ${line.glAccount.accountName}`
                                            : line.glAccountId}
                                    </td>
                                    <td className="p-2">
                                        {line.description || '—'}
                                    </td>
                                    <td className="p-2 text-right">
                                        {money(Number(line.debitAmount))}
                                    </td>
                                    <td className="p-2 text-right">
                                        {money(Number(line.creditAmount))}
                                    </td>
                                </tr>
                            ))}
                            {(entry.lines ?? []).length === 0 && (
                                <tr>
                                    <td
                                        colSpan={5}
                                        className="p-4 text-center text-gray-500"
                                    >
                                        No lines on this document.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                        <tfoot>
                            <tr className="font-semibold">
                                <td colSpan={3} className="p-2 text-right">
                                    Totals
                                </td>
                                <td className="p-2 text-right">
                                    {money(totals.debit)}
                                </td>
                                <td className="p-2 text-right">
                                    {money(totals.credit)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </AdaptiveCard>

            <Dialog
                isOpen={reverseOpen}
                onClose={() => setReverseOpen(false)}
                onRequestClose={() => setReverseOpen(false)}
            >
                <h4 className="mb-2 text-lg font-semibold">Reverse journal</h4>
                <p className="mb-4 text-sm text-gray-600">
                    Reversing{' '}
                    <strong>{entry.documentNumber || entry.id}</strong> posts an
                    opposite document. Posted lines stay immutable.
                </p>
                <label className="mb-4 block text-sm">
                    Reason
                    <Input
                        className="mt-1"
                        value={reverseReason}
                        onChange={(event) =>
                            setReverseReason(event.target.value)
                        }
                        placeholder="Why is this entry being reversed?"
                    />
                </label>
                <div className="flex justify-end gap-2">
                    <Button onClick={() => setReverseOpen(false)}>
                        Cancel
                    </Button>
                    <Button
                        variant="solid"
                        loading={mutations.saving}
                        disabled={reverseReason.trim().length < 3}
                        onClick={() => void confirmReverse()}
                    >
                        Confirm reverse
                    </Button>
                </div>
            </Dialog>
        </>
    )
}

function Fact({
    label,
    children,
}: {
    label: string
    children: React.ReactNode
}) {
    return (
        <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                {label}
            </div>
            <div className="mt-0.5 break-words text-sm font-medium text-gray-900 dark:text-gray-100">
                {children}
            </div>
        </div>
    )
}
