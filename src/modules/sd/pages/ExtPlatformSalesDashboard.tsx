'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import {
    HiOutlineClipboardCheck,
    HiOutlineDocumentAdd,
    HiOutlineEye,
    HiOutlinePencil,
    HiOutlineRefresh,
    HiOutlineSearch,
    HiOutlineTrash,
} from 'react-icons/hi'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import { type ColumnDef } from '@/components/shared/DataTable'
import SdDataTable from '../components/SdDataTable'
import { type StatusTone } from '@/components/shared/StatusBadge'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { sdParentBreadcrumbs } from '../utils/sdPageUi'
import {
    SdCompanyIdentityCell,
    SdDateCell,
    SdDocCell,
    SdMoneyCell,
    SdStatusBadgeCell,
    SdTrackingValuesCell,
} from '../components/SdDataTableCells'
import Loading from '@/components/shared/Loading'
import { rcvMobileCardEnterClass } from '@/modules/mm/receiving/components/receivingTableUi'
import ExtPlatformTransactionDialog from '../components/ExtPlatformTransactionDialog'
import ExtPlatformTransactionDetailDialog from '../components/ExtPlatformTransactionDetailDialog'
import { SourceBadge } from '../components/extPlatformUi'
import { orgService } from '@/modules/mm/material-master/services/referenceService'
import {
    fetchSalesSources,
    fetchExtPlatformTransactions,
    fetchExtPlatformReportSummary,
    updateExtPlatformTransactionStatus,
    deleteExtPlatformTransaction,
} from '../services/extPlatformService'
import type {
    SalesSource,
    ExtPlatformTransaction,
    ExtPlatformReportSummary,
} from '../types/extPlatform'

const ROUTE_PATH = '/modules/sd/ext-platform-sales'

// ── Status styling ──

const STATUS_META: Record<string, { label: string; tone: StatusTone }> = {
    DRAFT: { label: 'Draft', tone: 'default' },
    CONFIRMED: { label: 'Confirmed', tone: 'info' },
    APPROVED: { label: 'Approved', tone: 'success' },
    CANCELLED: { label: 'Cancelled', tone: 'danger' },
}

const formatMoney = (v: number | string | null | undefined) => {
    const n = Number(v ?? 0)
    return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ── Main page ──

export default function ExtPlatformSalesDashboard() {
    // Master data
    const [sources, setSources] = useState<SalesSource[]>([])
    const [companies, setCompanies] = useState<{ value: string; label: string }[]>([])

    // List state
    const [transactions, setTransactions] = useState<ExtPlatformTransaction[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [filterSource, setFilterSource] = useState('')
    const [filterCompany, setFilterCompany] = useState('')
    const [filterStatus, setFilterStatus] = useState('')
    const [summary, setSummary] = useState<ExtPlatformReportSummary | null>(null)

    // Entry dialog: closed, new transaction, or a draft being edited
    const [entry, setEntry] = useState<
        { mode: 'create' } | { mode: 'edit'; tx: ExtPlatformTransaction } | null
    >(null)

    // Detail dialog
    const [detailTx, setDetailTx] = useState<ExtPlatformTransaction | null>(null)

    // Delete confirm
    const [deleteTx, setDeleteTx] = useState<ExtPlatformTransaction | null>(null)

    // ── Load master data ──

    useEffect(() => {
        fetchSalesSources()
            .then(setSources)
            .catch(() => {})

        orgService
            .companies()
            .then((list) =>
                setCompanies(list.map((c) => ({ value: c.id, label: c.name }))),
            )
            .catch(() => {})
    }, [])

    // ── Load transactions ──

    const loadTransactions = useCallback(async () => {
        setLoading(true)
        try {
            const params: Record<string, string | number> = { limit: 200 }
            if (filterCompany) params.companyId = filterCompany
            if (filterSource) params.salesSourceId = filterSource
            if (filterStatus) params.status = filterStatus
            if (search) params.search = search
            const result = await fetchExtPlatformTransactions(params)
            setTransactions(result.data)
            setTotal(result.total)
        } catch {
            // silent
        } finally {
            setLoading(false)
        }
    }, [filterCompany, filterSource, filterStatus, search])

    useEffect(() => {
        loadTransactions()
    }, [loadTransactions])

    // ── Load summary ──

    const loadSummary = useCallback(async () => {
        try {
            const params: Record<string, string> = {}
            if (filterCompany) params.companyId = filterCompany
            if (filterSource) params.salesSourceId = filterSource
            const res = await fetchExtPlatformReportSummary(params)
            setSummary(res)
        } catch {
            // silent
        }
    }, [filterCompany, filterSource])

    useEffect(() => {
        loadSummary()
    }, [loadSummary])

    // ── Source options ──

    const sourceOptions = useMemo(
        () => [
            { value: '', label: 'All Sources' },
            ...sources
                .filter((s) => s.isActive)
                .map((s) => ({ value: s.id, label: s.name })),
        ],
        [sources],
    )

    const sourceMap = useMemo(
        () => Object.fromEntries(sources.map((s) => [s.id, s])),
        [sources],
    )

    // ── Table columns ──

    const columns = useMemo<ColumnDef<ExtPlatformTransaction>[]>(
        () => [
            {
                header: 'Transaction',
                accessorKey: 'transactionNumber',
                size: 188,
                minSize: 168,
                enableSorting: false,
                cell: ({ row }) => (
                    <button
                        type="button"
                        className="min-w-0 text-left"
                        onClick={() => setDetailTx(row.original)}
                    >
                        <SdDocCell
                            primary={row.original.transactionNumber}
                            secondary={dayjs(row.original.transactionDate).format('MMM D, YYYY')}
                        />
                    </button>
                ),
            },
            {
                header: 'Date',
                accessorKey: 'transactionDate',
                size: 132,
                minSize: 120,
                meta: { className: 'hidden xl:table-cell' },
                cell: ({ row }) => (
                    <SdDateCell value={row.original.transactionDate} />
                ),
            },
            {
                header: 'Source',
                accessorKey: 'salesSource',
                size: 156,
                minSize: 132,
                enableSorting: false,
                cell: ({ row }) => (
                    <SourceBadge source={row.original.salesSource} />
                ),
            },
            {
                header: 'Ref',
                accessorKey: 'externalOrderRef',
                size: 132,
                minSize: 112,
                meta: { className: 'hidden 2xl:table-cell' },
                cell: ({ row }) =>
                    row.original.externalOrderRef ? (
                        <span className="block max-w-[7.5rem] truncate font-mono text-xs text-gray-700 dark:text-gray-300 xl:max-w-[9rem]">
                            {row.original.externalOrderRef}
                        </span>
                    ) : (
                        <span className="text-gray-400">—</span>
                    ),
            },
            {
                header: 'Company',
                accessorKey: 'company.name',
                size: 160,
                minSize: 140,
                meta: { className: 'hidden 2xl:table-cell' },
                cell: ({ row }) => (
                    <SdCompanyIdentityCell
                        title={row.original.company?.name ?? '—'}
                        subtitle={row.original.company?.code}
                    />
                ),
            },
            {
                header: 'Customer',
                accessorKey: 'customerName',
                size: 172,
                minSize: 148,
                meta: { className: 'hidden xl:table-cell' },
                cell: ({ row }) => {
                    const name =
                        row.original.customer?.companyName ||
                        row.original.customerName ||
                        '—'
                    return (
                        <SdCompanyIdentityCell
                            title={name}
                            subtitle={row.original.customer?.customerNumber ?? undefined}
                        />
                    )
                },
            },
            {
                header: 'Lines',
                accessorKey: 'lines',
                size: 76,
                minSize: 68,
                meta: { className: 'hidden lg:table-cell' },
                enableSorting: false,
                cell: ({ row }) => (
                    <span className="tabular-nums text-sm font-medium">
                        {row.original.lines?.length ?? 0}
                    </span>
                ),
            },
            {
                header: 'Batch',
                id: 'lineBatches',
                size: 128,
                minSize: 108,
                meta: { className: 'hidden lg:table-cell' },
                enableSorting: false,
                cell: ({ row }) => (
                    <SdTrackingValuesCell
                        values={[
                            ...new Set(
                                (row.original.lines ?? [])
                                    .map((l) => l.batchNumber)
                                    .filter((v): v is string => Boolean(v)),
                            ),
                        ]}
                    />
                ),
            },
            {
                header: 'Lot',
                id: 'lineLots',
                size: 120,
                minSize: 100,
                meta: { className: 'hidden lg:table-cell' },
                enableSorting: false,
                cell: ({ row }) => (
                    <SdTrackingValuesCell
                        values={[
                            ...new Set(
                                (row.original.lines ?? [])
                                    .map((l) => l.lotNumber)
                                    .filter((v): v is string => Boolean(v)),
                            ),
                        ]}
                    />
                ),
            },
            {
                header: 'Total',
                accessorKey: 'grandTotal',
                size: 118,
                minSize: 104,
                enableSorting: false,
                cell: ({ row }) => (
                    <SdMoneyCell
                        amount={Number(row.original.grandTotal)}
                        emphasize
                    />
                ),
            },
            {
                header: 'Tax',
                accessorKey: 'taxTotal',
                size: 112,
                minSize: 100,
                meta: { className: 'hidden xl:table-cell' },
                enableSorting: false,
                cell: ({ row }) => (
                    <SdMoneyCell amount={Number(row.original.taxTotal)} />
                ),
            },
            {
                header: 'Status',
                accessorKey: 'status',
                size: 120,
                minSize: 100,
                cell: ({ row }) => {
                    const meta = STATUS_META[row.original.status] ?? {
                        label: row.original.status,
                        tone: 'default' as StatusTone,
                    }
                    return (
                        <SdStatusBadgeCell
                            label={meta.label}
                            tone={meta.tone}
                        />
                    )
                },
            },
            {
                header: '',
                id: 'actions',
                size: 148,
                minSize: 132,
                enableSorting: false,
                cell: ({ row }) => (
                    <div className="flex shrink-0 justify-end gap-0.5">
                        <Button
                            size="xs"
                            variant="plain"
                            icon={<HiOutlineEye />}
                            onClick={() => setDetailTx(row.original)}
                        />
                        {row.original.status === 'DRAFT' && (
                            <>
                                <Button
                                    size="xs"
                                    variant="plain"
                                    title="Edit draft"
                                    icon={<HiOutlinePencil />}
                                    onClick={() =>
                                        setEntry({ mode: 'edit', tx: row.original })
                                    }
                                />
                                <Button
                                    size="xs"
                                    variant="plain"
                                    title="Confirm"
                                    icon={<HiOutlineClipboardCheck />}
                                    onClick={() => handleConfirm(row.original)}
                                />
                                <Button
                                    size="xs"
                                    variant="plain"
                                    className="text-red-500"
                                    icon={<HiOutlineTrash />}
                                    onClick={() => setDeleteTx(row.original)}
                                />
                            </>
                        )}
                        {row.original.status === 'CONFIRMED' && (
                            <Button
                                size="xs"
                                variant="plain"
                                icon={<HiOutlineClipboardCheck />}
                                onClick={() => handleApprove(row.original)}
                            />
                        )}
                    </div>
                ),
            },
        ],
        // Row actions reload with the current filters.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [loadTransactions, loadSummary],
    )

    // ── Actions ──

    const handleConfirm = async (tx: ExtPlatformTransaction) => {
        try {
            await updateExtPlatformTransactionStatus(tx.id, 'CONFIRMED')
            toast.push(
                <Notification type="success" title="Confirmed">
                    {tx.transactionNumber} confirmed.
                </Notification>,
            )
            loadTransactions()
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error'
            toast.push(
                <Notification type="danger" title="Error">
                    {msg}
                </Notification>,
            )
        }
    }

    const handleApprove = async (tx: ExtPlatformTransaction) => {
        try {
            await updateExtPlatformTransactionStatus(tx.id, 'APPROVED')
            toast.push(
                <Notification type="success" title="Approved">
                    {tx.transactionNumber} approved
                    {tx.isCompanyInventory ? ' — stock deducted from MM.' : ' (third-party stock, no MM deduction).'}
                </Notification>,
            )
            loadTransactions()
            loadSummary()
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error'
            toast.push(
                <Notification type="danger" title="Error">
                    {msg}
                </Notification>,
            )
        }
    }

    const handleDelete = async () => {
        if (!deleteTx) return
        try {
            await deleteExtPlatformTransaction(deleteTx.id)
            toast.push(
                <Notification type="success" title="Deleted">
                    {deleteTx.transactionNumber} deleted.
                </Notification>,
            )
            setDeleteTx(null)
            loadTransactions()
            loadSummary()
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error'
            toast.push(
                <Notification type="danger" title="Error">
                    {msg}
                </Notification>,
            )
        }
    }

    const handleSaved = (tx: ExtPlatformTransaction) => {
        const edited = entry?.mode === 'edit'
        toast.push(
            <Notification type="success" title={edited ? 'Saved' : 'Created'}>
                {tx.transactionNumber} {edited ? 'updated' : 'saved as draft'}.
            </Notification>,
        )
        setEntry(null)
        loadTransactions()
        loadSummary()
    }

    return (
        <PageContainer>
            <PageHeader
                title="External Platform Sales"
                breadcrumbs={sdParentBreadcrumbs(ROUTE_PATH)}
            />

            {/* ── Summary cards ── */}
            {summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4 mb-6">
                    <AdaptiveCard>
                        <div className="text-gray-500 text-xs mb-1">
                            Transactions
                        </div>
                        <div className="text-xl font-bold">
                            {summary.totalTransactions}
                        </div>
                    </AdaptiveCard>
                    <AdaptiveCard>
                        <div className="text-gray-500 text-xs mb-1">
                            Total Sales
                        </div>
                        <div className="text-xl font-bold">
                            {formatMoney(summary.totalSales)}
                        </div>
                    </AdaptiveCard>
                    <AdaptiveCard>
                        <div className="text-gray-500 text-xs mb-1">
                            VAT / Tax
                        </div>
                        <div className="text-xl font-bold">
                            {formatMoney(summary.totalTax)}
                        </div>
                    </AdaptiveCard>
                    <AdaptiveCard>
                        <div className="text-gray-500 text-xs mb-1">
                            Discounts
                        </div>
                        <div className="text-xl font-bold">
                            {formatMoney(summary.totalDiscount)}
                        </div>
                    </AdaptiveCard>
                    <AdaptiveCard>
                        <div className="text-gray-500 text-xs mb-1">
                            Platform Fees
                        </div>
                        <div className="text-xl font-bold">
                            {formatMoney(summary.totalPlatformFees)}
                        </div>
                    </AdaptiveCard>
                    <AdaptiveCard>
                        <div className="text-gray-500 text-xs mb-1">
                            Net Settlement
                        </div>
                        <div className="text-xl font-bold text-green-600">
                            {formatMoney(summary.netSettlement)}
                        </div>
                    </AdaptiveCard>
                </div>
            )}

            {/* ── Per-source breakdown ── */}
            {summary && summary.bySource.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3 mb-6">
                    {summary.bySource.map((s) => (
                        <Card key={s.salesSourceId} bodyClass="p-3">
                            <SourceBadge
                                source={{
                                    name: s.salesSourceName,
                                    code: s.salesSourceCode,
                                    badgeColor:
                                        sourceMap[s.salesSourceId]
                                            ?.badgeColor ?? 'gray',
                                }}
                            />
                            <div className="mt-2 text-sm font-semibold">
                                {formatMoney(s.totalSales)}
                            </div>
                            <div className="text-xs text-gray-500">
                                {s.transactions} txn
                                {s.transactions !== 1 ? 's' : ''}
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* ── Tax breakdown summary ── */}
            {summary && summary.taxBreakdown.length > 0 && (
                <Card className="mb-6" bodyClass="p-4">
                    <h4 className="text-sm font-semibold mb-3">
                        Tax Breakdown
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        {summary.taxBreakdown.map((t) => (
                            <div key={t.taxClassification}>
                                <div className="text-gray-500 text-xs mb-1">
                                    {t.taxClassification === 'VATABLE'
                                        ? 'VATable Sales'
                                        : t.taxClassification === 'VAT_EXEMPT'
                                          ? 'VAT-Exempt Sales'
                                          : t.taxClassification === 'ZERO_RATED'
                                            ? 'Zero-Rated Sales'
                                            : t.taxClassification}
                                </div>
                                <div className="font-semibold">
                                    {formatMoney(t.taxableAmount)}
                                </div>
                                <div className="text-xs text-gray-500">
                                    VAT: {formatMoney(t.taxAmount)}
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {/* ── Filters + Actions bar ── */}
            <div className="flex flex-wrap gap-3 items-center mb-4">
                <div className="flex-1 min-w-[200px] max-w-sm">
                    <Input
                        size="sm"
                        placeholder="Search transactions…"
                        prefix={<HiOutlineSearch className="text-lg" />}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <Select
                    size="sm"
                    className="min-w-[160px]"
                    options={sourceOptions}
                    value={sourceOptions.find((o) => o.value === filterSource)}
                    onChange={(opt) => setFilterSource(opt?.value ?? '')}
                />
                <Select
                    size="sm"
                    className="min-w-[160px]"
                    options={[
                        { value: '', label: 'All Companies' },
                        ...companies,
                    ]}
                    value={[
                        { value: '', label: 'All Companies' },
                        ...companies,
                    ].find((o) => o.value === filterCompany)}
                    onChange={(opt) => setFilterCompany(opt?.value ?? '')}
                />
                <Select
                    size="sm"
                    className="min-w-[140px]"
                    options={[
                        { value: '', label: 'All Statuses' },
                        { value: 'DRAFT', label: 'Draft' },
                        { value: 'CONFIRMED', label: 'Confirmed' },
                        { value: 'APPROVED', label: 'Approved' },
                        { value: 'CANCELLED', label: 'Cancelled' },
                    ]}
                    value={[
                        { value: '', label: 'All Statuses' },
                        { value: 'DRAFT', label: 'Draft' },
                        { value: 'CONFIRMED', label: 'Confirmed' },
                        { value: 'APPROVED', label: 'Approved' },
                        { value: 'CANCELLED', label: 'Cancelled' },
                    ].find((o) => o.value === filterStatus)}
                    onChange={(opt) => setFilterStatus(opt?.value ?? '')}
                />
                <Button
                    size="sm"
                    variant="plain"
                    icon={<HiOutlineRefresh />}
                    onClick={() => {
                        loadTransactions()
                        loadSummary()
                    }}
                />
                <div className="ml-auto">
                    <Button
                        size="sm"
                        variant="solid"
                        icon={<HiOutlineDocumentAdd />}
                        onClick={() => setEntry({ mode: 'create' })}
                    >
                        Add External Platform Transaction
                    </Button>
                </div>
            </div>

            {/* ── Transactions table ── */}
            <Card bodyClass="p-0">
                <div className="p-3 sm:p-4">
                    <p className="mb-3 hidden text-xs text-gray-500 lg:block">
                        Wide register — scroll horizontally to see batch, lot, tax,
                        and reference columns.
                    </p>

                    <div className="lg:hidden">
                        {loading ? (
                            <div className="flex min-h-[12rem] items-center justify-center">
                                <Loading loading />
                            </div>
                        ) : transactions.length === 0 ? (
                            <p className="py-10 text-center text-sm text-gray-500">
                                No transactions match your filters.
                            </p>
                        ) : (
                            <ul className="space-y-3">
                                {transactions.map((tx, index) => {
                                    const meta = STATUS_META[tx.status] ?? {
                                        label: tx.status,
                                        tone: 'default' as StatusTone,
                                    }
                                    const batch = [
                                        ...new Set(
                                            (tx.lines ?? [])
                                                .map((l) => l.batchNumber)
                                                .filter((v): v is string =>
                                                    Boolean(v),
                                                ),
                                        ),
                                    ]
                                    const lot = [
                                        ...new Set(
                                            (tx.lines ?? [])
                                                .map((l) => l.lotNumber)
                                                .filter((v): v is string =>
                                                    Boolean(v),
                                                ),
                                        ),
                                    ]
                                    return (
                                        <li key={tx.id}>
                                            <button
                                                type="button"
                                                onClick={() => setDetailTx(tx)}
                                                className={`w-full rounded-xl border border-gray-200/90 bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-900/40 ${rcvMobileCardEnterClass(index)}`}
                                            >
                                                <div className="mb-2 flex items-start justify-between gap-2">
                                                    <SdDocCell
                                                        primary={tx.transactionNumber}
                                                        secondary={dayjs(
                                                            tx.transactionDate,
                                                        ).format('MMM D, YYYY')}
                                                    />
                                                    <SdStatusBadgeCell
                                                        label={meta.label}
                                                        tone={meta.tone}
                                                    />
                                                </div>
                                                <div className="mb-2">
                                                    <SourceBadge
                                                        source={tx.salesSource}
                                                    />
                                                </div>
                                                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                                                    <div>
                                                        <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                                            Total
                                                        </dt>
                                                        <dd className="mt-0.5">
                                                            <SdMoneyCell
                                                                amount={Number(
                                                                    tx.grandTotal,
                                                                )}
                                                                emphasize
                                                            />
                                                        </dd>
                                                    </div>
                                                    <div>
                                                        <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                                            Lines
                                                        </dt>
                                                        <dd className="mt-0.5 tabular-nums font-medium">
                                                            {tx.lines?.length ?? 0}
                                                        </dd>
                                                    </div>
                                                    {batch.length ? (
                                                        <div className="col-span-2">
                                                            <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                                                Batch
                                                            </dt>
                                                            <dd className="mt-0.5">
                                                                <SdTrackingValuesCell
                                                                    values={batch}
                                                                />
                                                            </dd>
                                                        </div>
                                                    ) : null}
                                                    {lot.length ? (
                                                        <div className="col-span-2">
                                                            <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                                                Lot
                                                            </dt>
                                                            <dd className="mt-0.5">
                                                                <SdTrackingValuesCell
                                                                    values={lot}
                                                                />
                                                            </dd>
                                                        </div>
                                                    ) : null}
                                                </dl>
                                            </button>
                                        </li>
                                    )
                                })}
                            </ul>
                        )}
                    </div>

                    <div className="hidden lg:block">
                        <SdDataTable<ExtPlatformTransaction>
                            wide
                            columns={columns}
                            data={transactions}
                            loading={loading}
                            hidePagination
                            getRowId={(row) => row.id}
                            skeletonAvatarColumns={[]}
                            pagingData={{
                                total,
                                pageIndex: 0,
                                pageSize: 200,
                            }}
                        />
                    </div>
                </div>
            </Card>

            <ExtPlatformTransactionDialog
                isOpen={entry !== null}
                editing={entry?.mode === 'edit' ? entry.tx : null}
                sources={sources}
                companies={companies}
                onClose={() => setEntry(null)}
                onSaved={handleSaved}
            />

            {/* ── Detail dialog ── */}
            <ExtPlatformTransactionDetailDialog
                transaction={detailTx}
                onClose={() => setDetailTx(null)}
                onEdit={(tx) => {
                    setDetailTx(null)
                    setEntry({ mode: 'edit', tx })
                }}
                onConfirm={(tx) => {
                    setDetailTx(null)
                    void handleConfirm(tx)
                }}
                onApprove={(tx) => {
                    setDetailTx(null)
                    void handleApprove(tx)
                }}
                onDelete={(tx) => {
                    setDetailTx(null)
                    setDeleteTx(tx)
                }}
            />

            {/* ── Delete confirm ── */}
            <ConfirmDialog
                isOpen={!!deleteTx}
                type="danger"
                title="Delete Transaction"
                onClose={() => setDeleteTx(null)}
                onConfirm={handleDelete}
            >
                <p className="text-sm">
                    Delete draft transaction{' '}
                    <strong>{deleteTx?.transactionNumber}</strong>? This cannot
                    be undone.
                </p>
            </ConfirmDialog>
        </PageContainer>
    )
}
