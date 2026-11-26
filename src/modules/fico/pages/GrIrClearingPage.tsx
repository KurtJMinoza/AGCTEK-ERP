'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { ColumnDef } from '@tanstack/react-table'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import FilterBar from '@/components/shared/FilterBar'
import StatCard from '@/components/shared/StatCard'
import StatusBadge from '@/components/shared/StatusBadge'
import Button from '@/components/ui/Button'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    FicoCompanySelect,
    useFicoCompanies,
} from '../components/FicoCompanySelect'
import FicoResponsiveTable from '../components/FicoResponsiveTable'
import { FicoCodeCell } from '../components/ficoTableUi'
import { formatMoney } from '../components/journal/journalUi'
import FicoWorkbenchTabBar from '../components/workbench/FicoWorkbenchTabBar'
import {
    FicoCompanyRequired,
    FicoTableToolbar,
    FicoWorkbenchAlert,
    FicoWorkbenchPanel,
} from '../components/workbench/FicoWorkbenchChrome'
import { grirService, type GrIrWorkbenchRow } from '../services/grirService'
import { HiOutlineRefresh, HiOutlineScale } from 'react-icons/hi'

const ROUTE = '/modules/fico/grir-clearing'

type TabKey = 'lines' | 'gl'

const GrIrClearingPage = () => {
    const { companies, companyId, setCompanyId, loading: companyLoading } =
        useFicoCompanies()
    const [tab, setTab] = useState<TabKey>('lines')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [outstandingOnly, setOutstandingOnly] = useState(true)
    const [data, setData] = useState<Awaited<
        ReturnType<typeof grirService.fetchWorkbench>
    > | null>(null)

    const load = useCallback(() => {
        if (!companyId) return
        setLoading(true)
        setError('')
        grirService
            .fetchWorkbench({
                companyId,
                outstandingOnly,
                backfill: true,
            })
            .then(setData)
            .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'))
            .finally(() => setLoading(false))
    }, [companyId, outstandingOnly])

    useEffect(() => {
        load()
    }, [load])

    const currency = data?.items[0]?.currencyCode ?? 'PHP'

    const filterChips = useMemo(() => {
        if (!outstandingOnly) return []
        return [
            {
                key: 'outstanding',
                label: 'Outstanding only',
                onRemove: () => setOutstandingOnly(false),
            },
        ]
    }, [outstandingOnly])

    const columns = useMemo<ColumnDef<GrIrWorkbenchRow>[]>(
        () => [
            {
                header: 'Goods receipt',
                cell: ({ row }) => (
                    <FicoCodeCell
                        icon="posting"
                        code={row.original.goodsReceiptNumber}
                        name={row.original.poNumber ? `PO ${row.original.poNumber}` : undefined}
                    />
                ),
            },
            {
                header: 'Supplier',
                cell: ({ row }) =>
                    row.original.supplier?.supplierName ?? '—',
            },
            {
                header: 'Material',
                cell: ({ row }) => row.original.material?.materialCode ?? '—',
            },
            {
                header: 'Outstanding',
                cell: ({ row }) => (
                    <span className="tabular-nums font-medium">
                        {formatMoney(row.original.currencyCode, row.original.outstandingAmount)}
                    </span>
                ),
            },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <StatusBadge
                        status={row.original.reconciliationStatus}
                        tone={
                            row.original.reconciliationStatus === 'FULLY_MATCHED'
                                ? 'success'
                                : row.original.reconciliationStatus === 'GR_NOT_INVOICED'
                                  ? 'warning'
                                  : 'neutral'
                        }
                    />
                ),
            },
            {
                header: 'Age',
                accessorKey: 'agingDays',
                size: 72,
            },
            {
                header: 'Journal',
                cell: ({ row }) =>
                    row.original.lastInvoiceJournalEntryId ? (
                        <Link
                            className="text-xs font-medium text-primary hover:underline"
                            href={`/modules/fico/journal-entries/${row.original.lastInvoiceJournalEntryId}`}
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

    return (
        <PageContainer>
            <PageHeader
                title="GR/IR clearing"
                description="Procurement clearing workbench — GR/IR open positions, match status, and control-account reconciliation."
                breadcrumbs={buildErpBreadcrumbs(ROUTE)}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <FicoCompanySelect
                            companies={companies}
                            value={companyId}
                            onChange={setCompanyId}
                            loading={companyLoading}
                            allowAll={false}
                        />
                        <Button
                            size="sm"
                            variant="plain"
                            loading={loading}
                            icon={<HiOutlineRefresh />}
                            onClick={load}
                        >
                            Refresh
                        </Button>
                    </div>
                }
            />

            {!companyId ? (
                <FicoCompanyRequired />
            ) : data ? (
                <>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
                        <StatCard
                            label="Outstanding GR/IR"
                            value={formatMoney(currency, data.summary.outstandingAmount)}
                        />
                        <StatCard
                            label="GR not invoiced"
                            value={String(data.summary.grNotInvoicedCount)}
                            tone="warning"
                        />
                        <StatCard
                            label="Blocked invoices"
                            value={String(data.summary.blockedInvoiceCount)}
                        />
                        <StatCard
                            label="G/L variance"
                            value={formatMoney(currency, data.glReconciliation.variance)}
                            tone={data.glReconciliation.reconciled ? 'success' : 'warning'}
                            icon={<HiOutlineScale />}
                            badge={
                                data.glReconciliation.reconciled
                                    ? { tone: 'success', label: 'Reconciled' }
                                    : { tone: 'warning', label: 'Review' }
                            }
                        />
                    </div>

                    <FilterBar
                        className="mb-4"
                        fields={[
                            {
                                key: 'scope',
                                label: 'Scope',
                                kind: 'select',
                                value: outstandingOnly ? 'outstanding' : 'all',
                                options: [
                                    { value: 'outstanding', label: 'Outstanding only' },
                                    { value: 'all', label: 'All lines' },
                                ],
                                onChange: (v) => setOutstandingOnly(v === 'outstanding'),
                            },
                        ]}
                        chips={filterChips}
                        onClear={() => setOutstandingOnly(false)}
                        actions={
                            <Button size="sm" variant="solid" loading={loading} onClick={load}>
                                Apply
                            </Button>
                        }
                    />

                    <FicoWorkbenchPanel>
                        <FicoWorkbenchTabBar
                            value={tab}
                            onChange={(v) => setTab(v as TabKey)}
                            tabs={[
                                { value: 'lines', label: 'Open lines' },
                                { value: 'gl', label: 'G/L reconciliation' },
                            ]}
                        />
                        <FicoWorkbenchAlert message={error} onDismiss={() => setError('')} />

                        {tab === 'lines' ? (
                            <div className="mt-4">
                                <FicoTableToolbar
                                    title="GR/IR positions"
                                    description={`Invoice before receipt: ${data.summary.invoiceBeforeReceiptCount} · Fully matched: ${data.summary.fullyMatchedCount}`}
                                />
                                <FicoResponsiveTable
                                    columns={columns}
                                    data={data.items}
                                    loading={loading}
                                    noData={!loading && !data.items.length}
                                    tableMinWidthClass="min-w-[960px]"
                                />
                            </div>
                        ) : null}

                        {tab === 'gl' ? (
                            <div className="mt-4 grid gap-4 sm:grid-cols-3">
                                <StatCard
                                    label="GR/IR G/L balance"
                                    value={formatMoney(
                                        currency,
                                        data.glReconciliation.grirGlBalance,
                                    )}
                                />
                                <StatCard
                                    label="Expected subledger"
                                    value={formatMoney(
                                        currency,
                                        data.glReconciliation.expectedGrIrBalance,
                                    )}
                                />
                                <StatCard
                                    label="Variance"
                                    value={formatMoney(
                                        currency,
                                        data.glReconciliation.variance,
                                    )}
                                    tone={
                                        data.glReconciliation.reconciled
                                            ? 'success'
                                            : 'warning'
                                    }
                                />
                            </div>
                        ) : null}
                    </FicoWorkbenchPanel>
                </>
            ) : (
                <p className="text-sm text-gray-500">Loading workbench…</p>
            )}
        </PageContainer>
    )
}

export default GrIrClearingPage