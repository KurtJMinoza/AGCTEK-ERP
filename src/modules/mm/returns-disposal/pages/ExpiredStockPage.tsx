'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import ReturnsResponsiveTable, { type ColumnDef } from '../components/ReturnsResponsiveTable'
import {
    RD_BLOCKED_STOCK_STATUS,
    RdAnimatedStatus,
    RdDateCell,
    RdMaterialCell,
    RdPartyCell,
    RdPlainCell,
    RdQtyCell,
    rdStatusTone,
} from '../components/returnsTableUi'
import { returnsParentBreadcrumbs } from '../utils/returnsPageUi'
import Button from '@/components/ui/Button'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { HiOutlineCalendar } from 'react-icons/hi'
import { returnsDisposalService } from '../services/returnsDisposalService'
import type { BlockedBalance } from '../types'
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

const ExpiredStockPage = () => {
    const parentBreadcrumbs = returnsParentBreadcrumbs(ROUTE)
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
                cell: ({ row }) => (
                    <RdMaterialCell
                        code={row.original.material?.materialCode ?? row.original.materialId}
                        name={row.original.material?.materialName}
                    />
                ),
            },
            {
                header: 'Warehouse',
                cell: ({ row }) => (
                    <RdPartyCell kind="warehouse" name={row.original.warehouse?.name} />
                ),
            },
            {
                header: 'Batch',
                cell: ({ row }) => (
                    <RdPlainCell mono>
                        {row.original.batch?.batchNumber ?? '—'}
                    </RdPlainCell>
                ),
            },
            {
                header: 'Expiry date',
                cell: ({ row }) => (
                    <RdDateCell iso={row.original.batch?.expiryDate} />
                ),
            },
            {
                header: 'Quantity',
                cell: ({ row }) => <RdQtyCell value={row.original.quantity} />,
            },
            {
                header: 'Stock status',
                cell: ({ row }) => (
                    <RdAnimatedStatus
                        status={row.original.stockStatus}
                        tone={rdStatusTone(row.original.stockStatus, RD_BLOCKED_STOCK_STATUS)}
                    />
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
        [],
    )

    return (
        <PageContainer>
            <PageHeader
                title="Expired Stock"
                description="Past-expiry batches — mark EXPIRED and create controlled disposal."
                icon={<HiOutlineCalendar />}
                breadcrumbs={parentBreadcrumbs}
            />

            <AdaptiveCard>
                <ReturnsResponsiveTable
                    columns={columns}
                    data={rows}
                    loading={loading}
                    getRowId={(row) => row.id}
                    pagingData={{ total, pageIndex: page, pageSize }}
                    onPaginationChange={(p) => setPage(p)}
                    onSelectChange={(s) => setPageSize(s)}
                    tableMinWidthClass="min-w-[980px]"
                />
            </AdaptiveCard>
        </PageContainer>
    )
}

export default ExpiredStockPage
