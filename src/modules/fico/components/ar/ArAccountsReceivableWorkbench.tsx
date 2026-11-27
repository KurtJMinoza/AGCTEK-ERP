'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { ColumnDef } from '@tanstack/react-table'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import StatCard from '@/components/shared/StatCard'
import Button from '@/components/ui/Button'
import FilterBar from '@/components/shared/FilterBar'
import StatusBadge from '@/components/shared/StatusBadge'
import DatePicker from '@/components/ui/DatePicker'
import { FormItem } from '@/components/ui/Form'
import FicoLedgerTable from '../workbench/FicoLedgerTable'
import { FicoCodeCell, formatFicoDate } from '../ficoTableUi'
import { formatMoney } from '../journal/journalUi'
import FicoWorkbenchTabBar from '../workbench/FicoWorkbenchTabBar'
import {
    FicoWorkbenchAlert,
    FicoWorkbenchPanel,
} from '../workbench/FicoWorkbenchChrome'
import {
    accountsReceivableService,
    type ArAgingBuckets,
    type ArAgingReport,
    type ArDashboard,
    type ArOpenItemRow,
} from '../../services/accountsReceivableService'
import ArAgingVisualization from './ArAgingVisualization'
import {
    HiOutlineCash,
    HiOutlineClipboardList,
    HiOutlineCurrencyDollar,
    HiOutlineExclamation,
    HiOutlineRefresh,
} from 'react-icons/hi'

type TabKey = 'overview' | 'open-items' | 'aging' | 'reconciliation'

const TABS: { value: TabKey; label: string }[] = [
    { value: 'overview', label: 'Overview' },
    { value: 'open-items', label: 'Open items' },
    { value: 'aging', label: 'Aging detail' },
    { value: 'reconciliation', label: 'G/L reconciliation' },
]

function num(v: string | number | undefined) {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
}

const customerDisplayName = (row: ArOpenItemRow) => {
    const c = row.customer
    if (!c) return row.customerId
    const contact = c.contactName?.trim()
    const company = c.companyName?.trim()
    if (contact && company && contact !== company) return contact
    return contact || company || c.customerNumber
}

const referenceLabel = (row: ArOpenItemRow) =>
    row.document?.referenceNumber?.trim() || '—'

function buildOpenItemColumns(): ColumnDef<ArOpenItemRow>[] {
    return [
        {
            header: 'Customer',
            size: 200,
            cell: ({ row }) => (
                <FicoCodeCell
                    icon="posting"
                    code={row.original.customer?.customerNumber ?? '—'}
                    name={customerDisplayName(row.original)}
                />
            ),
        },
        {
            header: 'Invoice / reference',
            cell: ({ row }) => (
                <span className="font-mono text-xs font-medium text-primary">
                    {referenceLabel(row.original)}
                </span>
            ),
        },
        {
            header: 'Due date',
            size: 110,
            cell: ({ row }) => formatFicoDate(row.original.dueDate),
        },
        {
            header: 'Status',
            accessorKey: 'status',
            size: 110,
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
            header: 'Days overdue',
            size: 100,
            cell: ({ row }) => {
                const days = Number(row.original.overdueDays ?? 0)
                return (
                    <span
                        className={
                            days > 0
                                ? 'tabular-nums font-semibold text-amber-700 dark:text-amber-400'
                                : 'tabular-nums text-gray-400'
                        }
                    >
                        {days > 0 ? days : '—'}
                    </span>
                )
            },
        },
        {
            header: 'Days until due',
            size: 110,
            cell: ({ row }) => {
                const days = Number(row.original.daysUntilDue ?? 0)
                return (
                    <span
                        className={
                            days > 0
                                ? 'tabular-nums font-medium text-emerald-700 dark:text-emerald-400'
                                : 'tabular-nums text-gray-400'
                        }
                    >
                        {days > 0 ? days : '—'}
                    </span>
                )
            },
        },
        {
            header: 'Open amount',
            size: 130,
            cell: ({ row }) => (
                <span className="tabular-nums font-semibold text-gray-900 dark:text-gray-100">
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
                        View JE
                    </Link>
                ) : (
                    '—'
                ),
        },
    ]
}

type AgingBucketRow = { bucket: string; amount: string | number; tone?: string }

const ArAccountsReceivableWorkbench = ({ companyId }: { companyId: string }) => {
    const [tab, setTab] = useState<TabKey>('overview')
    const [dashboard, setDashboard] = useState<ArDashboard | null>(null)
    const [openItems, setOpenItems] = useState<ArOpenItemRow[]>([])
    const [asOfDate, setAsOfDate] = useState(() => new Date().toISOString().slice(0, 10))
    const [aging, setAging] = useState<ArAgingReport | null>(null)
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

    const currency = dashboard?.baseCurrency ?? aging?.items?.[0]?.currencyCode ?? 'PHP'
    const buckets: ArAgingBuckets | null =
        dashboard?.agingBuckets ?? aging?.buckets ?? null

    const reload = useCallback(() => {
        setLoading(true)
        setError('')
        Promise.all([
            accountsReceivableService.fetchDashboard(
                companyId,
                undefined,
                undefined,
                asOfDate,
            ),
            accountsReceivableService.fetchOpenItems(companyId, overdueOnly, asOfDate),
            accountsReceivableService.fetchAging(companyId, asOfDate),
            tab === 'reconciliation'
                ? accountsReceivableService.fetchReconciliation(companyId)
                : Promise.resolve(null),
        ])
            .then(([dash, items, agingReport, reconciliation]) => {
                setDashboard(dash)
                setOpenItems(items)
                setAging(agingReport)
                if (reconciliation) setRecon(reconciliation as typeof recon)
            })
            .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'))
            .finally(() => setLoading(false))
    }, [companyId, overdueOnly, tab, asOfDate])

    useEffect(() => {
        void reload()
    }, [reload])

    const openItemColumns = useMemo(() => buildOpenItemColumns(), [])

    const agingBucketRows = useMemo<AgingBucketRow[]>(() => {
        if (!buckets) return []
        return [
            { bucket: 'Current', amount: buckets.current, tone: 'text-emerald-700' },
            { bucket: '1–30 days', amount: buckets.days1To30 },
            { bucket: '31–60 days', amount: buckets.days31To60 },
            { bucket: '61–90 days', amount: buckets.days61To90 },
            { bucket: '90+ days', amount: buckets.over90, tone: 'text-rose-700' },
            {
                bucket: 'Customer credits',
                amount: buckets.customerCredits,
                tone: 'text-violet-700',
            },
        ]
    }, [buckets])

    const agingBucketColumns = useMemo<ColumnDef<AgingBucketRow>[]>(
        () => [
            { header: 'Aging bucket', accessorKey: 'bucket' },
            {
                header: 'Open amount',
                cell: ({ row }) => (
                    <span
                        className={`tabular-nums font-semibold ${row.original.tone ?? ''}`}
                    >
                        {formatMoney(currency, String(row.original.amount))}
                    </span>
                ),
            },
        ],
        [currency],
    )

    const previewOpenItems = useMemo(() => openItems.slice(0, 8), [openItems])

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

    const asOfLabel = formatFicoDate(asOfDate)

    const portfolioMetrics = useMemo(() => {
        if (!dashboard) return []
        return [
            {
                label: 'Credit limit (portfolio)',
                value: formatMoney(currency, dashboard.creditLimit),
            },
            {
                label: 'Credit exposure',
                value: formatMoney(currency, dashboard.creditExposure),
                emphasize: true,
            },
            {
                label: 'Available credit',
                value: formatMoney(
                    currency,
                    dashboard.availableCredit ?? '0',
                ),
            },
            {
                label: 'Open items',
                value: String(openItems.length),
            },
            {
                label: 'Customer advances',
                value: formatMoney(
                    currency,
                    dashboard.customerAdvanceBalance ?? '0',
                ),
            },
            {
                label: 'Unapplied receipts',
                value: formatMoney(
                    currency,
                    dashboard.unappliedReceiptBalance ?? '0',
                ),
            },
        ]
    }, [dashboard, currency, openItems.length])

    return (
        <>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
                    tone={num(dashboard?.totalOverdue) > 0 ? 'warning' : 'default'}
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
                    tone={dashboard && dashboard.postingExceptions > 0 ? 'warning' : 'default'}
                    icon={<HiOutlineExclamation />}
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

                {(tab === 'overview' || tab === 'aging') && (
                    <div className="mt-4 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-gray-200/90 bg-gray-50/60 p-3 dark:border-gray-800 dark:bg-gray-900/40">
                        <div className="flex flex-wrap items-end gap-3">
                            <FormItem label="As-of date" className="mb-0">
                                <DatePicker
                                    value={new Date(asOfDate)}
                                    onChange={(d) => {
                                        if (d) {
                                            setAsOfDate(d.toISOString().slice(0, 10))
                                        }
                                    }}
                                    size="sm"
                                />
                            </FormItem>
                            <p className="pb-2 text-xs text-gray-500 dark:text-gray-400">
                                Aging buckets and overdue days use this date.
                            </p>
                        </div>
                        {tab === 'overview' && (
                            <Button
                                size="sm"
                                variant="solid"
                                onClick={() => setTab('open-items')}
                            >
                                View all open items ({openItems.length})
                            </Button>
                        )}
                    </div>
                )}

                {tab === 'overview' && (
                    <div className="mt-4 space-y-4">
                        <div className="grid gap-4 lg:grid-cols-5">
                            <div className="lg:col-span-3">
                                <ArAgingVisualization
                                    currency={currency}
                                    buckets={buckets}
                                    asOfLabel={asOfLabel}
                                    loading={loading && !buckets}
                                    totalReceivable={
                                        dashboard?.totalReceivable ??
                                        dashboard?.totalOutstanding
                                    }
                                />
                            </div>
                            <div className="lg:col-span-2">
                                <AdaptiveCard className="h-full" bodyClass="p-5">
                                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                        Credit &amp; portfolio
                                    </h3>
                                    <p className="mt-1 text-xs text-gray-500">
                                        Company scope · {currency}
                                    </p>
                                    <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                                        {portfolioMetrics.map((metric) => (
                                            <div
                                                key={metric.label}
                                                className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-900/40"
                                            >
                                                <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                                                    {metric.label}
                                                </dt>
                                                <dd
                                                    className={`mt-0.5 tabular-nums ${
                                                        metric.emphasize
                                                            ? 'text-lg font-semibold text-gray-900 dark:text-gray-100'
                                                            : 'text-base font-medium text-gray-800 dark:text-gray-200'
                                                    }`}
                                                >
                                                    {loading && !dashboard
                                                        ? '…'
                                                        : metric.value}
                                                </dd>
                                            </div>
                                        ))}
                                    </dl>
                                </AdaptiveCard>
                            </div>
                        </div>

                        <FicoLedgerTable
                            title="Bucket summary"
                            description="Tabular view of the same aging distribution shown above."
                            columns={agingBucketColumns}
                            data={agingBucketRows}
                            loading={loading}
                            hidePagination
                            tableMinWidthClass="min-w-[480px]"
                        />

                        <FicoLedgerTable
                            title="Open items at a glance"
                            description="POS / SO invoice references with customer, due date, and open balance."
                            toolbar={
                                openItems.length > previewOpenItems.length ? (
                                    <Button
                                        size="sm"
                                        variant="plain"
                                        onClick={() => setTab('open-items')}
                                    >
                                        Show all {openItems.length}
                                    </Button>
                                ) : null
                            }
                            columns={openItemColumns}
                            data={previewOpenItems}
                            loading={loading}
                            noData={!loading && !previewOpenItems.length}
                            hidePagination
                            tableMinWidthClass="min-w-[960px]"
                        />
                    </div>
                )}

                {tab === 'open-items' && (
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
                                <Button
                                    size="sm"
                                    variant="solid"
                                    loading={loading}
                                    onClick={reload}
                                >
                                    Apply
                                </Button>
                            }
                        />
                        <FicoLedgerTable
                            title="Customer open items"
                            description="Debit positions awaiting collection — invoice reference ties to POS or sales documents."
                            columns={openItemColumns}
                            data={openItems}
                            loading={loading}
                            noData={!loading && !openItems.length}
                            hidePagination={openItems.length <= 25}
                            tableMinWidthClass="min-w-[1150px]"
                        />
                    </div>
                )}

                {tab === 'aging' && (
                    <FicoLedgerTable
                        title="Aging detail"
                        description={`Open items by due date vs as-of · overdue and days until due · as of ${asOfLabel}`}
                        toolbar={
                            aging ? (
                                <span className="text-xs font-medium tabular-nums text-gray-600 dark:text-gray-300">
                                    Total receivable{' '}
                                    {formatMoney(
                                        currency,
                                        aging.totalReceivable ?? '0',
                                    )}
                                </span>
                            ) : null
                        }
                        columns={openItemColumns}
                        data={aging?.items ?? openItems}
                        loading={loading}
                        noData={!loading && !(aging?.items?.length || openItems.length)}
                        hidePagination={(aging?.items?.length ?? openItems.length) <= 25}
                        tableMinWidthClass="min-w-[1150px]"
                    />
                )}

                {tab === 'reconciliation' && (
                    <div className="mt-4">
                        <FicoLedgerTable
                            title="Receivable control accounts"
                            description="Subledger balance vs G/L reconciliation account movement."
                            toolbar={
                                recon ? (
                                    <StatusBadge
                                        status={recon.reconciled ? 'Reconciled' : 'Variance'}
                                        tone={recon.reconciled ? 'success' : 'warning'}
                                    />
                                ) : null
                            }
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
                                                    : 'tabular-nums font-semibold text-amber-600'
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
                            data={recon?.accounts ?? []}
                            loading={loading}
                            noData={!loading && !recon?.accounts?.length}
                            hidePagination
                            tableMinWidthClass="min-w-[720px]"
                        />
                    </div>
                )}
            </FicoWorkbenchPanel>
        </>
    )
}

export default ArAccountsReceivableWorkbench