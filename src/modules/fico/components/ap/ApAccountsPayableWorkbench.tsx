'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { ColumnDef } from '@tanstack/react-table'
import FicoResponsiveGroupedTabBar from '../workbench/FicoResponsiveGroupedTabBar'
import FicoLedgerTable from '../workbench/FicoLedgerTable'
import { FicoWorkbenchAlert, FicoWorkbenchPanel } from '../workbench/FicoWorkbenchChrome'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Checkbox from '@/components/ui/Checkbox'
import Tag from '@/components/ui/Tag'
import { FicoCodeCell, formatFicoDate } from '../ficoTableUi'
import { formatMoney } from '../journal/journalUi'
import usePermissions from '@/utils/hooks/usePermissions'
import { accountsPayableService } from '../../services/accountsPayableService'
import type {
    ApClearingRow,
    ApDocumentRow,
    ApOpenItemRow,
    ApPaymentRow,
} from '../../types/accountsPayable'
import { apAmount, isCreditOpenItem, isPayableOpenItem } from './apUtils'
import ApPaymentDialog, { openItemsToPaymentAllocations } from './ApPaymentDialog'
import ApClearingDialog from './ApClearingDialog'
import ApFinancialInsights, { type ApInsightTab } from './ApFinancialInsights'
import ApAdjustmentDialog from './ApAdjustmentDialog'
import type { ApDashboard, ApPaymentProposal } from '../../types/accountsPayable'
import StatCard from '@/components/shared/StatCard'
import StatusBadge from '@/components/shared/StatusBadge'
import {
    apDocumentDescription,
    apDocumentDisplayNumber,
    apRegisterDisplayStatus,
    apRegisterLineAmounts,
    apRegisterStatusTone,
    filterApRegisterDocuments,
    summarizeApRegister,
} from './apRegisterUi'
import {
    HiOutlineCash,
    HiOutlineClipboardList,
    HiOutlineCurrencyDollar,
} from 'react-icons/hi'

type TabKey =
    | ApInsightTab
    | 'register'
    | 'open-items'
    | 'documents'
    | 'payments'
    | 'clearings'

const TAB_ITEMS: { id: TabKey; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'register', label: 'Invoices' },
    { id: 'open-items', label: 'Open items' },
    { id: 'proposals', label: 'Payment proposals' },
    { id: 'payments', label: 'Payments' },
    { id: 'clearings', label: 'Clearings' },
    { id: 'aging', label: 'Aging' },
    { id: 'reconciliation', label: 'Reconciliation' },
    { id: 'statements', label: 'Statements' },
    { id: 'documents', label: 'All documents' },
    { id: 'adjustments', label: 'Credits & advances' },
]

const WORKBENCH_TABS = new Set<TabKey>([
    'overview',
    'register',
    'open-items',
    'payments',
    'clearings',
    'documents',
])
const ANALYSIS_TABS = new Set<TabKey>([
    'proposals',
    'aging',
    'reconciliation',
    'statements',
    'adjustments',
])

const AP_TAB_GROUPS = [
    {
        label: 'Workbench',
        tabs: TAB_ITEMS.filter((t) => WORKBENCH_TABS.has(t.id)).map((t) => ({
            value: t.id,
            label: t.label,
        })),
    },
    {
        label: 'Analysis',
        tabs: TAB_ITEMS.filter((t) => ANALYSIS_TABS.has(t.id)).map((t) => ({
            value: t.id,
            label: t.label,
        })),
    },
]

type PaymentSeed = {
    supplierId: string
    supplierLabel: string
    currencyCode: string
    items: ApOpenItemRow[]
}

type ClearingSeed = {
    supplierId: string
    supplierLabel: string
    currencyCode: string
    debitId?: string
    creditId?: string
}

const supplierLabel = (row: { supplier?: { supplierCode: string; supplierName: string } }) =>
    row.supplier
        ? `${row.supplier.supplierName} (${row.supplier.supplierCode})`
        : '—'

const ApAccountsPayableWorkbench = ({ companyId }: { companyId: string }) => {
    const { can } = usePermissions()
    const canCreate = can('fico.accounts-payable', 'create')

    const [tab, setTab] = useState<TabKey>('overview')
    const [dashboard, setDashboard] = useState<ApDashboard | null>(null)
    const [adjustmentOpen, setAdjustmentOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const [openItems, setOpenItems] = useState<ApOpenItemRow[]>([])
    const [documents, setDocuments] = useState<ApDocumentRow[]>([])
    const [payments, setPayments] = useState<ApPaymentRow[]>([])
    const [clearings, setClearings] = useState<ApClearingRow[]>([])

    const [overdueOnly, setOverdueOnly] = useState(false)
    const [docSearch, setDocSearch] = useState('')

    const [paymentOpen, setPaymentOpen] = useState(false)
    const [paymentSeed, setPaymentSeed] = useState<PaymentSeed | null>(null)

    const [clearingOpen, setClearingOpen] = useState(false)
    const [clearingSeed, setClearingSeed] = useState<ClearingSeed | null>(null)

    const reloadOpenItems = useCallback(() => {
        setLoading(true)
        setError('')
        return accountsPayableService
            .fetchOpenItems({ companyId, overdueOnly: overdueOnly || undefined })
            .then(setOpenItems)
            .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'))
            .finally(() => setLoading(false))
    }, [companyId, overdueOnly])

    const reloadDocuments = useCallback(() => {
        setLoading(true)
        setError('')
        return accountsPayableService
            .fetchDocuments({
                companyId,
                search: docSearch.trim() || undefined,
            })
            .then(setDocuments)
            .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'))
            .finally(() => setLoading(false))
    }, [companyId, docSearch])

    const reloadPayments = useCallback(() => {
        setLoading(true)
        return accountsPayableService
            .fetchPayments({ companyId })
            .then(setPayments)
            .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'))
            .finally(() => setLoading(false))
    }, [companyId])

    const reloadClearings = useCallback(() => {
        setLoading(true)
        return accountsPayableService
            .fetchClearings({ companyId })
            .then(setClearings)
            .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'))
            .finally(() => setLoading(false))
    }, [companyId])

    useEffect(() => {
        void reloadOpenItems()
        void reloadDocuments()
    }, [companyId, reloadOpenItems, reloadDocuments])

    useEffect(() => {
        if (tab === 'payments') void reloadPayments()
        if (tab === 'clearings') void reloadClearings()
    }, [tab, reloadPayments, reloadClearings])

    const registerDocuments = useMemo(
        () => filterApRegisterDocuments(documents),
        [documents],
    )
    const registerSummary = useMemo(() => summarizeApRegister(documents), [documents])

    const openPaymentFor = (items: ApOpenItemRow[]) => {
        if (!items.length) return
        const supplierId = items[0].supplierId
        if (items.some((r) => r.supplierId !== supplierId)) {
            setError('Select open items for one supplier only.')
            return
        }
        setPaymentSeed({
            supplierId,
            supplierLabel: supplierLabel(items[0]),
            currencyCode: items[0].currencyCode,
            items,
        })
        setPaymentOpen(true)
    }

    const openPaymentForProposal = (proposal: ApPaymentProposal) => {
        const pseudoItems: ApOpenItemRow[] = proposal.items.map((item) => ({
            id: item.id,
            companyId,
            supplierId: proposal.supplierId,
            documentId: item.document?.id ?? '',
            itemType: item.itemType,
            direction: 'CREDIT',
            originalAmount: item.openAmount,
            openAmount: item.openAmount,
            currencyCode: proposal.currencyCode,
            baselineDate: '',
            dueDate: item.dueDate,
            paymentBlocked: false,
            status: 'OPEN',
            supplier: proposal.supplier,
            document: item.document
                ? {
                      id: item.document.id,
                      documentType: item.document.documentType,
                      status: 'POSTED',
                      referenceNumber: item.document.referenceNumber,
                      postingDate: '',
                      journalEntryId: item.document.journalEntryId,
                  }
                : null,
        }))
        openPaymentFor(pseudoItems)
    }

    const openClearingFor = (row: ApOpenItemRow) => {
        const supplierRows = openItems.filter((r) => r.supplierId === row.supplierId)
        setClearingSeed({
            supplierId: row.supplierId,
            supplierLabel: supplierLabel(row),
            currencyCode: row.currencyCode,
            debitId: isCreditOpenItem(row) ? row.id : undefined,
            creditId: isPayableOpenItem(row) ? row.id : undefined,
        })
        setClearingOpen(true)
        if (!supplierRows.length) void reloadOpenItems()
    }

    const openItemColumns = useMemo<ColumnDef<ApOpenItemRow>[]>(
        () => [
            {
                header: 'Supplier',
                accessorKey: 'supplier',
                cell: ({ row }) => (
                    <FicoCodeCell
                        icon="posting"
                        code={row.original.supplier?.supplierCode ?? '—'}
                        name={row.original.supplier?.supplierName}
                    />
                ),
            },
            {
                header: 'Type',
                accessorKey: 'itemType',
                cell: ({ row }) => (
                    <span className="text-xs font-mono">{row.original.itemType}</span>
                ),
            },
            {
                header: 'Reference',
                id: 'ref',
                cell: ({ row }) => (
                    <Link
                        className="font-mono text-xs text-primary hover:underline"
                        href={`/modules/fico/accounts-payable/documents/${row.original.documentId}?companyId=${companyId}`}
                    >
                        {row.original.document?.referenceNumber ?? row.original.documentId.slice(-8)}
                    </Link>
                ),
            },
            {
                header: 'Due',
                accessorKey: 'dueDate',
                cell: ({ row }) => formatFicoDate(row.original.dueDate),
            },
            {
                header: 'Open',
                id: 'open',
                cell: ({ row }) => (
                    <span className="tabular-nums text-sm font-medium">
                        {formatMoney(row.original.currencyCode, String(apAmount(row.original.openAmount)))}
                    </span>
                ),
            },
            {
                header: 'Status',
                accessorKey: 'status',
                cell: ({ row }) => (
                    <div className="flex flex-wrap gap-1">
                        <Tag className="text-[10px]">{row.original.status}</Tag>
                        {row.original.paymentBlocked ? (
                            <Tag className="border-amber-200 bg-amber-50 text-[10px] text-amber-800">
                                Pay block
                            </Tag>
                        ) : null}
                    </div>
                ),
            },
            {
                header: '',
                id: 'actions',
                cell: ({ row }) =>
                    canCreate ? (
                        <div className="flex justify-end gap-1">
                            {isPayableOpenItem(row.original) ? (
                                <Button
                                    size="xs"
                                    variant="plain"
                                    onClick={() => openPaymentFor([row.original])}
                                >
                                    Pay
                                </Button>
                            ) : null}
                            <Button
                                size="xs"
                                variant="plain"
                                onClick={() => openClearingFor(row.original)}
                            >
                                Clear
                            </Button>
                        </div>
                    ) : null,
            },
        ],
        [companyId, canCreate],
    )

    const registerColumns = useMemo<ColumnDef<ApDocumentRow>[]>(
        () => [
            {
                header: 'AP No.',
                id: 'apNo',
                cell: ({ row }) => (
                    <Link
                        className="font-mono text-xs text-primary hover:underline"
                        href={`/modules/fico/accounts-payable/documents/${row.original.id}?companyId=${companyId}`}
                    >
                        {apDocumentDisplayNumber(row.original)}
                    </Link>
                ),
            },
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
                header: 'Description',
                id: 'description',
                cell: ({ row }) => (
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                        {apDocumentDescription(row.original)}
                    </span>
                ),
            },
            {
                header: 'Invoice date',
                cell: ({ row }) => formatFicoDate(row.original.documentDate),
            },
            {
                header: 'Due date',
                cell: ({ row }) =>
                    formatFicoDate(row.original.openItem?.dueDate ?? row.original.dueDate),
            },
            {
                header: 'Total amount',
                id: 'total',
                cell: ({ row }) => {
                    const { total } = apRegisterLineAmounts(row.original)
                    return (
                        <span className="tabular-nums text-sm">
                            {formatMoney(row.original.currencyCode, String(total))}
                        </span>
                    )
                },
            },
            {
                header: 'Paid amount',
                id: 'paid',
                cell: ({ row }) => {
                    const { paid } = apRegisterLineAmounts(row.original)
                    return (
                        <span className="tabular-nums text-sm text-gray-600 dark:text-gray-300">
                            {formatMoney(row.original.currencyCode, String(paid))}
                        </span>
                    )
                },
            },
            {
                header: 'Balance',
                id: 'balance',
                cell: ({ row }) => {
                    const { balance } = apRegisterLineAmounts(row.original)
                    return (
                        <span className="tabular-nums text-sm font-medium">
                            {formatMoney(row.original.currencyCode, String(balance))}
                        </span>
                    )
                },
            },
            {
                header: 'Status',
                id: 'status',
                cell: ({ row }) => {
                    const label = apRegisterDisplayStatus(row.original)
                    return <StatusBadge tone={apRegisterStatusTone(label)} status={label} />
                },
            },
            {
                header: 'Journal',
                cell: ({ row }) =>
                    row.original.journalEntry ? (
                        <Link
                            className="font-mono text-xs text-primary hover:underline"
                            href={`/modules/fico/journal-entries/${row.original.journalEntry.id}`}
                        >
                            {row.original.journalEntry.documentNumber}
                        </Link>
                    ) : (
                        '—'
                    ),
            },
        ],
        [companyId],
    )

    const documentColumns = useMemo<ColumnDef<ApDocumentRow>[]>(
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
                header: 'Type',
                accessorKey: 'documentType',
            },
            {
                header: 'Reference',
                cell: ({ row }) => (
                    <Link
                        className="font-mono text-xs text-primary hover:underline"
                        href={`/modules/fico/accounts-payable/documents/${row.original.id}?companyId=${companyId}`}
                    >
                        {row.original.referenceNumber ?? row.original.id.slice(-8)}
                    </Link>
                ),
            },
            {
                header: 'Posted',
                cell: ({ row }) => formatFicoDate(row.original.postingDate),
            },
            {
                header: 'Amount',
                cell: ({ row }) =>
                    formatMoney(row.original.currencyCode, String(apAmount(row.original.grossAmount))),
            },
            {
                header: 'Status',
                accessorKey: 'status',
            },
            {
                header: 'Journal',
                cell: ({ row }) =>
                    row.original.journalEntry ? (
                        <Link
                            className="font-mono text-xs text-primary"
                            href={`/modules/fico/journal-entries/${row.original.journalEntry.id}`}
                        >
                            {row.original.journalEntry.documentNumber}
                        </Link>
                    ) : (
                        '—'
                    ),
            },
        ],
        [companyId],
    )

    const paymentColumns = useMemo<ColumnDef<ApPaymentRow>[]>(
        () => [
            {
                header: 'Number',
                accessorKey: 'paymentNumber',
                cell: ({ row }) => (
                    <span className="font-mono text-xs">{row.original.paymentNumber}</span>
                ),
            },
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
                header: 'Date',
                cell: ({ row }) => formatFicoDate(row.original.paymentDate),
            },
            {
                header: 'Amount',
                cell: ({ row }) =>
                    formatMoney(
                        row.original.currencyCode,
                        String(apAmount(row.original.totalAmount)),
                    ),
            },
            {
                header: 'Status',
                accessorKey: 'status',
            },
            {
                header: 'Journal',
                cell: ({ row }) =>
                    row.original.journalEntry ? (
                        <Link
                            className="font-mono text-xs text-primary"
                            href={`/modules/fico/journal-entries/${row.original.journalEntry.id}`}
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

    const clearingColumns = useMemo<ColumnDef<ApClearingRow>[]>(
        () => [
            {
                header: 'Number',
                accessorKey: 'clearingNumber',
                cell: ({ row }) => (
                    <span className="font-mono text-xs">{row.original.clearingNumber}</span>
                ),
            },
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
                header: 'Date',
                cell: ({ row }) => formatFicoDate(row.original.clearingDate),
            },
            {
                header: 'Amount',
                cell: ({ row }) =>
                    formatMoney(
                        row.original.currencyCode,
                        String(apAmount(row.original.totalAmount)),
                    ),
            },
            {
                header: 'Status',
                accessorKey: 'status',
            },
            {
                header: 'Journal',
                cell: ({ row }) =>
                    row.original.journalEntry ? (
                        <Link
                            className="font-mono text-xs text-primary"
                            href={`/modules/fico/journal-entries/${row.original.journalEntry.id}`}
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

    const supplierOpenItemsForClearing = useMemo(() => {
        if (!clearingSeed) return []
        return openItems.filter((r) => r.supplierId === clearingSeed.supplierId)
    }, [openItems, clearingSeed])

    return (
        <>
            <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <StatCard
                    label="Outstanding payables"
                    value={formatMoney(
                        dashboard?.baseCurrency ?? registerSummary.currencyCode,
                        dashboard?.totalOutstanding ?? String(registerSummary.outstanding),
                    )}
                    icon={<HiOutlineCurrencyDollar />}
                    loading={!dashboard && loading && !documents.length}
                />
                <StatCard
                    label="Overdue"
                    value={formatMoney(
                        dashboard?.baseCurrency ?? registerSummary.currencyCode,
                        dashboard?.totalOverdue ?? '0',
                    )}
                    tone="warning"
                    icon={<HiOutlineClipboardList />}
                    loading={!dashboard && loading}
                />
                <StatCard
                    label="Payments (period)"
                    value={formatMoney(
                        dashboard?.baseCurrency ?? registerSummary.currencyCode,
                        dashboard?.paymentsInPeriodAmount ?? String(registerSummary.totalPaid),
                    )}
                    tone="success"
                    icon={<HiOutlineCash />}
                    loading={!dashboard && loading}
                />
                <StatCard
                    label="Posting exceptions"
                    value={dashboard ? String(dashboard.postingExceptions) : '—'}
                    loading={!dashboard && loading}
                />
            </div>
            <FicoWorkbenchPanel>
            <FicoResponsiveGroupedTabBar
                value={tab}
                onChange={(v) => setTab(v as TabKey)}
                groups={AP_TAB_GROUPS}
                actions={
                    canCreate ? (
                        <Button size="sm" variant="solid" onClick={() => setAdjustmentOpen(true)}>
                            New adjustment / invoice
                        </Button>
                    ) : null
                }
            />

            <FicoWorkbenchAlert message={error} onDismiss={() => setError('')} />

            <div className="mt-4 space-y-4">
            {tab === 'register' ? (
                <FicoLedgerTable
                    title="Invoice register"
                    description="Posted AP documents with balances and journal links."
                    toolbar={
                        <>
                            <Input
                                size="sm"
                                className="max-w-xs"
                                placeholder="Search reference or supplier"
                                value={docSearch}
                                onChange={(e) => setDocSearch(e.target.value)}
                            />
                            <Button
                                size="sm"
                                variant="solid"
                                loading={loading}
                                onClick={() => void reloadDocuments()}
                            >
                                Search
                            </Button>
                        </>
                    }
                    columns={registerColumns}
                    data={registerDocuments}
                    loading={loading}
                    noData={!loading && !registerDocuments.length}
                    tableMinWidthClass="min-w-[1120px]"
                />
            ) : null}
            {tab === 'open-items' ? (
                <FicoLedgerTable
                    title="Open items"
                    description="Supplier payables and credits awaiting payment or clearing."
                    toolbar={
                        <>
                            <label className="flex items-center gap-2 text-sm text-gray-600">
                                <Checkbox
                                    checked={overdueOnly}
                                    onChange={(checked) => setOverdueOnly(checked)}
                                />
                                Overdue only
                            </label>
                            <Button
                                size="sm"
                                variant="plain"
                                loading={loading}
                                onClick={() => void reloadOpenItems()}
                            >
                                Refresh
                            </Button>
                        </>
                    }
                    columns={openItemColumns}
                    data={openItems}
                    loading={loading}
                    noData={!loading && !openItems.length}
                    tableMinWidthClass="min-w-[1080px]"
                />
            ) : null}
            {tab === 'documents' ? (
                <FicoLedgerTable
                    title="All documents"
                    description="Full AP document list including adjustments and advances."
                    toolbar={
                        <>
                            <Input
                                size="sm"
                                className="max-w-xs"
                                placeholder="Search reference or supplier"
                                value={docSearch}
                                onChange={(e) => setDocSearch(e.target.value)}
                            />
                            <Button
                                size="sm"
                                variant="solid"
                                loading={loading}
                                onClick={() => void reloadDocuments()}
                            >
                                Search
                            </Button>
                        </>
                    }
                    columns={documentColumns}
                    data={documents}
                    loading={loading}
                    noData={!loading && !documents.length}
                    tableMinWidthClass="min-w-[1000px]"
                />
            ) : null}
            {tab === 'payments' ? (
                <FicoLedgerTable
                    title="Posted payments"
                    description="Outgoing supplier settlements with journal references."
                    columns={paymentColumns}
                    data={payments}
                    loading={loading}
                    noData={!loading && !payments.length}
                    tableMinWidthClass="min-w-[920px]"
                />
            ) : null}
            {tab === 'clearings' ? (
                <FicoLedgerTable
                    title="Clearings"
                    description="Net payables / credits cleared between open items."
                    columns={clearingColumns}
                    data={clearings}
                    loading={loading}
                    noData={!loading && !clearings.length}
                    tableMinWidthClass="min-w-[880px]"
                />
            ) : null}
            </div>

            {[
                'overview',
                'aging',
                'reconciliation',
                'statements',
                'proposals',
                'adjustments',
            ].includes(tab) ? (
                <ApFinancialInsights
                    companyId={companyId}
                    tab={tab as ApInsightTab}
                    onDashboardLoaded={setDashboard}
                    onPayProposal={canCreate ? openPaymentForProposal : undefined}
                />
            ) : null}

            {paymentSeed && paymentOpen ? (
                <ApPaymentDialog
                    companyId={companyId}
                    open={paymentOpen}
                    supplierId={paymentSeed.supplierId}
                    supplierLabel={paymentSeed.supplierLabel}
                    currencyCode={paymentSeed.currencyCode}
                    initialAllocations={openItemsToPaymentAllocations(paymentSeed.items)}
                    onClose={() => {
                        setPaymentOpen(false)
                        setPaymentSeed(null)
                    }}
                    onSuccess={() => {
                        void reloadOpenItems()
                        if (tab !== 'open-items') void reloadPayments()
                    }}
                />
            ) : null}

            {clearingSeed && clearingOpen ? (
                <ApClearingDialog
                    companyId={companyId}
                    open={clearingOpen}
                    supplierId={clearingSeed.supplierId}
                    supplierLabel={clearingSeed.supplierLabel}
                    currencyCode={clearingSeed.currencyCode}
                    openItems={supplierOpenItemsForClearing.length ? supplierOpenItemsForClearing : openItems.filter((r) => r.supplierId === clearingSeed.supplierId)}
                    debitItemId={clearingSeed.debitId}
                    creditItemId={clearingSeed.creditId}
                    onClose={() => {
                        setClearingOpen(false)
                        setClearingSeed(null)
                    }}
                    onSuccess={() => {
                        void reloadOpenItems()
                        if (tab !== 'open-items') void reloadClearings()
                    }}
                />
            ) : null}

            <ApAdjustmentDialog
                companyId={companyId}
                open={adjustmentOpen}
                onClose={() => setAdjustmentOpen(false)}
                onSuccess={() => {
                    void reloadOpenItems()
                    void reloadDocuments()
                }}
            />
        </FicoWorkbenchPanel>
        </>
    )
}

export default ApAccountsPayableWorkbench