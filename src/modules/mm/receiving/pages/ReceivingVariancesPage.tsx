'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import Select from '@/components/ui/Select'
import Tag from '@/components/ui/Tag'
import { HiOutlineSearch } from 'react-icons/hi'
import { receivingService } from '../services/receivingService'
import type { MmReceivingVariance } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/receiving/receiving-variances'

type FilterOption = { value: string; label: string }

const STATUS_FILTER_OPTIONS: FilterOption[] = [
    { value: '', label: 'All statuses' },
    { value: 'OPEN', label: 'Open' },
    { value: 'RESOLVED', label: 'Resolved' },
]

const TYPE_FILTER_OPTIONS: FilterOption[] = [
    { value: '', label: 'All types' },
    { value: 'UNDER_RECEIPT', label: 'Under receipt' },
    { value: 'OVER_RECEIPT', label: 'Over receipt' },
    { value: 'DAMAGED', label: 'Damaged' },
    { value: 'UNEXPECTED_ITEM', label: 'Unexpected item' },
    { value: 'BATCH_MISMATCH', label: 'Batch mismatch' },
    { value: 'SERIAL_MISMATCH', label: 'Serial mismatch' },
    { value: 'UOM_MISMATCH', label: 'UOM mismatch' },
]

const VARIANCE_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger' | 'info'> = {
    OPEN: 'warning',
    RESOLVED: 'success',
    UNDER_RECEIPT: 'info',
    OVER_RECEIPT: 'warning',
    DAMAGED: 'danger',
    UNEXPECTED_ITEM: 'danger',
    BATCH_MISMATCH: 'danger',
    SERIAL_MISMATCH: 'danger',
    UOM_MISMATCH: 'warning',
}

function fmtDate(iso?: string) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

const ReceivingVariancesPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)

    const [rows, setRows] = useState<MmReceivingVariance[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)
    const [statusFilter, setStatusFilter] = useState('')
    const [typeFilter, setTypeFilter] = useState('')

    const fetchList = useCallback(async () => {
        setLoading(true)
        try {
            const res = await receivingService.listVariances({
                page,
                pageSize,
                status: statusFilter || undefined,
                varianceType: typeFilter || undefined,
            })
            setRows(res.data)
            setTotal(res.total)
        } catch {
            setRows([])
            setTotal(0)
        } finally {
            setLoading(false)
        }
    }, [page, pageSize, statusFilter, typeFilter])

    useEffect(() => { fetchList() }, [fetchList])

    const openCount = useMemo(() => rows.filter((r) => r.status === 'OPEN').length, [rows])

    const columns: ColumnDef<MmReceivingVariance>[] = useMemo(() => [
        {
            header: 'Receiving doc',
            accessorKey: 'receivingDocument.documentNumber',
            cell: ({ row }) =>
                row.original.receivingDocument?.documentNumber
                    ? (
                        <span className="font-medium">
                            {row.original.receivingDocument.documentNumber}
                        </span>
                    )
                    : '—',
        },
        {
            header: 'Type',
            accessorKey: 'varianceType',
            cell: ({ row }) => (
                <Tag className="text-xs">
                    {row.original.varianceType.replace(/_/g, ' ')}
                </Tag>
            ),
        },
        {
            header: 'Qty',
            accessorKey: 'quantity',
            cell: ({ row }) => Number(row.original.quantity),
        },
        {
            header: 'Description',
            accessorKey: 'description',
            cell: ({ row }) => row.original.description ?? '—',
        },
        {
            header: 'Resolution',
            accessorKey: 'status',
            cell: ({ row }) => (
                <StatusBadge tone={VARIANCE_TONE[row.original.status] ?? 'default'}>
                    {row.original.status}
                </StatusBadge>
            ),
        },
        {
            header: 'Detected',
            accessorKey: 'detectedAt',
            cell: ({ row }) => fmtDate(row.original.detectedAt),
        },
    ], [])

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Receiving Variances"
                description="Typed variance records from receiving validation — shortages, overages, damage, and identity mismatches."
            />

            <AdaptiveCard className="mb-4">
                <p className="text-sm text-gray-500">Open variances (page)</p>
                <p className="text-2xl font-semibold">{openCount}</p>
            </AdaptiveCard>

            <AdaptiveCard>
                <div className="mb-4 flex flex-wrap items-center gap-4">
                    <Select<FilterOption>
                        placeholder="Status"
                        options={STATUS_FILTER_OPTIONS}
                        value={STATUS_FILTER_OPTIONS.find((o) => o.value === statusFilter)}
                        onChange={(opt) => { setStatusFilter(opt?.value ?? ''); setPage(1) }}
                        className="min-w-[140px]"
                    />
                    <Select<FilterOption>
                        placeholder="Variance type"
                        options={TYPE_FILTER_OPTIONS}
                        value={TYPE_FILTER_OPTIONS.find((o) => o.value === typeFilter)}
                        onChange={(opt) => { setTypeFilter(opt?.value ?? ''); setPage(1) }}
                        className="min-w-[180px]"
                    />
                </div>

                <DataTable
                    columns={columns}
                    data={rows}
                    loading={loading}
                    pagingData={{ total, pageIndex: page, pageSize }}
                    onPaginationChange={(p) => setPage(p)}
                    onSelectChange={(s) => { setPageSize(s); setPage(1) }}
                />
            </AdaptiveCard>
        </PageContainer>
    )
}

export default ReceivingVariancesPage
