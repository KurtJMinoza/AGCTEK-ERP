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

    return (
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
    )
}