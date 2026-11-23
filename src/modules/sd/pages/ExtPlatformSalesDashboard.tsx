'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import {
    HiOutlineBan,
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
import ExtPlatformResponsiveTable from '@/modules/mm/receiving/components/ReceivingResponsiveTable'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { sdParentBreadcrumbs } from '../utils/sdPageUi'
import { SdDocCell } from '../components/SdDataTableCells'
import {
    RcvPartyCell,
    rcvMobileCardEnterClass,
} from '@/modules/mm/receiving/components/receivingTableUi'
import {
    EXT_PLATFORM_STATUS,
    ExtPlatformCompanyCell,
    ExtPlatformLinesCell,
    ExtPlatformRefCell,
    ExtPlatformStatusCell,
    ExtPlatformTotalCell,
    ExtPlatformTrackingCell,
    uniqueLineValues,
} from '../components/extPlatformTableUi'
import ExtPlatformTransactionDialog from '../components/ExtPlatformTransactionDialog'
import ExtPlatformTransactionDetailDialog from '../components/ExtPlatformTransactionDetailDialog'
import { SourceBadge } from '../components/extPlatformUi'
import POSVoidDialog from '../components/POSVoidDialog'
import useResourceAccess from '@/utils/hooks/useResourceAccess'
import { orgService } from '@/modules/mm/material-master/services/referenceService'
import {
    fetchSalesSources,
    fetchExtPlatformTransactions,
    fetchExtPlatformReportSummary,
    updateExtPlatformTransactionStatus,
    deleteExtPlatformTransaction,
    voidExtPlatformTransaction,
} from '../services/extPlatformService'
import type {
    SalesSource,
    ExtPlatformTransaction,
    ExtPlatformReportSummary,
} from '../types/extPlatform'

const ROUTE_PATH = '/modules/sd/ext-platform-sales'

const formatMoney = (v: number | string | null | undefined) => {
    const n = Number(v ?? 0)
    return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ── Main page ──

/** Quick-pick reasons when a confirmed / approved platform sale is voided. */
const VOID_REASONS = [
    'Order cancelled on the platform',
    'Customer returned the order',
    'Wrong item or quantity recorded',
    'Duplicate transaction',
    'Payment problem',
]

export default function ExtPlatformSalesDashboard() {
    const { canUpdate } = useResourceAccess('sd.ext-platform-sales')
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

    // Void (confirmed / approved sales; needs a reason)
    const [voidTx, setVoidTx] = useState<ExtPlatformTransaction | null>(null)
    const [voiding, setVoiding] = useState(false)

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

    // ── Table columns ──

    const columns = useMemo<ColumnDef<ExtPlatformTransaction>[]>(
        () => [
            {
                header: 'Transaction',
                accessorKey: 'transactionNumber',
                size: 200,
                minSize: 180,
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
                header: 'Source',
                accessorKey: 'salesSource',
                size: 170,
                minSize: 150,
                enableSorting: false,
                cell: ({ row }) => <SourceBadge source={row.original.salesSource} />,
            },
            {
                header: 'Reference',
                accessorKey: 'externalOrderRef',
                size: 190,
                minSize: 160,
                enableSorting: false,
                cell: ({ row }) => (
                    <ExtPlatformRefCell value={row.original.externalOrderRef} />
                ),
            },
            {
                header: 'Company',
                accessorKey: 'company.name',
                size: 230,
                minSize: 200,
                enableSorting: false,
                cell: ({ row }) => (
                    <ExtPlatformCompanyCell
                        name={row.original.company?.name}
                        code={row.original.company?.code}
                    />
                ),
            },
            {
                header: 'Customer',
                accessorKey: 'customerName',
                size: 210,
                minSize: 180,
                enableSorting: false,
                cell: ({ row }) => (
                    <RcvPartyCell
                        kind="user"
                        name={
                            row.original.customer?.companyName ||
                            row.original.customerName
                        }
                        subtitle={row.original.customer?.customerNumber ?? undefined}
                    />
                ),
            },
            {
                header: 'Items',
                accessorKey: 'lines',
                size: 110,
                minSize: 96,
                enableSorting: false,
                cell: ({ row }) => (
                    <ExtPlatformLinesCell count={row.original.lines?.length ?? 0} />
                ),
            },
            {
                header: 'Barcode',
                id: 'lineBarcodes',
                size: 170,
                minSize: 150,
                enableSorting: false,
                cell: ({ row }) => (
                    <ExtPlatformTrackingCell
                        variant="barcode"
                        values={uniqueLineValues(row.original.lines, 'barcode')}
                    />
                ),
            },
            {
                header: 'Batch #',
                id: 'lineBatches',
                size: 160,
                minSize: 140,
                enableSorting: false,
                cell: ({ row }) => (
                    <ExtPlatformTrackingCell
                        variant="batch"
                        values={uniqueLineValues(row.original.lines, 'batchNumber')}
                    />
                ),
            },
            {
                header: 'Lot #',
                id: 'lineLots',
                size: 150,
                minSize: 130,
                enableSorting: false,
                cell: ({ row }) => (
                    <ExtPlatformTrackingCell
                        variant="lot"
                        values={uniqueLineValues(row.original.lines, 'lotNumber')}
                    />
                ),
            },
            {
                header: 'Total',
                accessorKey: 'grandTotal',
                size: 150,
                minSize: 136,
                enableSorting: false,
                cell: ({ row }) => (
                    <ExtPlatformTotalCell
                        total={Number(row.original.grandTotal)}
                        tax={Number(row.original.taxTotal)}
                    />
                ),
            },
            {
                header: 'Status',
                accessorKey: 'status',
                size: 130,
                minSize: 116,
                enableSorting: false,
                cell: ({ row }) => (
                    <ExtPlatformStatusCell status={row.original.status} />
                ),
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
                            title="View"
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
                                title="Approve"
                                icon={<HiOutlineClipboardCheck />}
                                onClick={() => handleApprove(row.original)}
                            />
                        )}
                        {canUpdate &&
                            (row.original.status === 'CONFIRMED' ||
                                row.original.status === 'APPROVED') && (
                                <Button
                                    size="xs"
                                    variant="plain"
                                    title="Void"
                                    className="text-red-500"
                                    icon={<HiOutlineBan />}
                                    onClick={() => setVoidTx(row.original)}
                                />
                            )}
                    </div>
                ),
            },
        ],
        // Row actions reload with the current filters.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [loadTransactions, loadSummary, canUpdate],
    )

    const transactionsMobile = useMemo(
        () => ({
            title: (tx: ExtPlatformTransaction) => tx.transactionNumber,
            subtitle: (tx: ExtPlatformTransaction) =>
                [
                    tx.salesSource?.name,
                    dayjs(tx.transactionDate).format('MMM D, YYYY'),
                ]
                    .filter(Boolean)
                    .join(' · '),
            status: (tx: ExtPlatformTransaction) => {
                const meta = EXT_PLATFORM_STATUS[tx.status]
                return {
                    text: meta?.label ?? tx.status,
                    tone: meta?.tone ?? ('default' as const),
                }
            },
            onPress: (tx: ExtPlatformTransaction) => setDetailTx(tx),
            fields: [
                {
                    label: 'Total',
                    value: (tx: ExtPlatformTransaction) => formatMoney(tx.grandTotal),
                },
                {
                    label: 'Items',
                    value: (tx: ExtPlatformTransaction) => tx.lines?.length ?? 0,
                },
                {
                    label: 'Reference',
                    value: (tx: ExtPlatformTransaction) => tx.externalOrderRef || '—',
                },
                {
                    label: 'Customer',
                    value: (tx: ExtPlatformTransaction) =>
                        tx.customer?.companyName || tx.customerName || '—',
                },
                {
                    label: 'Barcode',
                    value: (tx: ExtPlatformTransaction) =>
                        uniqueLineValues(tx.lines, 'barcode').join(', ') || '—',
                },
                {
                    label: 'Batch #',
                    value: (tx: ExtPlatformTransaction) =>
                        uniqueLineValues(tx.lines, 'batchNumber').join(', ') || '—',
                },
                {
                    label: 'Lot #',
                    value: (tx: ExtPlatformTransaction) =>
                        uniqueLineValues(tx.lines, 'lotNumber').join(', ') || '—',
                },
            ],
        }),
        [],
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

    // Errors propagate to POSVoidDialog, which shows them next to the reason.
    const handleVoid = async (reason: string) => {
        if (!voidTx) return
        setVoiding(true)
        try {
            await voidExtPlatformTransaction(voidTx.id, reason)
            toast.push(
                <Notification type="success" title="Voided">
                    {voidTx.transactionNumber} voided
                    {voidTx.status === 'APPROVED' && voidTx.isCompanyInventory
                        ? ' — stock returned to MM.'
                        : '.'}
                </Notification>,
            )
            setVoidTx(null)
            loadTransactions()
            loadSummary()
        } finally {
            setVoiding(false)
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
                    <AdaptiveCard className={rcvMobileCardEnterClass(0)}>
                        <div className="text-gray-500 text-xs mb-1">
                            Transactions
                        </div>
                        <div className="text-xl font-bold">
                            {summary.totalTransactions}
                        </div>
                    </AdaptiveCard>
                    <AdaptiveCard className={rcvMobileCardEnterClass(1)}>
                        <div className="text-gray-500 text-xs mb-1">
                            Total Sales
                        </div>
                        <div className="text-xl font-bold">
                            {formatMoney(summary.totalSales)}
                        </div>
                    </AdaptiveCard>
                    <AdaptiveCard className={rcvMobileCardEnterClass(2)}>
                        <div className="text-gray-500 text-xs mb-1">
                            VAT / Tax
                        </div>
                        <div className="text-xl font-bold">
                            {formatMoney(summary.totalTax)}
                        </div>
                    </AdaptiveCard>
                    <AdaptiveCard className={rcvMobileCardEnterClass(3)}>
                        <div className="text-gray-500 text-xs mb-1">
                            Discounts
                        </div>
                        <div className="text-xl font-bold">
                            {formatMoney(summary.totalDiscount)}
                        </div>
                    </AdaptiveCard>
                    <AdaptiveCard className={rcvMobileCardEnterClass(4)}>
                        <div className="text-gray-500 text-xs mb-1">
                            Platform Fees
                        </div>
                        <div className="text-xl font-bold">
                            {formatMoney(summary.totalPlatformFees)}
                        </div>
                    </AdaptiveCard>
                    <AdaptiveCard className={rcvMobileCardEnterClass(5)}>
                        <div className="text-gray-500 text-xs mb-1">
                            Net Settlement
                        </div>
                        <div className="text-xl font-bold text-green-600">
                            {formatMoney(summary.netSettlement)}
                        </div>
                    </AdaptiveCard>
                </div>
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
                    <ExtPlatformResponsiveTable<ExtPlatformTransaction>
                        columns={columns}
                        data={transactions}
                        compact
                        loading={loading}
                        hidePagination
                        tableMinWidthClass="min-w-0"
                        overflow={false}
                        getRowId={(row) => row.id}
                        skeletonAvatarColumns={[]}
                        pagingData={{
                            total,
                            pageIndex: 0,
                            pageSize: 200,
                        }}
                        mobile={transactionsMobile}
                        noData={transactions.length === 0}
                        customNoDataIcon={
                            <div className="flex w-full flex-col items-center gap-3 py-10 text-center">
                                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-subtle text-primary-deep">
                                    <HiOutlineDocumentAdd className="text-2xl" />
                                </span>
                                <p className="text-base font-semibold heading-text">
                                    No transactions found
                                </p>
                                <p className="max-w-md text-sm text-gray-500">
                                    Adjust the filters or record a sale made on Shopee,
                                    Lazada, TikTok Shop or another channel.
                                </p>
                            </div>
                        }
                    />
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
                onVoid={
                    canUpdate
                        ? (tx) => {
                              setDetailTx(null)
                              setVoidTx(tx)
                          }
                        : undefined
                }
            />

            {/* ── Void (reason required) ── */}
            <POSVoidDialog
                isOpen={!!voidTx}
                documentLabel="Sale"
                receiptNumber={voidTx?.transactionNumber}
                amount={voidTx ? Number(voidTx.grandTotal) : undefined}
                consequence={
                    voidTx?.status === 'APPROVED' && voidTx.isCompanyInventory
                        ? 'is voided: the MM goods issue is reversed and the stock returns to inventory.'
                        : 'is voided and leaves the sales totals. No stock moves.'
                }
                reasons={VOID_REASONS}
                saving={voiding}
                onVoid={handleVoid}
                onClose={() => setVoidTx(null)}
                formatPrice={formatMoney}
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
