'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Input from '@/components/ui/Input'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Breadcrumb from '@/components/shared/Breadcrumb'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import ErpBackLink from '@/components/erp/ErpBackLink'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import useResourceAccess from '@/utils/hooks/useResourceAccess'
import {
    notifyError,
    notifySuccess,
    useFicoCompanies,
} from '../components/FicoCompanySelect'
import { ficoErrorMessage } from '../services/ficoService'
import { useJournalEntry } from '../hooks/useJournalEntry'
import { useJournalEntryMutations } from '../hooks/useJournalEntries'
import type { FicoJournalEntryStatus } from '../types'

const ROUTE = '/modules/fico/journal-entries'

const tone = (status: FicoJournalEntryStatus) =>
    status === 'POSTED'
        ? 'success'
        : status === 'REVERSED'
          ? 'warning'
          : status === 'LEGACY'
            ? 'default'
            : 'info'

export default function JournalEntryDetailPage() {
    const params = useParams<{ id: string }>()
    const { companies, companyId } = useFicoCompanies()
    const state = useJournalEntry(params.id, companyId)
    const mutations = useJournalEntryMutations(state.reload)
    const access = useResourceAccess('fico.journal-entries')
    const [error, setError] = useState<string | null>(null)
    const [reverseOpen, setReverseOpen] = useState(false)
    const [reverseReason, setReverseReason] = useState('')
    const entry = state.data
    const companyLabel =
        companies.find(
            (company) => company.id === (entry?.companyId || companyId),
        )?.name ??
        entry?.companyId ??
        '—'
    const breadcrumbs = buildErpBreadcrumbs(
        ROUTE,
        entry?.documentNumber
            ? { detailLabel: entry.documentNumber }
            : undefined,
    )

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
        setError(null)
        try {
            await mutations.post(params.id)
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

    const sourceLabel = entry?.sourceModule
        ? `MM${entry.mmAccountingEventId ? ` · ${entry.mmAccountingEventId}` : entry.sourceEventId ? ` · ${entry.sourceEventId}` : ''}`
        : 'Manual'

    return (
        <PageContainer>
            <ErpBackLink items={breadcrumbs} />
            <Breadcrumb items={breadcrumbs} className="mb-4" />
            <PageHeader
                title={entry?.documentNumber || 'Journal Entry'}
                description={
                    entry?.status === 'POSTED'
                        ? 'Posted documents are immutable; corrections are recorded through reversal.'
                        : entry?.status === 'DRAFT'
                          ? 'Draft journal — post when ready.'
                          : 'Journal entry details'
                }
                actions={
                    <div className="flex gap-2">
                        <Link href={ROUTE}>
                            <Button>Back to list</Button>
                        </Link>
                        {entry?.status === 'DRAFT' && access.canUpdate && (
                            <Button
                                variant="solid"
                                loading={mutations.saving}
                                onClick={() => void post()}
                            >
                                Post
                            </Button>
                        )}
                        {entry?.status === 'POSTED' &&
                            !entry.reversedBy &&
                            access.canUpdate && (
                                <Button
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
                }
            />
            {(state.error || error) && (
                <Alert showIcon type="danger" className="mb-4">
                    {state.error || error}
                </Alert>
            )}
            {entry?.status === 'POSTED' && (
                <Alert showIcon type="info" className="mb-4">
                    Posted documents are immutable; corrections are recorded
                    through reversal.
                </Alert>
            )}
            {entry?.status === 'REVERSED' && (
                <Alert showIcon type="warning" className="mb-4">
                    This document has been reversed
                    {entry.reversedBy
                        ? ` by ${entry.reversedBy.documentNumber || entry.reversedBy.id}`
                        : ''}
                    . It is view-only.
                </Alert>
            )}
            {entry?.status === 'LEGACY' &&
                (!entry.lines || entry.lines.length === 0) && (
                    <Alert showIcon type="info" className="mb-4">
                        This is a header-only legacy stub. Line detail is not
                        available for LEGACY documents.
                    </Alert>
                )}
            {state.loading && !entry ? (
                <AdaptiveCard>Loading journal entry…</AdaptiveCard>
            ) : !companyId ? (
                <AdaptiveCard>
                    Select a company context to load this journal entry.
                </AdaptiveCard>
            ) : (
                entry && (
                    <>
                        <AdaptiveCard className="mb-4">
                            <div className="grid gap-4 md:grid-cols-4">
                                <Value label="Status">
                                    <StatusBadge tone={tone(entry.status)}>
                                        {entry.status}
                                    </StatusBadge>
                                </Value>
                                <Value label="Document Type">
                                    {entry.documentTypeRef
                                        ? `${entry.documentTypeRef.code} — ${entry.documentTypeRef.name}`
                                        : entry.documentType || '—'}
                                </Value>
                                <Value label="Posting Date">
                                    {new Date(
                                        entry.postingDate,
                                    ).toLocaleDateString()}
                                </Value>
                                <Value label="Document Date">
                                    {entry.documentDate
                                        ? new Date(
                                              entry.documentDate,
                                          ).toLocaleDateString()
                                        : '—'}
                                </Value>
                                <Value label="Company">{companyLabel}</Value>
                                <Value label="Currency">
                                    {entry.currencyCode}
                                </Value>
                                <Value label="Fiscal Year">
                                    {entry.fiscalYear ??
                                        entry.fiscalPeriod?.fiscalYear ??
                                        '—'}
                                </Value>
                                <Value label="Period">
                                    {entry.fiscalPeriod
                                        ? `${entry.fiscalPeriod.name} (${entry.fiscalPeriod.status})`
                                        : '—'}
                                </Value>
                                <Value label="Reference">
                                    {entry.reference || '—'}
                                </Value>
                                <Value label="Header Text">
                                    {entry.headerText ||
                                        entry.description ||
                                        '—'}
                                </Value>
                                <Value label="Source">{sourceLabel}</Value>
                                <Value label="Balance">
                                    <span
                                        className={
                                            balanced
                                                ? 'text-emerald-600'
                                                : 'text-red-600'
                                        }
                                    >
                                        {balanced ? 'Balanced' : 'Unbalanced'}
                                    </span>
                                </Value>
                                {entry.reversalOf && (
                                    <Value label="Reverses">
                                        <Link
                                            className="text-primary"
                                            href={`${ROUTE}/${entry.reversalOf.id}`}
                                        >
                                            {entry.reversalOf.documentNumber ||
                                                entry.reversalOf.id}
                                        </Link>
                                    </Value>
                                )}
                                {entry.reversedBy && (
                                    <Value label="Reversed By">
                                        <Link
                                            className="text-primary"
                                            href={`${ROUTE}/${entry.reversedBy.id}`}
                                        >
                                            {entry.reversedBy.documentNumber ||
                                                entry.reversedBy.id}
                                        </Link>
                                    </Value>
                                )}
                            </div>
                        </AdaptiveCard>
                        <AdaptiveCard>
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[700px] text-sm">
                                    <thead>
                                        <tr className="border-b text-left">
                                            <th className="p-3">Line</th>
                                            <th className="p-3">G/L Account</th>
                                            <th className="p-3">Text</th>
                                            <th className="p-3 text-right">
                                                Debit
                                            </th>
                                            <th className="p-3 text-right">
                                                Credit
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(entry.lines ?? []).map((line) => (
                                            <tr
                                                key={line.id}
                                                className="border-b"
                                            >
                                                <td className="p-3">
                                                    {line.lineNumber}
                                                </td>
                                                <td className="p-3">
                                                    {line.glAccount
                                                        ? `${line.glAccount.accountCode} — ${line.glAccount.accountName}`
                                                        : line.glAccountId}
                                                </td>
                                                <td className="p-3">
                                                    {line.description || '—'}
                                                </td>
                                                <td className="p-3 text-right">
                                                    {Number(
                                                        line.debitAmount,
                                                    ).toFixed(2)}
                                                </td>
                                                <td className="p-3 text-right">
                                                    {Number(
                                                        line.creditAmount,
                                                    ).toFixed(2)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="font-semibold">
                                            <td
                                                colSpan={3}
                                                className="p-3 text-right"
                                            >
                                                Totals
                                            </td>
                                            <td className="p-3 text-right">
                                                {totals.debit.toFixed(2)}
                                            </td>
                                            <td className="p-3 text-right">
                                                {totals.credit.toFixed(2)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </AdaptiveCard>
                    </>
                )
            )}

            <Dialog
                isOpen={reverseOpen}
                onClose={() => setReverseOpen(false)}
                onRequestClose={() => setReverseOpen(false)}
            >
                <h4 className="mb-2 text-lg font-semibold">Reverse journal</h4>
                <p className="mb-4 text-sm text-gray-600">
                    Posted documents are immutable; corrections are recorded
                    through reversal.
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
        </PageContainer>
    )
}

function Value({
    label,
    children,
}: {
    label: string
    children: React.ReactNode
}) {
    return (
        <div>
            <div className="text-xs uppercase text-gray-500">{label}</div>
            <div className="mt-1 font-medium">{children}</div>
        </div>
    )
}
