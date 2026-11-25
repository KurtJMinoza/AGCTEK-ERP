'use client'

import StatCard from '@/components/shared/StatCard'
import { FicoTrialBalanceTotalsTable } from '../ficoReportSummary'
import { formatJournalMoney } from '../journal/journalUi'
import type { FicoTrialBalanceResponse } from '../../types'
import {
    HiOutlineCollection,
    HiOutlineDocumentDuplicate,
    HiOutlineScale,
} from 'react-icons/hi'

export default function TrialBalanceSummaryPanel({
    currency,
    totals,
    totalAccounts,
    lineCount,
    loading,
}: {
    currency: string
    totals: FicoTrialBalanceResponse['totals']
    totalAccounts: number
    lineCount: number
    loading?: boolean
}) {
    const periodDr = totals.periodDebit ?? totals.debit
    const periodCr = totals.periodCredit ?? totals.credit

    const tableRows = [
        {
            key: 'opening',
            section: 'Opening balance',
            debit: totals.openingDebit ?? '0',
            credit: totals.openingCredit ?? '0',
            difference: totals.openingDifference,
        },
        {
            key: 'period',
            section: 'Period movement',
            debit: periodDr,
            credit: periodCr,
            difference: totals.movementDifference,
        },
        {
            key: 'closing',
            section: 'Closing balance',
            debit: totals.closingDebit ?? '0',
            credit: totals.closingCredit ?? '0',
            difference: totals.closingDifference,
        },
    ]

    return (
        <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    label="Accounts in view"
                    value={loading ? '—' : totalAccounts.toLocaleString()}
                    icon={<HiOutlineCollection />}
                    tone="info"
                    loading={loading}
                />
                <StatCard
                    label="Posted movements"
                    value={loading ? '—' : lineCount.toLocaleString()}
                    icon={<HiOutlineDocumentDuplicate />}
                    loading={loading}
                />
                <StatCard
                    label="Period debit"
                    value={
                        loading ? '—' : formatJournalMoney(currency, periodDr)
                    }
                    icon={<HiOutlineScale />}
                    tone="info"
                    loading={loading}
                />
                <StatCard
                    label="Period credit"
                    value={
                        loading ? '—' : formatJournalMoney(currency, periodCr)
                    }
                    loading={loading}
                />
            </div>

            <FicoTrialBalanceTotalsTable
                currency={currency}
                loading={loading}
                rows={tableRows}
            />
        </div>
    )
}