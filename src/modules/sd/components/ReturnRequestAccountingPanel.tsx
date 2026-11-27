'use client'

import { useEffect, useState } from 'react'
import AutomaticJournalSection from './AutomaticJournalSection'
import {
    fetchReturnRequestAccounting,
    type ReturnRequestAccountingSnapshot,
} from '../services/returnRequestFinanceService'

type Props = {
    returnRequestId: string
    companyId: string | null
}

export default function ReturnRequestAccountingPanel({
    returnRequestId,
    companyId,
}: Props) {
    const [loading, setLoading] = useState(true)
    const [snapshot, setSnapshot] = useState<ReturnRequestAccountingSnapshot | null>(
        null,
    )
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let active = true
        setLoading(true)
        setError(null)
        fetchReturnRequestAccounting(returnRequestId, companyId ?? undefined)
            .then((data) => {
                if (active) setSnapshot(data)
            })
            .catch((err: unknown) => {
                if (active) {
                    setSnapshot(null)
                    setError(
                        err instanceof Error
                            ? err.message
                            : 'Unable to load return accounting.',
                    )
                }
            })
            .finally(() => {
                if (active) setLoading(false)
            })
        return () => {
            active = false
        }
    }, [returnRequestId, companyId])

    return (
        <AutomaticJournalSection
            loading={loading}
            error={error}
            companyId={companyId}
            journals={snapshot?.journals ?? []}
            accountingEvents={snapshot?.accountingEvents ?? []}
            performerLabel="Return accounting"
            performerName={null}
            performerEmployeeCode={null}
            emptyHint="No automatic journals yet. Inventory posts on MM RESTOCK; commercial revenue posts when the refund is PAID."
        />
    )
}
