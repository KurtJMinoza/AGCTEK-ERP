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
import StatusBadge, { type StatusTone } from '@/components/shared/StatusBadge'
import FormDialog from '@/components/shared/FormDialog'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { sdParentBreadcrumbs } from '../utils/sdPageUi'
import { SdMoneyCell } from '../components/SdDataTableCells'
import ExtPlatformTransactionDialog from '../components/ExtPlatformTransactionDialog'
import { SourceBadge, TaxClassTag } from '../components/extPlatformUi'
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
                header: 'Transaction #',
                accessorKey: 'transactionNumber',
                cell: ({ row }) => (
                    <button
                        className="text-primary-600 hover:underline font-medium"
                        onClick={() => setDetailTx(row.original)}
                    >
                        {row.original.transactionNumber}
                    </button>
                ),
            },
            {
                header: 'Date',
                accessorKey: 'transactionDate',
                cell: ({ row }) =>
                    dayjs(row.original.transactionDate).format('MMM DD, YYYY'),
            },
            {
                header: 'Source',
                accessorKey: 'salesSource',
                cell: ({ row }) => (
                    <SourceBadge source={row.original.salesSource} />
                ),
            },
            {
                header: 'Ext. Ref',
                accessorKey: 'externalOrderRef',
                cell: ({ row }) =>
                    row.original.externalOrderRef || (
                        <span className="text-gray-400">—</span>
                    ),
            },
            {
                header: 'Company',
                accessorKey: 'company.name',
                cell: ({ row }) => row.original.company?.name ?? '',
            },
            {
                header: 'Customer',
                accessorKey: 'customerName',
                cell: ({ row }) =>
                    row.original.customer?.companyName ||
                    row.original.customerName || (
                        <span className="text-gray-400">—</span>
                    ),
            },
            {
                header: 'Items',
                accessorKey: 'lines',
                cell: ({ row }) => row.original.lines?.length ?? 0,
            },
            {
                header: 'Grand Total',
                accessorKey: 'grandTotal',
                cell: ({ row }) => (
                    <SdMoneyCell amount={Number(row.original.grandTotal)} />
                ),
            },
            {
                header: 'Tax',
                accessorKey: 'taxTotal',
                cell: ({ row }) => formatMoney(row.original.taxTotal),
            },
            {
                header: 'Status',
                accessorKey: 'status',
                cell: ({ row }) => {
                    const meta = STATUS_META[row.original.status] ?? {
                        label: row.original.status,
                        tone: 'default' as StatusTone,
                    }
                    return <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                },
            },
            {
                header: '',
                id: 'actions',
                cell: ({ row }) => (
                    <div className="flex gap-1">
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
                    {tx.transactionNumber} approved.
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

    // ── Detail dialog tax table ──

    const TaxSummaryRow = ({
        label,
        value,
    }: {
        label: string
        value: number | string
    }) => (
        <div className="flex justify-between py-1">
            <span className="text-gray-600 dark:text-gray-400">{label}</span>
            <span className="font-medium">{formatMoney(value)}</span>
        </div>
    )

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
                <SdDataTable<ExtPlatformTransaction>
                    columns={columns}
                    data={transactions}
                    loading={loading}
                    skeletonAvatarColumns={[]}
                    pagingData={{
                        total,
                        pageIndex: 0,
                        pageSize: 200,
                    }}
                />
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
            {detailTx && (
                <FormDialog
                    isOpen
                    onClose={() => setDetailTx(null)}
                    title={`${detailTx.transactionNumber} — Details`}
                    size="xl"
                    width={960}
                    closable
                    footer={
                        <Button onClick={() => setDetailTx(null)}>Close</Button>
                    }
                >
                    <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                        <div>
                            <span className="text-gray-500">Source:</span>{' '}
                            <SourceBadge source={detailTx.salesSource} />
                        </div>
                        <div>
                            <span className="text-gray-500">Status:</span>{' '}
                            <StatusBadge
                                tone={
                                    (
                                        STATUS_META[detailTx.status] ?? {
                                            tone: 'default',
                                        }
                                    ).tone
                                }
                            >
                                {STATUS_META[detailTx.status]?.label ??
                                    detailTx.status}
                            </StatusBadge>
                        </div>
                        <div>
                            <span className="text-gray-500">Date:</span>{' '}
                            {dayjs(detailTx.transactionDate).format(
                                'MMM DD, YYYY',
                            )}
                        </div>
                        <div>
                            <span className="text-gray-500">Company:</span>{' '}
                            {detailTx.company?.name}
                        </div>
                        {detailTx.branch && (
                            <div>
                                <span className="text-gray-500">Branch:</span>{' '}
                                {detailTx.branch.name}
                            </div>
                        )}
                        {(detailTx.customer || detailTx.customerName) && (
                            <div>
                                <span className="text-gray-500">
                                    Customer:
                                </span>{' '}
                                {detailTx.customer?.companyName ??
                                    detailTx.customerName}
                            </div>
                        )}
                        {detailTx.externalOrderRef && (
                            <div>
                                <span className="text-gray-500">Ext. Ref:</span>{' '}
                                {detailTx.externalOrderRef}
                            </div>
                        )}
                        {detailTx.externalPlatformName && (
                            <div>
                                <span className="text-gray-500">
                                    Platform:
                                </span>{' '}
                                {detailTx.externalPlatformName}
                            </div>
                        )}
                        {detailTx.paymentMethod && (
                            <div>
                                <span className="text-gray-500">Payment:</span>{' '}
                                {detailTx.paymentMethod}
                            </div>
                        )}
                        {detailTx.settlementReference && (
                            <div>
                                <span className="text-gray-500">
                                    Settlement:
                                </span>{' '}
                                {detailTx.settlementReference}
                            </div>
                        )}
                        <div>
                            <span className="text-gray-500">Inventory:</span>{' '}
                            {detailTx.isCompanyInventory
                                ? 'Company-Owned'
                                : 'Third-Party'}
                        </div>
                    </div>

                    {/* ── Line items with tax ── */}
                    <h4 className="text-sm font-semibold mb-2">Line Items</h4>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-xs">
                            <thead className="bg-gray-50 dark:bg-gray-800">
                                <tr>
                                    <th className="px-2 py-1.5 text-left">#</th>
                                    <th className="px-2 py-1.5 text-left">
                                        Product
                                    </th>
                                    <th className="px-2 py-1.5 text-left">
                                        SKU
                                    </th>
                                    <th className="px-2 py-1.5 text-right">
                                        Qty
                                    </th>
                                    <th className="px-2 py-1.5 text-right">
                                        Price
                                    </th>
                                    <th className="px-2 py-1.5 text-right">
                                        Discount
                                    </th>
                                    <th className="px-2 py-1.5 text-left">
                                        Tax Class
                                    </th>
                                    <th className="px-2 py-1.5 text-left">
                                        Tax Code
                                    </th>
                                    <th className="px-2 py-1.5 text-right">
                                        Tax Rate
                                    </th>
                                    <th className="px-2 py-1.5 text-right">
                                        Tax
                                    </th>
                                    <th className="px-2 py-1.5 text-right">
                                        Net
                                    </th>
                                    <th className="px-2 py-1.5 text-right">
                                        Gross
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {detailTx.lines.map((line) => (
                                    <tr
                                        key={line.id}
                                        className="border-b border-gray-100 dark:border-gray-700"
                                    >
                                        <td className="px-2 py-1">
                                            {line.lineNumber}
                                        </td>
                                        <td className="px-2 py-1">
                                            <div>
                                                {line.productName ?? line.materialName ?? line.materialCode}
                                                {line.variantName ? (
                                                    <span className="text-gray-500"> — {line.variantName}</span>
                                                ) : null}
                                            </div>
                                            <div className="text-[11px] text-gray-400">
                                                MM {line.materialCode}
                                            </div>
                                        </td>
                                        <td className="px-2 py-1">
                                            {line.sku ?? '—'}
                                        </td>
                                        <td className="px-2 py-1 text-right">
                                            {Number(line.quantity)}
                                        </td>
                                        <td className="px-2 py-1 text-right">
                                            {formatMoney(line.unitPrice)}
                                        </td>
                                        <td className="px-2 py-1 text-right">
                                            {formatMoney(line.discount)}
                                        </td>
                                        <td className="px-2 py-1">
                                            <TaxClassTag
                                                classification={line.taxClassification}
                                                taxCode={line.taxCode}
                                            />
                                        </td>
                                        <td className="px-2 py-1">
                                            {line.taxCode ?? '—'}
                                        </td>
                                        <td className="px-2 py-1 text-right">
                                            {line.taxRate != null
                                                ? `${Number(line.taxRate)}%`
                                                : '—'}
                                        </td>
                                        <td className="px-2 py-1 text-right">
                                            {formatMoney(line.taxAmount)}
                                        </td>
                                        <td className="px-2 py-1 text-right">
                                            {formatMoney(line.netAmount)}
                                        </td>
                                        <td className="px-2 py-1 text-right font-medium">
                                            {formatMoney(line.grossAmount)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* ── Totals ── */}
                    <div className="mt-4 max-w-xs ml-auto">
                        <TaxSummaryRow
                            label="Subtotal"
                            value={detailTx.subtotal}
                        />
                        <TaxSummaryRow
                            label="Discount"
                            value={detailTx.discountTotal}
                        />
                        <TaxSummaryRow label="Tax" value={detailTx.taxTotal} />
                        {Number(detailTx.platformFees) > 0 && (
                            <TaxSummaryRow
                                label="Platform Fees"
                                value={detailTx.platformFees}
                            />
                        )}
                        <div className="border-t border-gray-200 dark:border-gray-700 mt-1 pt-1">
                            <TaxSummaryRow
                                label="Grand Total"
                                value={detailTx.grandTotal}
                            />
                        </div>
                    </div>

                    {detailTx.remarks && (
                        <div className="mt-4 text-sm">
                            <span className="text-gray-500">Remarks:</span>{' '}
                            {detailTx.remarks}
                        </div>
                    )}
                </FormDialog>
            )}

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
