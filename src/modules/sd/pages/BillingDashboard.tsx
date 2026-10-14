'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
    HiOutlineDocumentText,
    HiOutlineMail,
    HiOutlineReceiptTax,
    HiOutlineRefresh,
    HiOutlineSearch,
} from 'react-icons/hi'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import ErpBackLink from '@/components/erp/ErpBackLink'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Tooltip from '@/components/ui/Tooltip'
import Alert from '@/components/ui/Alert'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    fetchInvoicePdf,
    listInvoices,
    type BillingStatus,
    type Invoice,
    type InvoiceSummary,
} from '../services/invoiceService'
import {
    BILLING_ROUTE as ROUTE_PATH,
    BILLING_STATUS_META as STATUS_META,
    formatDate,
    formatMoney,
    invoiceDocumentHref,
} from '../utils/invoiceDisplay'

const SEARCH_DEBOUNCE_MS = 350

const FILTER_STATUSES: BillingStatus[] = ['UNPAID', 'OVERDUE', 'PAID', 'CANCELLED', 'REFUNDED']

type StatusFilterOption = { value: BillingStatus | ''; label: string }

const STATUS_FILTER_OPTIONS: StatusFilterOption[] = [
    { value: '', label: 'All statuses' },
    ...FILTER_STATUSES.map((status) => ({
        value: status,
        label: STATUS_META[status].label,
    })),
]

const SummaryStat = ({
    label,
    value,
    active,
    onClick,
}: {
    label: string
    value: string | number
    active?: boolean
    onClick?: () => void
}) => (
    <Card
        clickable={Boolean(onClick)}
        className={active ? 'ring-2 ring-primary' : undefined}
        onClick={onClick}
    >
        <div className="text-sm text-gray-500">{label}</div>
        <div className="mt-1 text-xl font-bold sm:text-2xl">{value}</div>
    </Card>
)

const BillingDashboard = () => {
    const breadcrumbItems = useMemo(() => buildErpBreadcrumbs(ROUTE_PATH), [])

    const [status, setStatus] = useState<BillingStatus | ''>('')
    const [searchInput, setSearchInput] = useState('')
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)
    const [rows, setRows] = useState<Invoice[]>([])
    const [total, setTotal] = useState(0)
    const [summary, setSummary] = useState<InvoiceSummary | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null)

    const fetchList = useCallback(async () => {
        setLoading(true)
        try {
            const result = await listInvoices({
                status: status || undefined,
                search,
                page,
                pageSize,
            })
            setRows(result.data)
            setTotal(result.total)
            setSummary(result.summary)
            setError(null)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to load invoices')
        } finally {
            setLoading(false)
        }
    }, [status, search, page, pageSize])

    useEffect(() => {
        void fetchList()
    }, [fetchList])

    useEffect(() => {
        if (searchInput.trim() === search) return
        const timer = window.setTimeout(() => {
            setSearch(searchInput.trim())
            setPage(1)
        }, SEARCH_DEBOUNCE_MS)
        return () => window.clearTimeout(timer)
    }, [searchInput, search])

    const selectStatus = (next: BillingStatus | '') => {
        setStatus(next)
        setPage(1)
    }

    const viewPdf = useCallback(async (invoice: Invoice) => {
        // Opened before the request so the popup blocker treats it as user-initiated.
        const tab = window.open('', '_blank')
        setPdfLoadingId(invoice.id)
        try {
            const url = URL.createObjectURL(await fetchInvoicePdf(invoice.id))
            if (tab) {
                tab.location.href = url
            } else {
                const link = document.createElement('a')
                link.href = url
                link.download = `${invoice.invoiceNumber}.pdf`
                link.click()
            }
            window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
        } catch (err) {
            tab?.close()
            toast.push(
                <Notification type="danger" title="PDF not available" closable>
                    {err instanceof Error ? err.message : 'Please try again.'}
                </Notification>,
                { placement: 'top-end' },
            )
        } finally {
            setPdfLoadingId(null)
        }
    }, [])

    const columns = useMemo<ColumnDef<Invoice>[]>(
        () => [
            {
                header: 'Invoice #',
                id: 'invoiceNumber',
                cell: ({ row }) => (
                    <Link
                        href={invoiceDocumentHref(row.original.id)}
                        className="font-mono font-semibold text-primary hover:underline"
                    >
                        {row.original.invoiceNumber}
                    </Link>
                ),
            },
            {
                header: 'Sales Order',
                id: 'salesOrderReference',
                cell: ({ row }) => (
                    <span className="font-mono text-xs">{row.original.salesOrderReference}</span>
                ),
            },
            {
                header: 'Customer',
                id: 'customerName',
                cell: ({ row }) => row.original.customerName ?? '—',
            },
            {
                header: 'Amount',
                id: 'totalAmount',
                cell: ({ row }) => (
                    <div className="whitespace-nowrap">
                        <div className="font-semibold">
                            {formatMoney(row.original.totalAmount, row.original.currency)}
                        </div>
                        {row.original.refundedAmount > 0 ? (
                            <div className="text-xs text-gray-500">
                                Refunded{' '}
                                {formatMoney(row.original.refundedAmount, row.original.currency)}
                            </div>
                        ) : null}
                    </div>
                ),
            },
            {
                header: 'Due Date',
                id: 'dueDate',
                cell: ({ row }) => (
                    <span className="whitespace-nowrap">
                        {formatDate(row.original.dueDate) ?? '—'}
                    </span>
                ),
            },
            {
                header: 'Status',
                id: 'billingStatus',
                cell: ({ row }) => {
                    const meta = STATUS_META[row.original.billingStatus]
                    return <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                },
            },
            {
                header: 'Actions',
                id: 'actions',
                cell: ({ row }) => (
                    <div className="flex items-center gap-2">
                        <Button
                            size="xs"
                            variant="plain"
                            className="whitespace-nowrap"
                            icon={<HiOutlineDocumentText />}
                            loading={pdfLoadingId === row.original.id}
                            onClick={() => void viewPdf(row.original)}
                        >
                            View PDF
                        </Button>
                        {row.original.billingStatus === 'OVERDUE' ? (
                            <Tooltip title="Dunning will be handled by FICO/Notifications">
                                <span>
                                    <Button
                                        disabled
                                        size="xs"
                                        className="whitespace-nowrap"
                                        icon={<HiOutlineMail />}
                                    >
                                        Send Dunning Letter
                                    </Button>
                                </span>
                            </Tooltip>
                        ) : null}
                    </div>
                ),
            },
        ],
        [pdfLoadingId, viewPdf],
    )

    return (
        <PageContainer>
            <ErpBackLink items={breadcrumbItems} />
            <Breadcrumb items={breadcrumbItems} className="mb-4" />
            <PageHeader
                title="Customer Billing & Invoices"
                description="Invoices are drafted at Post Goods Issue (PGI) and posted on delivery (POD). Track Accounts Receivable."
                icon={<HiOutlineReceiptTax />}
                actions={
                    <Button
                        size="sm"
                        icon={<HiOutlineRefresh />}
                        loading={loading}
                        onClick={() => void fetchList()}
                    >
                        Refresh
                    </Button>
                }
            />

            {error ? (
                <Alert showIcon type="danger" className="mb-4">
                    {error}
                </Alert>
            ) : null}

            <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <Input
                    className="md:max-w-md"
                    prefix={<HiOutlineSearch className="text-lg" />}
                    placeholder="Search invoice #, order # or customer..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                />
                <div className="md:w-48">
                    <Select<StatusFilterOption>
                        isSearchable={false}
                        options={STATUS_FILTER_OPTIONS}
                        value={STATUS_FILTER_OPTIONS.find((option) => option.value === status)}
                        onChange={(option) => selectStatus(option?.value ?? '')}
                    />
                </div>
            </div>

            <div className="my-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
                <SummaryStat
                    label="Pending"
                    value={summary?.pendingCount ?? 0}
                    active={status === 'UNPAID'}
                    onClick={() => selectStatus(status === 'UNPAID' ? '' : 'UNPAID')}
                />
                <SummaryStat
                    label="Overdue"
                    value={summary?.overdueCount ?? 0}
                    active={status === 'OVERDUE'}
                    onClick={() => selectStatus(status === 'OVERDUE' ? '' : 'OVERDUE')}
                />
                <SummaryStat
                    label="Cleared / Paid"
                    value={summary?.paidCount ?? 0}
                    active={status === 'PAID'}
                    onClick={() => selectStatus(status === 'PAID' ? '' : 'PAID')}
                />
                <SummaryStat
                    label="Total Outstanding (PHP)"
                    value={formatMoney(summary?.outstandingAmount ?? 0, summary?.currency)}
                />
            </div>

            <Card>
                <DataTable
                    columns={columns}
                    data={rows}
                    loading={loading && rows.length === 0}
                    noData={!loading && rows.length === 0}
                    pagingData={{ total, pageIndex: page, pageSize }}
                    onPaginationChange={setPage}
                    onSelectChange={(size) => {
                        setPageSize(size)
                        setPage(1)
                    }}
                />
            </Card>
        </PageContainer>
    )
}

export default BillingDashboard
