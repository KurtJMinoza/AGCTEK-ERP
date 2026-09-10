'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import Button from '@/components/ui/Button'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { HiOutlineCalendar } from 'react-icons/hi'
import { returnsDisposalService } from '../services/returnsDisposalService'
import type { BlockedBalance } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import { useRouter } from 'next/navigation'

const ROUTE = '/modules/mm/returns-disposal/expired-stock'

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

function fmtDate(iso?: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    })
}

const ExpiredStockPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const router = useRouter()
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(50)
    const [rows, setRows] = useState<BlockedBalance[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)

    const fetchList = useCallback(async () => {
        setLoading(true)
        try {
            const res = await returnsDisposalService.getExpiredStock({ page, pageSize })
            setRows(res.data)
            setTotal(res.total)
        } catch {
            pushToast('danger', 'Error', 'Failed to load expired stock')
        } finally {
            setLoading(false)
        }
    }, [page, pageSize])

    useEffect(() => {
        fetchList()
    }, [fetchList])

    const markAndDispose = async (row: BlockedBalance) => {
        try {
            if (row.stockStatus !== 'EXPIRED') {
                await returnsDisposalService.markExpired({
                    companyId: row.companyId,
                    warehouseId: row.warehouseId,
                    materialId: row.materialId,
                    uomId: row.material?.baseUomId || '',
                    quantity: Number(row.quantity),
                    unitCost: Number(row.material?.standardCost ?? 0),
                    batchId: row.batchId ?? undefined,
                    serialNumberId: row.serialNumberId ?? undefined,
                    storageBinId: row.storageBinId ?? undefined,
                    fromStockStatus: row.stockStatus,
                })
            }
            const doc = await returnsDisposalService.createDisposalFromBalances({
                companyId: row.companyId,
                warehouseId: row.warehouseId,
                disposalType: 'DISPOSAL',
                reason: 'EXPIRY',
                lines: [
                    {
                        materialId: row.materialId,
                        uomId: row.material?.baseUomId || '',
                        quantity: Number(row.quantity),
                        unitCost: Number(row.material?.standardCost ?? 0),
                        batchId: row.batchId ?? undefined,
                        serialNumberId: row.serialNumberId ?? undefined,
                        storageBinId: row.storageBinId ?? undefined,
                        stockStatus: 'EXPIRED',
                    },
                ],
            })
            pushToast('success', 'Created', doc.disposalNumber)
            router.push('/modules/mm/returns-disposal/disposal')
        } catch (e: any) {
            pushToast('danger', 'Failed', e?.response?.data?.message ?? e.message)
        }
    }

    const columns: ColumnDef<BlockedBalance>[] = useMemo(
        () => [
            {
                header: 'Material',
                cell: ({ row }) =>
                    row.original.material
                        ? `${row.original.material.materialCode} — ${row.original.material.materialName}`
                        : row.original.materialId,
            },
            {
                header: 'Warehouse',
                cell: ({ row }) => row.original.warehouse?.name ?? '—',
            },
            {
                header: 'Batch',
                cell: ({ row }) => row.original.batch?.batchNumber ?? '—',
            },
            {
                header: 'Expiry Date',
                cell: ({ row }) => fmtDate(row.original.batch?.expiryDate),
            },
            {
                header: 'Quantity',
                cell: ({ row }) => Number(row.original.quantity),
            },
            {
                header: 'Stock Status',
                cell: ({ row }) => (
                    <StatusBadge
                        tone={
                            row.original.stockStatus === 'EXPIRED' ? 'warning' : 'danger'
                        }
                    >
                        {row.original.stockStatus}
                    </StatusBadge>
                ),
            },
            {
                header: 'Actions',
                id: 'actions',
                cell: ({ row }) => (
                    <Button
                        size="xs"
                        variant="solid"
                        onClick={() => markAndDispose(row.original)}
                    >
                        Mark & Dispose
                    </Button>
                ),
            },
        ],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Expired Stock"
                description="Past-expiry batches — mark EXPIRED and create controlled disposal."
                icon={<HiOutlineCalendar />}
            />

            <AdaptiveCard>
                <DataTable
                    columns={columns}
                    data={rows}
                    loading={loading}
                    pagingData={{ total, pageIndex: page, pageSize }}
                    onPaginationChange={(p) => setPage(p)}
                    onSelectChange={(s) => setPageSize(s)}
                />
            </AdaptiveCard>
        </PageContainer>
    )
}

export default ExpiredStockPage
