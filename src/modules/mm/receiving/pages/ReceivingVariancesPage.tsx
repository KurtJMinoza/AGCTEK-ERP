'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Tag from '@/components/ui/Tag'
import { HiOutlineSearch } from 'react-icons/hi'
import { goodsReceiptService } from '@/modules/mm/inventory/services/goodsReceiptService'
import type { GoodsReceipt } from '@/modules/mm/inventory/types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/receiving/receiving-variances'

type FilterOption = { value: string; label: string }

const STATUS_FILTER_OPTIONS: FilterOption[] = [
    { value: '', label: 'All statuses' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'POSTED', label: 'Posted' },
]

const STATUS_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger'> = {
    DRAFT: 'default',
    POSTED: 'success',
    CANCELLED: 'danger',
    REVERSED: 'warning',
}

function fmtDate(iso?: string) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function lineFlags(gr: GoodsReceipt): string[] {
    const flags = new Set<string>()
    for (const line of gr.lines ?? []) {
        if (line.discrepancyFlag) {
            line.discrepancyFlag.split(',').forEach((f) => flags.add(f.trim()))
        }
    }
    return [...flags]
}

const ReceivingVariancesPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)

    const [rows, setRows] = useState<GoodsReceipt[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('')

    const fetchList = useCallback(async () => {
        setLoading(true)
        try {
            const res = await goodsReceiptService.list({
                page,
                pageSize,
                search: search || undefined,
                status: statusFilter || undefined,
            })
            const withFlags = res.data.filter((gr) =>
                (gr.lines ?? []).some((l) => !!l.discrepancyFlag),
            )
            setRows(withFlags)
            setTotal(withFlags.length)
        } catch {
            setRows([])
            setTotal(0)
        } finally {
            setLoading(false)
        }
    }, [page, pageSize, search, statusFilter])

    useEffect(() => { fetchList() }, [fetchList])

    const columns: ColumnDef<GoodsReceipt>[] = useMemo(() => [
        { header: 'Document #', accessorKey: 'documentNumber' },
        {
            header: 'Supplier',
            accessorKey: 'supplier.supplierName',
            cell: ({ row }) =>
                row.original.supplier?.supplierName
                ?? row.original.supplier?.name
                ?? '—',
        },
        {
            header: 'Warehouse',
            accessorKey: 'warehouse.name',
            cell: ({ row }) => row.original.warehouse?.name ?? '—',
        },
        {
            header: 'Variances',
            id: 'flags',
            cell: ({ row }) => (
                <div className="flex flex-wrap gap-1">
                    {lineFlags(row.original).map((f) => (
                        <Tag key={f} className="border-0 bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
                            {f}
                        </Tag>
                    ))}
                </div>
            ),
        },
        {
            header: 'Status',
            accessorKey: 'status',
            cell: ({ row }) => (
                <StatusBadge tone={STATUS_TONE[row.original.status] ?? 'default'}>
                    {row.original.status}
                </StatusBadge>
            ),
        },
        {
            header: 'Posting date',
            accessorKey: 'postingDate',
            cell: ({ row }) => fmtDate(row.original.postingDate),
        },
    ], [])

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Receiving Variances"
                description="Goods receipts with shortage, overage, or damaged discrepancy flags"
            />

            <AdaptiveCard>
                <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Input
                        prefix={<HiOutlineSearch />}
                        placeholder="Search document #..."
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                    />
                    <Select<FilterOption>
                        placeholder="Status"
                        options={STATUS_FILTER_OPTIONS}
                        value={STATUS_FILTER_OPTIONS.find((o) => o.value === statusFilter)}
                        onChange={(opt) => { setStatusFilter(opt?.value ?? ''); setPage(1) }}
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
