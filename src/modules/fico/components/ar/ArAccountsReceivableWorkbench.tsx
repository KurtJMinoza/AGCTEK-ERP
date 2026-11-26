'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { ColumnDef } from '@tanstack/react-table'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import StatCard from '@/components/shared/StatCard'
import Button from '@/components/ui/Button'
import FilterBar from '@/components/shared/FilterBar'
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
import {
    accountsReceivableService,
    type ArDashboard,
    type ArOpenItemRow,
} from '../../services/accountsReceivableService'
import {
    HiOutlineCash,
    HiOutlineClipboardList,
    HiOutlineCurrencyDollar,
    HiOutlineRefresh,
} from 'react-icons/hi'

type TabKey = 'overview' | 'open-items' | 'reconciliation'

const TABS: { value: TabKey; label: string }[] = [
    { value: 'overview', label: 'Overview' },
    { value: 'open-items', label: 'Open items' },
    { value: 'reconciliation', label: 'G/L reconciliation' },
]

const customerLabel = (row: ArOpenItemRow) =>
    row.customer
        ? `${row.customer.companyName}`
        : row.customerId

const ArAccountsReceivableWorkbench = ({ companyId }: { companyId: string }) => {
    const [tab, setTab] = useState<TabKey>('overview')
    const [dashboard, setDashboard] = useState<ArDashboard | null>(null)
    const [openItems, setOpenItems] = useState<ArOpenItemRow[]>([])
    const [recon, setRecon] = useState<{
        reconciled?: boolean
        accounts?: Array<{
            accountCode: string
            accountName: string
            difference: string | number
        }>
    } | null>(null)
    const [overdueOnly, setOverdueOnly] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const currency = dashboard?.baseCurrency ?? 'PHP'

    const reload = useCallback(() => {
        setLoading(true)
        setError('')
        Promise.all([
            accountsReceivableService.fetchDashboard(companyId),
            accountsReceivableService.fetchOpenItems(companyId, overdueOnly),
            tab === 'reconciliation'
                ? accountsReceivableService.fetchReconciliation(companyId)
                : Promise.resolve(null),
        ])
            .then(([dash, items, reconciliation]) => {
                setDashboard(dash)
                setOpenItems(items)
                if (reconciliation) setRecon(reconciliation as typeof recon)
            })
            .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'))
            .finally(() => setLoading(false))
    }, [companyId, overdueOnly, tab])

    useEffect(() => {
        void reload()
    }, [reload])

    const columns = useMemo<ColumnDef<ArOpenItemRow>[]>(
        () => [
            {
                header: 'Customer',
                size: 200,
                cell: ({ row }) => (
                    <FicoCodeCell
                        icon="posting"
                        code={row.original.customer?.customerNumber ?? '—'}
                        name={customerLabel(row.original)}
                    />
                ),
            },
            {
                header: 'Reference',
                cell: ({ row }) => (
                    <span className="font-mono text-xs text-gray-700 dark:text-gray-300">
                        {row.original.document?.referenceNumber ??
                            row.original.document?.id?.slice(-8) ??
                            '—'}
                    </span>
                ),
            },
            {
                header: 'Due',
                size: 110,
                cell: ({ row }) => formatFicoDate(row.original.dueDate),
            },
            {
                header: 'Status',
                accessorKey: 'status',
                size: 120,
                cell: ({ row }) => (
                    <StatusBadge
                        status={row.original.status}
                        tone={
                            row.original.status === 'OPEN'
                                ? 'warning'
                                : row.original.status === 'CLEARED'
                                  ? 'success'
                                  : 'default'
                        }
                    />
                ),
            },
            {
                header: 'Open amount',
                size: 130,
                cell: ({ row }) => (
                    <span className="tabular-nums font-medium">
                        {formatMoney(
                            row.original.currencyCode,
                            String(row.original.openAmount),
                        )}
                    </span>
                ),
            },
            {
                header: 'Journal',
                size: 88,
                cell: ({ row }) =>
                    row.original.document?.journalEntryId ? (
                        <Link
                            className="text-xs font-medium text-primary hover:underline"
                            href={`/modules/fico/journal-entries/${row.original.document.journalEntryId}`}
                        >
                            Open
                        </Link>
                    ) : (
                        '—'
                    ),
            },
        ],
        [],
    )

    const filterChips = useMemo(() => {
        if (!overdueOnly) return []
        return [
            {
                key: 'overdue',
                label: 'Overdue only',
                onRemove: () => setOverdueOnly(false),
            },
        ]
    }, [overdueOnly])

    return (
        <>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    label="Outstanding receivables"
                    value={formatMoney(currency, dashboard?.totalOutstanding ?? '0')}
                    icon={<HiOutlineCurrencyDollar />}
                    tone="info"
                    loading={loading && !dashboard}
                />
                <StatCard
                    label="Overdue"
                    value={formatMoney(currency, dashboard?.totalOverdue ?? '0')}
                    tone="warning"
                    icon={<HiOutlineClipboardList />}
                    loading={loading && !dashboard}
                />
                <StatCard
                    label="Collections (period)"
                    value={formatMoney(currency, dashboard?.collectionsInPeriod ?? '0')}
                    tone="success"
                    icon={<HiOutlineCash />}
                    loading={loading && !dashboard}
                />
                <StatCard
                    label="Posting exceptions"
                    value={dashboard ? String(dashboard.postingExceptions) : '—'}
                    loading={loading && !dashboard}
                />
            </div>

            <FicoWorkbenchPanel>
                <FicoWorkbenchTabBar
                    value={tab}
                    onChange={(v) => setTab(v as TabKey)}
                    tabs={TABS}
                    actions={
                        <Button
                            size="sm"
                            variant="plain"
                            loading={loading}
                            icon={<HiOutlineRefresh />}
                            onClick={() => void reload()}
                        >
                            Refresh
                        </Button>
                    }
                />

                <FicoWorkbenchAlert message={error} onDismiss={() => setError('')} />

                {tab === 'overview' && dashboard ? (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {[
                            ['Credit limit (portfolio)', dashboard.creditLimit],
                            ['Credit exposure', dashboard.creditExposure],
                            ['Open item count', String(openItems.length)],
                            [
                                'Currency',
                                dashboard.baseCurrency ?? currency,
                            ],
                        ].map(([label, value]) => (
                            <AdaptiveCard key={label} bodyClass="p-4">
                                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                                    {label}
                                </dt>
                                <dd className="mt-1 text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                                    {String(value)}
                                </dd>
                            </AdaptiveCard>
                        ))}
                    </div>
                ) : null}

                {tab === 'open-items' ? (
                    <div className="mt-4 space-y-4">
                        <FilterBar
                            fields={[
                                {
                                    key: 'overdue',
                                    label: 'Scope',
                                    kind: 'select',
                                    value: overdueOnly ? 'overdue' : 'all',
                                    options: [
                                        { value: 'all', label: 'All open items' },
                                        { value: 'overdue', label: 'Overdue only' },
                                    ],
                                    onChange: (v) => setOverdueOnly(v === 'overdue'),
                                },
                            ]}
                            chips={filterChips}
                            onClear={() => setOverdueOnly(false)}
                            actions={
                                <Button size="sm" variant="solid" loading={loading} onClick={reload}>
                                    Apply
                                </Button>
                            }
                        />
                        <FicoTableToolbar
                            title="Customer open items"
                            description="Debit positions awaiting collection or allocation."
                        />
                        <FicoResponsiveTable
                            columns={columns}
                            data={openItems}
                            loading={loading}
                            noData={!loading && !openItems.length}
                            hidePagination={openItems.length <= 25}
                        />
                    </div>
                ) : null}

                {tab === 'reconciliation' ? (
                    <div className="mt-4">
                        <FicoTableToolbar
                            title="Receivable control accounts"
                            description="Subledger balance vs G/L reconciliation account movement."
                        />
                        {recon?.accounts?.length ? (
                            <FicoResponsiveTable<
                                NonNullable<typeof recon.accounts>[number]
                            >
                                columns={[
                                    {
                                        header: 'G/L account',
                                        cell: ({ row }) => (
                                            <FicoCodeCell
                                                icon="account"
                                                code={row.original.accountCode}
                                                name={row.original.accountName}
                                            />
                                        ),
                                    },
                                    {
                                        header: 'Variance',
                                        cell: ({ row }) => (
                                            <span
                                                className={
                                                    Number(row.original.difference) === 0
                                                        ? 'tabular-nums text-emerald-600'
                                                        : 'tabular-nums font-medium text-amber-600'
                                                }
                                            >
                                                {formatMoney(
                                                    currency,
                                                    String(row.original.difference),
                                                )}
                                            </span>
                                        ),
                                    },
                                    {
                                        header: 'Status',
                                        cell: ({ row }) => (
                                            <StatusBadge
                                                status={
                                                    Number(row.original.difference) === 0
                                                        ? 'RECONCILED'
                                                        : 'VARIANCE'
                                                }
                                                tone={
                                                    Number(row.original.difference) === 0
                                                        ? 'success'
                                                        : 'warning'
                                                }
                                            />
                                        ),
                                    },
                                ]}
                                data={recon.accounts}
                                loading={loading}
                                hidePagination
                            />
                        ) : (
                            <p className="text-sm text-gray-500">
                                No reconciliation accounts configured for this company.
                            </p>
                        )}
                    </div>
                ) : null}
            </FicoWorkbenchPanel>
        </>
    )
}

export default ArAccountsReceivableWorkbench