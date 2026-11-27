'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { ColumnDef } from '@tanstack/react-table'
import StatCard from '@/components/shared/StatCard'
import Button from '@/components/ui/Button'
import StatusBadge from '@/components/shared/StatusBadge'
import FicoResponsiveTable from '../FicoResponsiveTable'
import { FicoCodeCell, formatFicoDate } from '../ficoTableUi'
import { formatMoney } from '../journal/journalUi'
import FicoWorkbenchTabBar from '../workbench/FicoWorkbenchTabBar'
import {
    FicoTableToolbar,
    FicoWorkbenchAlert,
    FicoWorkbenchPanel,
} from '../workbench/FicoWorkbenchChrome'
import TreasuryAccountDialog from './TreasuryAccountDialog'
import {
    treasuryService,
    type TreasuryAccount,
    type TreasurySettlement,
} from '../../services/treasuryService'
import usePermissions from '@/utils/hooks/usePermissions'
import {
    HiOutlineCash,
    HiOutlineRefresh,
    HiOutlineSwitchHorizontal,
} from 'react-icons/hi'

type TabKey = 'accounts' | 'settlements'

const TreasuryWorkbench = ({ companyId }: { companyId: string }) => {
    const { can } = usePermissions()
    const canCreate = can('fico.treasury', 'create')
    const [tab, setTab] = useState<TabKey>('accounts')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [accounts, setAccounts] = useState<TreasuryAccount[]>([])
    const [settlements, setSettlements] = useState<TreasurySettlement[]>([])
    const [dialogOpen, setDialogOpen] = useState(false)

    const load = useCallback(() => {
        setLoading(true)
        setError('')
        Promise.all([
            treasuryService.listAccounts(companyId),
            treasuryService.listSettlements(companyId),
        ])
            .then(([acc, set]) => {
                setAccounts(acc)
                setSettlements(set)
            })
            .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'))
            .finally(() => setLoading(false))
    }, [companyId])

    useEffect(() => {
        load()
    }, [load])

    const activeAccounts = accounts.filter((a) => a.status === 'ACTIVE' && !a.postingBlocked)
    const settlementVolume = settlements.reduce(
        (sum, row) => sum + Number(row.grossAmount),
        0,
    )

    const accountColumns = useMemo<ColumnDef<TreasuryAccount>[]>(
        () => [
            {
                header: 'Treasury account',
                cell: ({ row }) => (
                    <FicoCodeCell
                        icon="account"
                        code={row.original.accountCode}
                        name={row.original.accountName}
                    />
                ),
            },
            {
                header: 'Kind',
                accessorKey: 'accountKind',
                cell: ({ row }) => (
                    <span className="text-xs font-medium uppercase tracking-wide text-gray-600">
                        {row.original.accountKind.replace(/_/g, ' ')}
                    </span>
                ),
            },
            {
                header: 'G/L',
                cell: ({ row }) => (
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                        {row.original.glAccount.accountCode}
                        <span className="mx-1 text-gray-400">·</span>
                        {row.original.glAccount.accountName}
                    </span>
                ),
            },
            { header: 'CCY', accessorKey: 'currencyCode', size: 72 },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <StatusBadge
                        status={row.original.postingBlocked ? 'BLOCKED' : row.original.status}
                        tone={
                            row.original.status === 'ACTIVE' && !row.original.postingBlocked
                                ? 'success'
                                : 'warning'
                        }
                    />
                ),
            },
        ],
        [],
    )

    const settlementColumns = useMemo<ColumnDef<TreasurySettlement>[]>(
        () => [
            {
                header: 'Settlement',
                cell: ({ row }) => (
                    <span className="font-mono text-xs font-semibold text-gray-900 dark:text-gray-100">
                        {row.original.settlementNumber}
                    </span>
                ),
            },
            {
                header: 'Type',
                accessorKey: 'settlementType',
                cell: ({ row }) => (
                    <span className="text-xs">{row.original.settlementType.replace(/_/g, ' ')}</span>
                ),
            },
            {
                header: 'Gross',
                cell: ({ row }) =>
                    formatMoney(row.original.currencyCode, row.original.grossAmount),
            },
            {
                header: 'Fee',
                cell: ({ row }) =>
                    formatMoney(row.original.currencyCode, row.original.feeAmount),
            },
            {
                header: 'Posted',
                cell: ({ row }) => formatFicoDate(row.original.postingDate),
            },
            {
                header: 'Journal',
                cell: ({ row }) =>
                    row.original.journalEntry?.documentNumber ? (
                        <Link
                            href={`/modules/fico/journal-entries?search=${row.original.journalEntry.documentNumber}`}
                            className="text-xs font-medium text-primary hover:underline"
                        >
                            {row.original.journalEntry.documentNumber}
                        </Link>
                    ) : (
                        '—'
                    ),
            },
        ],
        [],
    )

    return (
        <>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    label="Active accounts"
                    value={String(activeAccounts.length)}
                    icon={<HiOutlineCash />}
                    tone="info"
                    loading={loading && !accounts.length}
                />
                <StatCard
                    label="Total configured"
                    value={String(accounts.length)}
                    loading={loading && !accounts.length}
                />
                <StatCard
                    label="Recent settlements"
                    value={String(settlements.length)}
                    icon={<HiOutlineSwitchHorizontal />}
                    loading={loading}
                />
                <StatCard
                    label="Settlement volume (gross)"
                    value={settlementVolume.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                    })}
                    loading={loading}
                />
            </div>

            <FicoWorkbenchPanel>
                <FicoWorkbenchTabBar
                    value={tab}
                    onChange={(v) => setTab(v as TabKey)}
                    tabs={[
                        { value: 'accounts', label: 'Accounts' },
                        { value: 'settlements', label: 'Settlements' },
                    ]}
                    actions={
                        <>
                            {canCreate ? (
                                <Button
                                    size="sm"
                                    variant="solid"
                                    onClick={() => setDialogOpen(true)}
                                >
                                    New account
                                </Button>
                            ) : null}
                            <Button
                                size="sm"
                                variant="plain"
                                loading={loading}
                                icon={<HiOutlineRefresh />}
                                onClick={load}
                            >
                                Refresh
                            </Button>
                        </>
                    }
                />
                <FicoWorkbenchAlert message={error} onDismiss={() => setError('')} />

                {tab === 'accounts' ? (
                    <div className="mt-4">
                        <FicoTableToolbar
                            title="Cash, bank & clearing accounts"
                            description="Operational treasury master — each row maps to one posting G/L account."
                        />
                        <FicoResponsiveTable
                            columns={accountColumns}
                            data={accounts}
                            loading={loading}
                            noData={!loading && !accounts.length}
                        />
                    </div>
                ) : null}

                {tab === 'settlements' ? (
                    <div className="mt-4">
                        <FicoTableToolbar
                            title="Posted settlements"
                            description="Card, e-wallet, transfer, and clearing journals from the treasury engine."
                        />
                        <FicoResponsiveTable
                            columns={settlementColumns}
                            data={settlements}
                            loading={loading}
                            noData={!loading && !settlements.length}
                        />
                    </div>
                ) : null}
            </FicoWorkbenchPanel>

            <TreasuryAccountDialog
                companyId={companyId}
                open={dialogOpen}
                onClose={() => setDialogOpen(false)}
                onSuccess={load}
            />
        </>
    )
}

export default TreasuryWorkbench