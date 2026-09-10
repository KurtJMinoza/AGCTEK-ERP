'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { HiOutlineSearch, HiOutlineExternalLink } from 'react-icons/hi'
import { quotationService } from '../services/quotationService'
import { supplierService } from '@/modules/mm/supplier-management/services/supplierService'
import type { MmSupplierQuotation, MmQuotationListResponse } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE_PATH = '/modules/mm/procurement/supplier-quotations'
const RFQ_PATH = '/modules/mm/procurement/rfqs'

const STATUS_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger' | 'info'> = {
    DRAFT: 'default',
    SUBMITTED: 'info',
    WITHDRAWN: 'default',
    EXPIRED: 'danger',
    SELECTED: 'success',
}

type FilterOption = { value: string; label: string }

const STATUS_FILTER_OPTIONS: FilterOption[] = [
    { value: '', label: 'All statuses' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'SUBMITTED', label: 'Submitted' },
    { value: 'SELECTED', label: 'Selected' },
    { value: 'WITHDRAWN', label: 'Withdrawn' },
    { value: 'EXPIRED', label: 'Expired' },
]

const SupplierQuotationsPage = () => {
    const router = useRouter()
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE_PATH)

    const [data, setData] = useState<MmSupplierQuotation[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [supplierId, setSupplierId] = useState('')
    const [suppliers, setSuppliers] = useState<FilterOption[]>([])

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const res: MmQuotationListResponse = await quotationService.list({
                page,
                pageSize,
                search: search || undefined,
                status: statusFilter || undefined,
                supplierId: supplierId || undefined,
            })
            setData(res.data)
            setTotal(res.total)
        } catch {
            setData([])
            setTotal(0)
        } finally {
            setLoading(false)
        }
    }, [page, pageSize, search, statusFilter, supplierId])

    useEffect(() => { fetchData() }, [fetchData])

    useEffect(() => {
        supplierService.list({ page: 1, pageSize: 200 }).then((res) => {
            setSuppliers(res.data.map((s) => ({
                value: s.id,
                label: `${s.supplierCode} — ${s.supplierName}`,
            })))
        }).catch(() => {})
    }, [])

    const columns = useMemo<ColumnDef<MmSupplierQuotation>[]>(() => [
        {
            header: 'Quotation',
            accessorKey: 'quotationNumber',
            size: 150,
            cell: ({ row }) => (
                <span className="font-mono text-xs font-semibold">{row.original.quotationNumber}</span>
            ),
        },
        {
            header: 'RFQ',
            accessorKey: 'rfqId',
            size: 150,
            cell: ({ row }) => {
                const rfq = row.original.rfq
                return (
                    <button
                        type="button"
                        className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-primary hover:underline"
                        onClick={() => router.push(`${RFQ_PATH}/${row.original.rfqId}`)}
                    >
                        {rfq?.rfqNumber || row.original.rfqId.slice(0, 8)}
                        <HiOutlineExternalLink className="text-sm" />
                    </button>
                )
            },
        },
        {
            header: 'Supplier',
            accessorKey: 'supplierId',
            size: 200,
            cell: ({ row }) => {
                const s = row.original.supplier
                return s
                    ? <span className="text-sm">{s.supplierCode} — {s.supplierName}</span>
                    : <span className="text-sm">{row.original.supplierId}</span>
            },
        },
        {
            header: 'Total',
            accessorKey: 'total',
            size: 110,
            cell: ({ row }) => (
                <span className="font-semibold">
                    {Number(row.original.total).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                    })}
                </span>
            ),
        },
        {
            header: 'Validity',
            accessorKey: 'validityDate',
            size: 110,
            cell: ({ row }) => (
                <span className="text-sm">{new Date(row.original.validityDate).toLocaleDateString()}</span>
            ),
        },
        {
            header: 'Status',
            accessorKey: 'status',
            size: 120,
            cell: ({ row }) => (
                <StatusBadge tone={STATUS_TONE[row.original.status] ?? 'default'}>
                    {String(row.original.status)}
                </StatusBadge>
            ),
        },
        {
            header: 'Submitted',
            accessorKey: 'submittedAt',
            size: 140,
            cell: ({ row }) => (
                <span className="text-xs">
                    {row.original.submittedAt
                        ? new Date(row.original.submittedAt).toLocaleString()
                        : '—'}
                </span>
            ),
        },
        {
            id: 'actions',
            header: '',
            size: 100,
            cell: ({ row }) => (
                <Button
                    size="xs"
                    onClick={() => router.push(`${RFQ_PATH}/${row.original.rfqId}`)}
                >
                    Open RFQ
                </Button>
            ),
        },
    ], [router])

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Supplier Quotations"
                description="All supplier quotations across RFQs — filter, review, and jump to the related RFQ."
            />

            <AdaptiveCard className="mt-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <Input
                        prefix={<HiOutlineSearch className="text-lg" />}
                        placeholder="Search quotation number..."
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                    />
                    <Select<FilterOption>
                        placeholder="Status"
                        options={STATUS_FILTER_OPTIONS}
                        value={STATUS_FILTER_OPTIONS.find((o) => o.value === statusFilter)}
                        onChange={(opt) => { setStatusFilter(opt?.value ?? ''); setPage(1) }}
                    />
                    <Select<FilterOption>
                        options={suppliers}
                        value={suppliers.find((s) => s.value === supplierId) ?? null}
                        onChange={(opt) => { setSupplierId(opt?.value ?? ''); setPage(1) }}
                        placeholder="Filter by supplier"
                        isClearable
                    />
                </div>

                <div className="mt-4">
                    <DataTable<MmSupplierQuotation>
                        columns={columns}
                        data={data}
                        compact
                        fit
                        loading={loading}
                        noData={!loading && data.length === 0}
                        pagingData={{ total, pageIndex: page, pageSize }}
                        onPaginationChange={setPage}
                        onSelectChange={(size) => { setPageSize(size); setPage(1) }}
                    />
                </div>
            </AdaptiveCard>
        </PageContainer>
    )
}

export default SupplierQuotationsPage
