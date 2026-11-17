'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import ProcurementResponsiveTable, { type ColumnDef } from '../components/ProcurementResponsiveTable'
import {
    PrcAnimatedStatus,
    PrcDateCell,
    PrcDocNumberCell,
    PrcMoneyCell,
    PrcSupplierCell,
    PRC_QUOTE_STATUS,
    prcStatusTone,
} from '../components/procurementTableUi'
import { procurementParentBreadcrumbs } from '../utils/procurementPageUi'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { HiOutlineSearch, HiOutlineExternalLink } from 'react-icons/hi'
import { quotationService } from '../services/quotationService'
import { useDeferredFilterRefs } from '@/modules/mm/shared/useLazyMmRefs'
import type { MmSupplierQuotation, MmQuotationListResponse } from '../types'
const ROUTE_PATH = '/modules/mm/procurement/supplier-quotations'
const RFQ_PATH = '/modules/mm/procurement/rfqs'

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
    const parentBreadcrumbs = procurementParentBreadcrumbs(ROUTE_PATH)

    const [data, setData] = useState<MmSupplierQuotation[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [supplierId, setSupplierId] = useState('')
    const { suppliers, loadFilterRefs } = useDeferredFilterRefs('suppliers')

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

    useEffect(() => {
        fetchData()
        const t = window.setTimeout(() => loadFilterRefs(), 0)
        return () => window.clearTimeout(t)
    }, [fetchData, loadFilterRefs])

    const columns = useMemo<ColumnDef<MmSupplierQuotation>[]>(() => [
        {
            header: 'Quotation',
            accessorKey: 'quotationNumber',
            size: 170,
            cell: ({ row }) => (
                <PrcDocNumberCell
                    icon="quote"
                    primary={row.original.quotationNumber}
                    secondary={row.original.rfq?.rfqNumber}
                />
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
                        className="inline-flex items-center gap-1 rounded-lg px-1 font-mono text-xs font-semibold text-primary hover:bg-gray-50 dark:hover:bg-gray-800/50"
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
                return (
                    <PrcSupplierCell
                        code={s?.supplierCode}
                        name={s?.supplierName ?? row.original.supplierId}
                    />
                )
            },
        },
        {
            header: 'Total',
            accessorKey: 'total',
            size: 110,
            cell: ({ row }) => <PrcMoneyCell amount={row.original.total} />,
        },
        {
            header: 'Validity',
            accessorKey: 'validityDate',
            size: 110,
            cell: ({ row }) => <PrcDateCell iso={row.original.validityDate} />,
        },
        {
            header: 'Status',
            accessorKey: 'status',
            size: 120,
            cell: ({ row }) => (
                <PrcAnimatedStatus
                    status={String(row.original.status)}
                    tone={prcStatusTone(String(row.original.status), PRC_QUOTE_STATUS)}
                />
            ),
        },
        {
            header: 'Submitted',
            accessorKey: 'submittedAt',
            size: 140,
            cell: ({ row }) => <PrcDateCell iso={row.original.submittedAt} />,
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
            <PageHeader
                breadcrumbs={parentBreadcrumbs}
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
                    <ProcurementResponsiveTable<MmSupplierQuotation>
                        columns={columns}
                        data={data}
                        compact
                        loading={loading}
                        getRowId={(row) => row.id}
                        noData={!loading && data.length === 0}
                        pagingData={{ total, pageIndex: page, pageSize }}
                        onPaginationChange={setPage}
                        onSelectChange={(size) => { setPageSize(size); setPage(1) }}
                        tableMinWidthClass="min-w-[960px]"
                    />
                </div>
            </AdaptiveCard>
        </PageContainer>
    )
}

export default SupplierQuotationsPage
