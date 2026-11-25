'use client'

import StatCard from '@/components/shared/StatCard'
import {
    FicoAccountTypeTag,
    FicoBalanceCell,
    FicoCodeCell,
} from '../ficoTableUi'
import { formatJournalMoney } from '../journal/journalUi'
import type { FicoGlAccount, FicoGlAccountBalanceSummary } from '../../types'
import {
    HiOutlineArrowDown,
    HiOutlineArrowUp,
    HiOutlineCalculator,
    HiOutlineClipboardList,
} from 'react-icons/hi'

function netPosition(
    normalBalance: string,
    debit: string,
    credit: string,
): { amount: string; label: string; tone: 'info' | 'warning' } {
    const d = Number(debit)
    const c = Number(credit)
    const net = d - c
    const magnitude = Math.abs(net).toFixed(2)
    if (normalBalance === 'DEBIT') {
        if (net >= 0) return { amount: magnitude, label: 'Net debit balance', tone: 'info' }
        return { amount: magnitude, label: 'Net credit (contra)', tone: 'warning' }
    }
    const creditNet = c - d
    const mag = Math.abs(creditNet).toFixed(2)
    if (creditNet >= 0) return { amount: mag, label: 'Net credit balance', tone: 'info' }
    return { amount: mag, label: 'Net debit (contra)', tone: 'warning' }
}

function formatPeriodLabel(dateFrom?: string, dateTo?: string) {
    if (!dateFrom && !dateTo) return 'All committed posting dates'
    return [dateFrom, dateTo].filter(Boolean).join(' → ')
}

export default function GeneralLedgerSummaryPanel({
    currency,
    account,
    summaryAccount,
    totals,
    totalLines,
    loading,
    dateFrom,
    dateTo,
}: {
    currency: string
    account: FicoGlAccount | undefined
    summaryAccount?: FicoGlAccountBalanceSummary['account']
    totals: FicoGlAccountBalanceSummary['totals'] | null
    totalLines: number
    loading?: boolean
    dateFrom?: string
    dateTo?: string
}) {
    if (!account && !summaryAccount) {
        return (
            <div className="rounded-xl border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-gray-500 dark:border-gray-700">
                Select a G/L account to view committed ledger lines and balances.
            </div>
        )
    }

    const code = account?.accountCode ?? summaryAccount?.accountCode ?? '—'
    const name = account?.accountName ?? summaryAccount?.accountName
    const normalBalance =
        account?.normalBalance ?? summaryAccount?.normalBalance ?? 'DEBIT'
    const accountType = account?.accountType ?? summaryAccount?.accountType ?? ''

    const debit = totals?.debit ?? '0'
    const credit = totals?.credit ?? '0'
    const net = netPosition(normalBalance, debit, credit)
    const filteredView = Boolean(dateFrom || dateTo)

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 dark:border-gray-800 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <FicoCodeCell icon="account" code={code} name={name} />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        {accountType ? (
                            <FicoAccountTypeTag type={accountType} />
                        ) : null}
                        <FicoBalanceCell
                            normalBalance={normalBalance}
                            accountType={accountType || 'ASSET'}
                        />
                    </div>
                </div>
                <p className="max-w-xs text-xs text-gray-500 dark:text-gray-400 sm:text-right">
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                        {formatPeriodLabel(dateFrom, dateTo)}
                    </span>
                    <br />
                    {filteredView
                        ? `${totalLines.toLocaleString()} lines match the posting filter.`
                        : 'Posted and reversed originals per ledger policy.'}
                </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    label={filteredView ? 'Lines in range' : 'Committed lines'}
                    value={loading ? '—' : totalLines.toLocaleString()}
                    icon={<HiOutlineClipboardList />}
                    loading={loading}
                />
                <StatCard
                    label="Total debit"
                    value={loading ? '—' : formatJournalMoney(currency, debit)}
                    icon={<HiOutlineArrowUp />}
                    tone="info"
                    loading={loading}
                />
                <StatCard
                    label="Total credit"
                    value={loading ? '—' : formatJournalMoney(currency, credit)}
                    icon={<HiOutlineArrowDown />}
                    loading={loading}
                />
                <StatCard
                    label={net.label}
                    value={
                        loading ? '—' : formatJournalMoney(currency, net.amount)
                    }
                    icon={<HiOutlineCalculator />}
                    tone={net.tone}
                    loading={loading}
                />
            </div>
        </div>
    )
}