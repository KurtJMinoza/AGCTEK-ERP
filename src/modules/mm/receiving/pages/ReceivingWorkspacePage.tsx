'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import Tabs from '@/components/ui/Tabs'
import { HiOutlineInboxIn, HiOutlineSearch } from 'react-icons/hi'
import { inboundService } from '../services/inboundService'
import ReceiveAgainstErDialog from '../components/ReceiveAgainstErDialog'
import type { MmExpectedReceipt } from '../types'
import type { GoodsReceipt } from '@/modules/mm/inventory/types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/receiving/receiving-inspection'
const ER_ROUTE = '/modules/mm/receiving/expected-receipts'
const GR_ROUTE = '/modules/mm/receiving/goods-receipt'

const STATUS_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger' | 'info'> = {
    OPEN: 'info',
    IN_PROGRESS: 'warning',
    CLOSED: 'success',
    CANCELLED: 'danger',
}

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>{msg}</Notification>,
        { placement: 'top-end' },
    )
}

function fmtDate(iso?: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

const ReceivingWorkspacePage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)

    const [data, setData] = useState<MmExpectedReceipt[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)
    const [search, setSearch] = useState('')
    const [statusTab, setStatusTab] = useState('OPEN')

    const [selected, setSelected] = useState<MmExpectedReceipt | null>(null)
    const [receiveOpen, setReceiveOpen] = useState(false)
    const [lastGr, setLastGr] = useState<GoodsReceipt | null>(null)

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const res = await inboundService.listExpectedReceipts({
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

    const openReceive = useCallback(async (row: MmExpectedReceipt) => {
        try {
            const full = await inboundService.getExpectedReceipt(row.id)
            setSelected(full)
            setReceiveOpen(true)
        } catch {
            pushToast('danger', 'Error', 'Failed to load expected receipt')
        }
    }, [])

    const columns: ColumnDef<MmExpectedReceipt>[] = useMemo(() => [
        {
            header: 'Document #',
            accessorKey: 'documentNumber',
            cell: ({ row }) => (
                <Link
                    href={`${ER_ROUTE}/${row.original.id}`}
                    className="text-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                >
                    {row.original.documentNumber}
                </Link>
            ),
        },
        {
            header: 'Supplier',
            accessorKey: 'supplier.supplierName',
            cell: ({ row }) => row.original.supplier?.supplierName ?? '—',
        },
        {
            header: 'PO / ASN',
            id: 'source',
            cell: ({ row }) =>
                row.original.purchaseOrder?.poNumber
                ?? row.original.asn?.asnNumber
                ?? row.original.sourceType,
        },
        {
            header: 'Warehouse',
            accessorKey: 'warehouse.name',
            cell: ({ row }) => row.original.warehouse?.name ?? '—',
        },
        {
            header: 'Expected',
            accessorKey: 'expectedDate',
            cell: ({ row }) => fmtDate(row.original.expectedDate),
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
            header: '',
            id: 'actions',
            cell: ({ row }) => {
                const canReceive = !['CLOSED', 'CANCELLED'].includes(row.original.status)
                if (!canReceive) return null
                return (
                    <Button
                        size="xs"
                        variant="solid"
                        icon={<HiOutlineInboxIn />}
                        onClick={(e) => {
                            e.stopPropagation()
                            openReceive(row.original)
                        }}
                    >
                        Receive
                    </Button>
                )
            },
        },
    ], [openReceive])

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Receiving Inspection"
                description="Pick an open expected receipt and record quantities into a draft goods receipt"
            />

            {lastGr ? (
                <AdaptiveCard className="mb-4">
                    <p className="text-sm">
                        Last draft GR:{' '}
                        <Link href={GR_ROUTE} className="text-primary hover:underline font-medium">
                            {lastGr.documentNumber}
                        </Link>
                        {' '}
                        <StatusBadge tone="default">{lastGr.status}</StatusBadge>
                    </p>
                </AdaptiveCard>
            ) : null}

            <AdaptiveCard>
                <div className="mb-4 flex flex-wrap items-center gap-4">
                    <Input
                        prefix={<HiOutlineSearch />}
                        placeholder="Search document #..."
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                        className="max-w-xs"
                    />
                </div>

                <Tabs value={statusTab} onChange={(val) => { setStatusTab(val as string); setPage(1) }}>
                    <Tabs.TabList>
                        <Tabs.TabNav value="OPEN">Open</Tabs.TabNav>
                        <Tabs.TabNav value="IN_PROGRESS">In Progress</Tabs.TabNav>
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

            <ReceiveAgainstErDialog
                isOpen={receiveOpen}
                expectedReceipt={selected}
                onClose={() => setReceiveOpen(false)}
                onSuccess={(gr) => {
                    setLastGr(gr)
                    fetchData()
                }}
            />
        </PageContainer>
    )
}

export default ReceivingWorkspacePage
