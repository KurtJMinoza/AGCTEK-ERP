'use client'

import { useEffect, useState } from 'react'
import {
    fetchExtPlatformAccounting,
    type ExtPlatformAccountingSnapshot,
} from '../services/extPlatformFinanceService'
import AutomaticJournalSection from './AutomaticJournalSection'

type Props = {
    transactionId: string
    companyId: string
    status: string
}

export default function ExtPlatformAccountingPanel({
    transactionId,
    companyId,
    status,
}: Props) {
    const [loading, setLoading] = useState(true)
    const [snapshot, setSnapshot] = useState<ExtPlatformAccountingSnapshot | null>(
        null,
    )
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let active = true
        setLoading(true)
        setError(null)
        fetchExtPlatformAccounting(transactionId, companyId)
            .then((data) => {
                if (active) setSnapshot(data)
            })
            .catch((err: unknown) => {
                if (active) {
                    setSnapshot(null)
                    setError(
                        err instanceof Error
                            ? err.message
                            : 'Unable to load automatic journal entries.',
                    )
                }
            })
            .finally(() => {
                if (active) setLoading(false)
            })
        return () => {
            active = false
        }
    }, [transactionId, companyId])

    const receivable = snapshot?.receivable

    return (
        <div className="space-y-3">
            {receivable ? (
                <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs dark:border-gray-700 dark:bg-gray-900/40">
                    <p className="font-semibold heading-text">Marketplace receivable</p>
                    <p className="mt-1 text-gray-600 dark:text-gray-300">
                        {receivable.customerName ?? 'Counterparty'} · open{' '}
                        <span className="font-mono tabular-nums">
                            {receivable.openAmount ?? receivable.originalAmount}
                        </span>{' '}
                        · {receivable.openItemStatus ?? '—'}
                    </p>
                    <p className="text-gray-500">
                        Settlement: {snapshot?.settlementStatus ?? 'PENDING'}
                        {snapshot?.actualPayout
                            ? ` · paid ${snapshot.actualPayout}`
                            : null}
                    </p>
                </div>
            ) : null}
        <AutomaticJournalSection
            loading={loading}
            error={error}
            companyId={companyId}
            journals={snapshot?.journals ?? []}
            accountingEvents={snapshot?.accountingEvents ?? []}
            performerLabel="Recorded by"
            performerName={snapshot?.recordedByName ?? null}
            performerEmployeeCode={snapshot?.recordedByEmployeeCode ?? null}
            secondaryPerformer={
                status === 'APPROVED' || snapshot?.approvedByName
                    ? {
                          label: 'Approved by',
                          name: snapshot?.approvedByName ?? null,
                          employeeCode: snapshot?.approvedByEmployeeCode ?? null,
                      }
                    : undefined
            }
            emptyHint={
                status === 'APPROVED'
                    ? 'No GL journal lines linked yet. Inventory-related entries appear after goods issue posting to FICO.'
                    : 'Journal entries are created after the sale is approved and stock / accounting bridges run.'
            }
        />
        </div>
    )
}