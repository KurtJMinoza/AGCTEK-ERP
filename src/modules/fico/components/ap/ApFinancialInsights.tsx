'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import type { ColumnDef } from '@tanstack/react-table'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import DatePicker from '@/components/ui/DatePicker'
import { FormItem } from '@/components/ui/Form'
import StatusBadge from '@/components/shared/StatusBadge'
import { FicoCodeCell, formatFicoDate } from '../ficoTableUi'
import { formatMoney } from '../journal/journalUi'
import FicoLedgerTable from '../workbench/FicoLedgerTable'
import { FicoWorkbenchAlert } from '../workbench/FicoWorkbenchChrome'
import { accountsPayableService } from '../../services/accountsPayableService'
import type {
    ApAgingReport,
    ApDashboard,
    ApPaymentProposal,
    ApReconciliationReport,
    ApSupplierStatement,
} from '../../types/accountsPayable'

export type ApInsightTab =
    | 'overview'
    | 'aging'
    | 'reconciliation'
    | 'statements'
    | 'proposals'
    | 'adjustments'

type Props = {
    companyId: string
    tab: ApInsightTab
    onPayProposal?: (proposal: ApPaymentProposal) => void
    onDashboardLoaded?: (dashboard: ApDashboard) => void
}

const num = (value: string | number | undefined) => Number(value ?? 0)

const ApFinancialInsights = ({ companyId, tab, onPayProposal, onDashboardLoaded }: Props) => {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const [dashboard, setDashboard] = useState<ApDashboard | null>(null)
    const [aging, setAging] = useState<ApAgingReport | null>(null)
    const [recon, setRecon] = useState<ApReconciliationReport | null>(null)
    const [proposals, setProposals] = useState<ApPaymentProposal[]>([])
    const [statementSupplierId, setStatementSupplierId] = useState('')
    const [statement, setStatement] = useState<ApSupplierStatement | null>(null)
    const [asOfDate, setAsOfDate] = useState<Date | null>(new Date())
    const [periodFrom, setPeriodFrom] = useState<Date | null>(null)
    const [periodTo, setPeriodTo] = useState<Date | null>(null)

    const currency =
        dashboard?.baseCurrency ??
        proposals[0]?.currencyCode ??
        aging?.items[0]?.currencyCode ??
        ''

    useEffect(() => {
        if (dashboard) return
        void accountsPayableService
            .fetchDashboard({ companyId })
            .then((data) => {
                setDashboard(data)
                onDashboardLoaded?.(data)
            })
            .catch(() => undefined)
    }, [companyId, dashboard, onDashboardLoaded])

    const loadDashboard = useCallback(() => {
        setLoading(true)
        setError('')
        const asOf = asOfDate ? dayjs(asOfDate).format('YYYY-MM-DD') : undefined
        const from = periodFrom ? dayjs(periodFrom).format('YYYY-MM-DD') : undefined
        const to = periodTo ? dayjs(periodTo).format('YYYY-MM-DD') : undefined
        return accountsPayableService
            .fetchDashboard({ companyId, asOfDate: asOf, fromDate: from, toDate: to })
            .then((data) => {
                setDashboard(data)
                onDashboardLoaded?.(data)
            })
            .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'))
            .finally(() => setLoading(false))
    }, [companyId, asOfDate, periodFrom, periodTo, onDashboardLoaded])

    useEffect(() => {
        if (tab === 'overview') void loadDashboard()
    }, [tab, loadDashboard])

    useEffect(() => {
        if (tab !== 'aging') return
        setLoading(true)
        setError('')
        const asOf = asOfDate ? dayjs(asOfDate).format('YYYY-MM-DD') : undefined
        accountsPayableService
            .fetchAging(companyId, asOf)
            .then(setAging)
            .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'))
            .finally(() => setLoading(false))
    }, [tab, companyId, asOfDate])

    useEffect(() => {
        if (tab !== 'reconciliation') return
        setLoading(true)
        setError('')
        accountsPayableService
            .fetchReconciliation(companyId)
            .then(setRecon)
            .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'))
            .finally(() => setLoading(false))
    }, [tab, companyId])

    useEffect(() => {
        if (tab !== 'proposals') return
        setLoading(true)
        setError('')
        const asOf = asOfDate ? dayjs(asOfDate).format('YYYY-MM-DD') : undefined
        accountsPayableService
            .fetchPaymentProposals(companyId, asOf)
            .then(setProposals)
            .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'))
            .finally(() => setLoading(false))
    }, [tab, companyId, asOfDate])

    const loadStatement = () => {
        if (!statementSupplierId.trim()) {
            setError('Enter a supplier id for the statement.')
            return
        }
        setLoading(true)
        setError('')
        accountsPayableService
            .fetchSupplierStatement({
                companyId,
                supplierId: statementSupplierId.trim(),
                fromDate: periodFrom ? dayjs(periodFrom).format('YYYY-MM-DD') : undefined,
                toDate: periodTo ? dayjs(periodTo).format('YYYY-MM-DD') : undefined,
            })
            .then(setStatement)
            .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'))
            .finally(() => setLoading(false))
    }

    const proposalColumns = useMemo<ColumnDef<ApPaymentProposal>[]>(
        () => [
            {
                header: 'Supplier',
                cell: ({ row }) => (
                    <FicoCodeCell
                        icon="posting"
                        code={row.original.supplier.supplierCode}
                        name={row.original.supplier.supplierName}
                    />
                ),
            },
            {
                header: 'Open payables',
                cell: ({ row }) =>
                    formatMoney(
                        row.original.currencyCode,
                        String(num(row.original.totalOpenAmount)),
                    ),
            },
            {
                header: 'Overdue',
                cell: ({ row }) => (
                    <span
                        className={
                            num(row.original.overdueAmount) > 0
                                ? 'tabular-nums font-medium text-amber-700'
                                : 'tabular-nums text-gray-600'
                        }
                    >
                        {formatMoney(
                            row.original.currencyCode,
                            String(num(row.original.overdueAmount)),
                        )}
                    </span>
                ),
            },
            {
                header: 'Items',
                accessorKey: 'itemCount',
            },
            {
                header: 'Next due',
                cell: ({ row }) => formatFicoDate(row.original.earliestDueDate),
            },
            {
                header: '',
                id: 'actions',
                cell: ({ row }) =>
                    onPayProposal ? (
                        <Button
                            size="xs"
                            variant="solid"
                            onClick={() => onPayProposal(row.original)}
                        >
                            Pay…
                        </Button>
                    ) : null,
            },
        ],
        [onPayProposal],
    )

    const reconColumns = useMemo<ColumnDef<ApReconciliationReport['accounts'][number]>>(
        () => [
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
                header: 'G/L balance',
                cell: ({ row }) => (
                    <span className="tabular-nums">
                        {formatMoney(currency, String(num(row.original.generalLedgerBalance)))}
                    </span>
                ),
            },
            {
                header: 'AP subledger',
                cell: ({ row }) => (
                    <span className="tabular-nums">
                        {formatMoney(currency, String(num(row.original.subledgerBalance)))}
                    </span>
                ),
            },
            {
                header: 'Difference',
                cell: ({ row }) => {
                    const diff = num(row.original.difference)
                    return (
                        <span
                            className={
                                diff === 0
                                    ? 'tabular-nums text-emerald-600'
                                    : 'tabular-nums font-semibold text-amber-700'
                            }
                        >
                            {formatMoney(currency, String(diff))}
                        </span>
                    )
                },
            },
        ],
        [currency],
    )

    const agingColumns = useMemo<ColumnDef<ApAgingReport['items'][number]>[]>(
        () => [
            {
                header: 'Supplier',
                cell: ({ row }) =>
                    row.original.supplier ? (
                        <FicoCodeCell
                            icon="posting"
                            code={row.original.supplier.supplierCode}
                            name={row.original.supplier.supplierName}
                        />
                    ) : (
                        '—'
                    ),
            },
            {
                header: 'Reference',
                cell: ({ row }) => (
                    <span className="font-mono text-xs">
                        {row.original.document?.referenceNumber ?? '—'}
                    </span>
                ),
            },
            {
                header: 'Due',
                cell: ({ row }) => formatFicoDate(row.original.dueDate),
            },
            {
                header: 'Open',
                cell: ({ row }) =>
                    formatMoney(
                        row.original.currencyCode,
                        String(num(row.original.openAmount)),
                    ),
            },
            {
                header: 'Days overdue',
                accessorKey: 'overdueDays',
                cell: ({ row }) => {
                    const days = Number(row.original.overdueDays ?? 0)
                    return (
                        <span
                            className={
                                days > 0
                                    ? 'tabular-nums font-medium text-amber-700'
                                    : 'tabular-nums text-gray-500'
                            }
                        >
                            {days > 0 ? days : '—'}
                        </span>
                    )
                },
            },
        ],
        [],
    )

    const statementColumns = useMemo<ColumnDef<ApSupplierStatement['entries'][number]>[]>(
        () => [
            {
                header: 'Date',
                cell: ({ row }) => formatFicoDate(row.original.date),
            },
            {
                header: 'Document',
                cell: ({ row }) => (
                    <span className="text-sm">
                        {row.original.documentType}
                        {row.original.reference ? (
                            <span className="ml-1 font-mono text-xs text-gray-500">
                                {row.original.reference}
                            </span>
                        ) : null}
                    </span>
                ),
            },
            {
                header: 'Debit',
                cell: ({ row }) => (
                    <span className="tabular-nums">
                        {formatMoney(currency, String(num(row.original.debitAmount)))}
                    </span>
                ),
            },
            {
                header: 'Credit',
                cell: ({ row }) => (
                    <span className="tabular-nums">
                        {formatMoney(currency, String(num(row.original.creditAmount)))}
                    </span>
                ),
            },
            {
                header: 'Running balance',
                cell: ({ row }) => (
                    <span className="tabular-nums font-medium">
                        {formatMoney(currency, String(num(row.original.runningBalance)))}
                    </span>
                ),
            },
        ],
        [currency],
    )

    const overviewMetrics = useMemo(() => {
        if (!dashboard) return []
        return [
            {
                label: 'Total outstanding',
                value: formatMoney(dashboard.baseCurrency, dashboard.totalOutstanding),
                emphasize: true,
            },
            {
                label: 'Overdue',
                value: formatMoney(dashboard.baseCurrency, dashboard.totalOverdue),
                tone: 'warning' as const,
            },
            {
                label: 'Due in 7 days',
                value: formatMoney(dashboard.baseCurrency, dashboard.dueWithin7Days),
            },
            {
                label: 'Due in 30 days',
                value: formatMoney(dashboard.baseCurrency, dashboard.dueWithin30Days),
            },
            {
                label: 'Payments in period',
                value: `${formatMoney(dashboard.baseCurrency, dashboard.paymentsInPeriodAmount)} (${dashboard.paymentsInPeriodCount})`,
            },
            {
                label: 'Supplier advances / credits',
                value: formatMoney(dashboard.baseCurrency, dashboard.supplierAdvanceBalance),
            },
            {
                label: 'Blocked invoices',
                value: String(dashboard.blockedInvoices),
            },
            {
                label: 'Blocked open items',
                value: String(dashboard.blockedOpenItems),
            },
            {
                label: 'Posting exceptions',
                value: String(dashboard.postingExceptions),
            },
        ]
    }, [dashboard])

    type AgingBucketRow = { bucket: string; amount: string | number }

    const agingBucketRows = useMemo<AgingBucketRow[]>(() => {
        if (!dashboard) return []
        return [
            { bucket: 'Current', amount: dashboard.agingBuckets.current },
            { bucket: '1–30 days', amount: dashboard.agingBuckets.days1To30 },
            { bucket: '31–60 days', amount: dashboard.agingBuckets.days31To60 },
            { bucket: '61–90 days', amount: dashboard.agingBuckets.days61To90 },
            { bucket: '90+ days', amount: dashboard.agingBuckets.over90 },
            {
                bucket: 'Supplier credits',
                amount: dashboard.agingBuckets.supplierCredits,
            },
        ]
    }, [dashboard])

    const agingBucketColumns = useMemo<ColumnDef<AgingBucketRow>[]>(
        () => [
            { header: 'Bucket', accessorKey: 'bucket' },
            {
                header: 'Amount',
                cell: ({ row }) => (
                    <span className="tabular-nums font-medium">
                        {formatMoney(
                            dashboard?.baseCurrency ?? currency,
                            String(row.original.amount),
                        )}
                    </span>
                ),
            },
        ],
        [currency, dashboard?.baseCurrency],
    )

    if (tab === 'adjustments') {
        return (
            <AdaptiveCard className="mt-4" bodyClass="p-5">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Credits, adjustments &amp; advances
                </h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    Use <strong>New adjustment / invoice</strong> in the toolbar to post credit memos,
                    debit adjustments, supplier advances, or direct expense / non-PO invoices. Posted
                    documents appear under Invoices and Open items with journal links.
                </p>
            </AdaptiveCard>
        )
    }

    return (
        <div className="mt-4 space-y-4">
            <FicoWorkbenchAlert message={error} onDismiss={() => setError('')} />

            {tab === 'overview' || tab === 'aging' || tab === 'proposals' ? (
                <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200/90 bg-gray-50/50 p-3 dark:border-gray-800 dark:bg-gray-900/30">
                    <FormItem label="As-of" className="mb-0">
                        <DatePicker value={asOfDate} onChange={(d) => setAsOfDate(d)} size="sm" />
                    </FormItem>
                    {tab === 'overview' ? (
                        <>
                            <FormItem label="Payments from" className="mb-0">
                                <DatePicker
                                    value={periodFrom}
                                    onChange={(d) => setPeriodFrom(d)}
                                    size="sm"
                                />
                            </FormItem>
                            <FormItem label="To" className="mb-0">
                                <DatePicker
                                    value={periodTo}
                                    onChange={(d) => setPeriodTo(d)}
                                    size="sm"
                                />
                            </FormItem>
                            <Button
                                size="sm"
                                variant="solid"
                                loading={loading}
                                onClick={() => void loadDashboard()}
                            >
                                Refresh
                            </Button>
                        </>
                    ) : null}
                </div>
            ) : null}

            {tab === 'overview' && dashboard ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {overviewMetrics.map((metric) => (
                        <AdaptiveCard key={metric.label} bodyClass="p-4">
                            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                                {metric.label}
                            </dt>
                            <dd
                                className={`mt-1 tabular-nums ${
                                    metric.emphasize
                                        ? 'text-xl font-semibold text-gray-900 dark:text-gray-100'
                                        : metric.tone === 'warning'
                                          ? 'text-lg font-semibold text-amber-700'
                                          : 'text-base font-medium text-gray-900 dark:text-gray-100'
                                }`}
                            >
                                {metric.value}
                            </dd>
                        </AdaptiveCard>
                    ))}
                </div>
            ) : null}

            {tab === 'overview' && dashboard ? (
                <FicoLedgerTable
                    title="Aging breakdown"
                    description="Open payable exposure by aging bucket (as-of date above)."
                    columns={agingBucketColumns}
                    data={agingBucketRows}
                    hidePagination
                    tableMinWidthClass="min-w-[480px]"
                />
            ) : null}

            {tab === 'aging' ? (
                <FicoLedgerTable
                    title="Aging detail"
                    description="Open items with days past due for the as-of date."
                    columns={agingColumns}
                    data={aging?.items ?? []}
                    loading={loading}
                    noData={!loading && !aging?.items?.length}
                    tableMinWidthClass="min-w-[960px]"
                />
            ) : null}

            {tab === 'reconciliation' ? (
                <FicoLedgerTable
                    title="AP control accounts"
                    description="G/L balances versus AP subledger totals."
                    toolbar={
                        recon ? (
                            <StatusBadge
                                status={recon.reconciled ? 'Reconciled' : 'Variance'}
                                tone={recon.reconciled ? 'success' : 'warning'}
                            />
                        ) : null
                    }
                    columns={reconColumns}
                    data={recon?.accounts ?? []}
                    loading={loading}
                    noData={!loading && !recon?.accounts?.length}
                    tableMinWidthClass="min-w-[880px]"
                />
            ) : null}

            {tab === 'proposals' ? (
                <FicoLedgerTable
                    title="Payment proposals"
                    description="Suppliers with open payables suggested for settlement."
                    columns={proposalColumns}
                    data={proposals}
                    loading={loading}
                    noData={!loading && !proposals.length}
                    tableMinWidthClass="min-w-[920px]"
                />
            ) : null}

            {tab === 'statements' ? (
                <div className="space-y-4">
                    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200/90 bg-gray-50/50 p-3 dark:border-gray-800 dark:bg-gray-900/30">
                        <FormItem label="Supplier id" className="mb-0">
                            <Input
                                size="sm"
                                className="min-w-[240px]"
                                value={statementSupplierId}
                                onChange={(e) => setStatementSupplierId(e.target.value)}
                                placeholder="Paste supplier id from open items"
                            />
                        </FormItem>
                        <FormItem label="From" className="mb-0">
                            <DatePicker
                                value={periodFrom}
                                onChange={(d) => setPeriodFrom(d)}
                                size="sm"
                            />
                        </FormItem>
                        <FormItem label="To" className="mb-0">
                            <DatePicker
                                value={periodTo}
                                onChange={(d) => setPeriodTo(d)}
                                size="sm"
                            />
                        </FormItem>
                        <Button size="sm" variant="solid" loading={loading} onClick={loadStatement}>
                            Load statement
                        </Button>
                    </div>

                    {statement ? (
                        <div className="grid gap-3 sm:grid-cols-3">
                            {[
                                ['Net open balance', statement.summary.netOpenBalance],
                                ['Open payables', statement.summary.openPayableBalance],
                                ['Open credits', statement.summary.openCreditBalance],
                            ].map(([label, amount]) => (
                                <AdaptiveCard key={String(label)} bodyClass="p-4">
                                    <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                                        {label}
                                    </dt>
                                    <dd className="mt-1 text-lg font-semibold tabular-nums">
                                        {formatMoney(currency, String(num(amount)))}
                                    </dd>
                                </AdaptiveCard>
                            ))}
                        </div>
                    ) : null}

                    {statement ? (
                        <FicoLedgerTable
                            title={
                                statement.supplier
                                    ? `${statement.supplier.supplierName} · statement`
                                    : 'Supplier statement'
                            }
                            description="Chronological movement with running balance."
                            columns={statementColumns}
                            data={statement.entries}
                            loading={loading}
                            noData={!statement.entries.length}
                            tableMinWidthClass="min-w-[880px]"
                        />
                    ) : null}
                </div>
            ) : null}

            {loading &&
            tab === 'overview' &&
            !dashboard &&
            !aging &&
            !recon &&
            !proposals.length ? (
                <p className="text-sm text-gray-500">Loading…</p>
            ) : null}
        </div>
    )
}

export default ApFinancialInsights