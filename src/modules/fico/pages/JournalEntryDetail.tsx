'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Breadcrumb from '@/components/shared/Breadcrumb'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import ErpBackLink from '@/components/erp/ErpBackLink'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import useResourceAccess from '@/utils/hooks/useResourceAccess'
import { ficoErrorMessage } from '../services/ficoService'
import { useJournalEntry } from '../hooks/useJournalEntry'
import { useJournalEntryMutations } from '../hooks/useJournalEntries'

const ROUTE = '/modules/fico/journal-entries'

export default function JournalEntryDetailPage() {
    const params = useParams<{ id: string }>()
    const state = useJournalEntry(params.id)
    const mutations = useJournalEntryMutations(state.reload)
    const access = useResourceAccess('fico.journal-entries')
    const reversalAccess = useResourceAccess('fico.journal-reversal')
    const [error, setError] = useState<string | null>(null)
    const entry = state.data
    const breadcrumbs = buildErpBreadcrumbs(ROUTE)

    const post = async () => {
        setError(null)
        try {
            await mutations.post(params.id)
        } catch (error) {
            setError(ficoErrorMessage(error, 'Posting failed'))
        }
    }
    const reverse = async () => {
        if (
            !confirm(
                'Reverse this posted journal entry? An opposite entry will be posted.',
            )
        )
            return
        setError(null)
        try {
            await mutations.reverse(params.id)
        } catch (error) {
            setError(ficoErrorMessage(error, 'Reversal failed'))
        }
    }

    return (
        <PageContainer>
            <ErpBackLink items={breadcrumbs} />
            <Breadcrumb items={breadcrumbs} className="mb-4" />
            <PageHeader
                title={entry?.documentNumber || 'Journal Entry'}
                description="Posted documents are immutable; corrections are recorded through reversal."
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
                            reversalAccess.canCreate && (
                                <Button
                                    variant="solid"
                                    loading={mutations.saving}
                                    onClick={() => void reverse()}
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
            {state.loading && !entry ? (
                <AdaptiveCard>Loading journal entry…</AdaptiveCard>
            ) : (
                entry && (
                    <>
                        <AdaptiveCard className="mb-4">
                            <div className="grid gap-4 md:grid-cols-4">
                                <Value label="Status">
                                    <StatusBadge
                                        tone={
                                            entry.status === 'POSTED'
                                                ? 'success'
                                                : entry.status === 'REVERSED'
                                                  ? 'warning'
                                                  : 'info'
                                        }
                                    >
                                        {entry.status}
                                    </StatusBadge>
                                </Value>
                                <Value label="Document Type">
                                    {entry.documentTypeRef
                                        ? `${entry.documentTypeRef.code} — ${entry.documentTypeRef.name}`
                                        : '—'}
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
                                <Value label="Reference">
                                    {entry.reference || '—'}
                                </Value>
                                <Value label="Currency">
                                    {entry.currencyCode}
                                </Value>
                                <Value label="Fiscal Year">
                                    {entry.fiscalYear || '—'}
                                </Value>
                                <Value label="Header Text">
                                    {entry.headerText || '—'}
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
                                        {entry.lines.map((line) => (
                                            <tr key={line.id} className="border-b">
                                                <td className="p-3">
                                                    {line.lineNumber}
                                                </td>
                                                <td className="p-3">
                                                    {line.glAccount.accountCode} —{' '}
                                                    {line.glAccount.accountName}
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
                                                {entry.lines
                                                    .reduce(
                                                        (sum, line) =>
                                                            sum +
                                                            Number(
                                                                line.debitAmount,
                                                            ),
                                                        0,
                                                    )
                                                    .toFixed(2)}
                                            </td>
                                            <td className="p-3 text-right">
                                                {entry.lines
                                                    .reduce(
                                                        (sum, line) =>
                                                            sum +
                                                            Number(
                                                                line.creditAmount,
                                                            ),
                                                        0,
                                                    )
                                                    .toFixed(2)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </AdaptiveCard>
                    </>
                )
            )}
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
