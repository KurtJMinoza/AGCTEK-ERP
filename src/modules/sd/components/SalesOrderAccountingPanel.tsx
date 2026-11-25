'use client'

import { useEffect, useState } from 'react'
import {
    fetchSalesOrderAccounting,
    type SalesOrderAccountingSnapshot,
} from '../services/salesOrderFinanceService'
import AutomaticJournalSection from './AutomaticJournalSection'

type Props = {
    salesOrderId: string
    companyId: string | null
    channel: string
}

const supportsAccounting = (channel: string) =>
    channel === 'POS' || channel === 'ECOMMERCE' || channel === 'E-commerce'

const performerLabel = (channel: string) => {
    if (channel === 'POS') return 'Cashier / employee'
    if (channel === 'ECOMMERCE' || channel === 'E-commerce') return 'Recorded by'
    return 'Performed by'
}

export default function SalesOrderAccountingPanel({
    salesOrderId,
    companyId,
    channel,
}: Props) {
    const [loading, setLoading] = useState(true)
    const [snapshot, setSnapshot] = useState<SalesOrderAccountingSnapshot | null>(
        null,
    )
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!supportsAccounting(channel)) return
        let active = true
        setLoading(true)
        setError(null)
        fetchSalesOrderAccounting(salesOrderId, companyId ?? undefined)
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
    }, [salesOrderId, companyId, channel])

    if (!supportsAccounting(channel)) {
        return null
    }

    const performerName =
        snapshot?.performedByName ??
        snapshot?.cashierName ??
        (snapshot?.performedByEmployeeCode
            ? `Employee ${snapshot.performedByEmployeeCode}`
            : null)
    const performerCode =
        snapshot?.performedByEmployeeCode ?? snapshot?.cashierEmployeeCode ?? null

    return (
        <AutomaticJournalSection
            loading={loading}
            error={error}
            companyId={companyId}
            journals={snapshot?.journals ?? []}
            accountingEvents={snapshot?.accountingEvents ?? []}
            performerLabel={performerLabel(channel)}
            performerName={performerName}
            performerEmployeeCode={performerCode}
            emptyHint={
                channel === 'ECOMMERCE' || channel === 'E-commerce'
                    ? 'No automatic journal yet. E-commerce revenue posts when payment is captured and company accounting is active.'
                    : undefined
            }
        />
    )
}