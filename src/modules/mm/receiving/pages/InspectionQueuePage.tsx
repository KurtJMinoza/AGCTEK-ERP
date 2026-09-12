'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import Input from '@/components/ui/Input'
import Tabs from '@/components/ui/Tabs'
import { HiOutlineClipboardList, HiOutlineSearch } from 'react-icons/hi'
import { inspectionService } from '../services/inspectionService'
import type { MmInspectionLot } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/receiving/inspection-queue'
const DETAIL_ROUTE = '/modules/mm/receiving/inspection-queue'

const STATUS_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger' | 'info'> = {
    PENDING: 'warning',
    IN_PROGRESS: 'info',
    COMPLETED: 'success',
    CANCELLED: 'danger',
    PASS: 'success',
    FAIL: 'danger',
    PARTIAL_PASS: 'warning',
}

function fmtDate(iso?: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

const InspectionQueuePage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [data, setData] = useState<MmInspectionLot[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)
    const [search, setSearch] = useState('')
    const [statusTab, setStatusTab] = useState('PENDING')

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const res = await inspectionService.list({
                page,
                pageSize,
                search: search || undefined,
                status: statusTab || undefined,
            })
            setData(res.data)
            setTotal(res.total)
        } catch {
            setData([])
            setTotal(0)
        } finally {
            setLoading(false)
        }
    }, [page, pageSize, search, statusTab])

    useEffect(() => { fetchData() }, [fetchData])

    const pendingCount = useMemo(
        () => data.filter((l) => l.status === 'PENDING' || l.status === 'IN_PROGRESS').length,
        [data],
    )

    const columns: ColumnDef<MmInspectionLot>[] = useMemo(() => [
        {
            header: 'Lot #',
            accessorKey: 'lotNumber',
            cell: ({ row }) => (
                <Link
                    href={`${DETAIL_ROUTE}/${row.original.id}`}
                    className="text-primary hover:underline font-medium"
                >
                    {row.original.lotNumber}
                </Link>
            ),
        },
        {
            header: 'Material',
            accessorKey: 'material.materialCode',
            cell: ({ row }) =>
                row.original.material
                    ? `${row.original.material.materialCode} — ${row.original.material.materialName}`
                    : row.original.materialId,
        },
        {
            header: 'GR',
            accessorKey: 'goodsReceipt.documentNumber',
            cell: ({ row }) => row.original.goodsReceipt?.documentNumber ?? '—',
        },
        {
            header: 'Qty',
            accessorKey: 'quantity',
            cell: ({ row }) => Number(row.original.quantity),
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
            header: 'Result',
            accessorKey: 'result',
            cell: ({ row }) =>
                row.original.result ? (
                    <StatusBadge tone={STATUS_TONE[row.original.result] ?? 'default'}>
                        {row.original.result}
                    </StatusBadge>
                ) : (
                    '—'
                ),
        },
        {
            header: 'Created',
            accessorKey: 'createdAt',
            cell: ({ row }) => fmtDate(row.original.createdAt),
        },
    ], [])

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Inspection Queue"
                description="Pending inspection lots created at goods receipt post. Record samples and usage decisions from lot detail."
                icon={<HiOutlineClipboardList />}
            />

            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <AdaptiveCard>
                    <p className="text-sm text-gray-500">Pending / in progress (page)</p>
                    <p className="text-2xl font-semibold">{pendingCount}</p>
                </AdaptiveCard>
                <AdaptiveCard>
                    <p className="text-sm text-gray-500">Total lots (page)</p>
                    <p className="text-2xl font-semibold">{total}</p>
                </AdaptiveCard>
            </div>

            <AdaptiveCard>
                <div className="mb-4 flex flex-wrap items-center gap-4">
                    <Input
                        prefix={<HiOutlineSearch />}
                        placeholder="Search lot #..."
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                        className="max-w-xs"
                    />
                </div>

                <Tabs value={statusTab} onChange={(val) => { setStatusTab(val as string); setPage(1) }}>
                    <Tabs.TabList>
                        <Tabs.TabNav value="PENDING">Pending</Tabs.TabNav>
                        <Tabs.TabNav value="IN_PROGRESS">In Progress</Tabs.TabNav>
                        <Tabs.TabNav value="COMPLETED">Completed</Tabs.TabNav>
                        <Tabs.TabNav value="">All</Tabs.TabNav>
                    </Tabs.TabList>
                </Tabs>

                <DataTable
                    columns={columns}
                    data={data}
                    loading={loading}
                    pagingData={{ total, pageIndex: page, pageSize }}
                    onPaginationChange={(p) => setPage(p)}
                    onSelectChange={(s) => { setPageSize(s); setPage(1) }}
                />
            </AdaptiveCard>
        </PageContainer>
    )
}

export default InspectionQueuePage
