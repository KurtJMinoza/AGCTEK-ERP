'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { HiOutlineExclamation } from 'react-icons/hi'
import { returnsDisposalService } from '../services/returnsDisposalService'
import { supplierService } from '../../supplier-management/services/supplierService'
import type { BlockedBalance } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import { useRouter } from 'next/navigation'

const ROUTE = '/modules/mm/returns-disposal/damaged-stock'

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

function balanceLine(row: BlockedBalance) {
    return {
        materialId: row.materialId,
        uomId: row.material?.baseUomId || '',
        quantity: Number(row.quantity),
        unitCost: Number(row.material?.standardCost ?? 0),
        batchId: row.batchId ?? undefined,
        serialNumberId: row.serialNumberId ?? undefined,
        storageBinId: row.storageBinId ?? undefined,
        stockStatus: row.stockStatus,
    }
}

const DamagedStockPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const router = useRouter()
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(50)
    const [rows, setRows] = useState<BlockedBalance[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [suppliers, setSuppliers] = useState<{ value: string; label: string }[]>([])
    const [returnRow, setReturnRow] = useState<BlockedBalance | null>(null)
    const [supplierId, setSupplierId] = useState('')
    const [submitting, setSubmitting] = useState(false)

    const fetchList = useCallback(async () => {
        setLoading(true)
        try {
            const res = await returnsDisposalService.getDamagedStock({ page, pageSize })
            setRows(res.data)
            setTotal(res.total)
        } catch {
            pushToast('danger', 'Error', 'Failed to load damaged stock')
        } finally {
            setLoading(false)
        }
    }, [page, pageSize])

    useEffect(() => {
        fetchList()
        supplierService
            .list({ limit: 200 })
            .then((r: any) => {
                const list = Array.isArray(r) ? r : (r?.data ?? [])
                setSuppliers(
                    list.map((s: any) => ({
                        value: s.id,
                        label: `${s.supplierCode} — ${s.supplierName}`,
                    })),
                )
            })
            .catch(() => {})
    }, [fetchList])

    const createDisposal = async (row: BlockedBalance) => {
        try {
            const doc = await returnsDisposalService.createDisposalFromBalances({
                companyId: row.companyId,
                warehouseId: row.warehouseId,
                disposalType: 'DISPOSAL',
                reason: 'DAMAGE',
                lines: [balanceLine(row)],
            })
            pushToast('success', 'Created', doc.disposalNumber)
            router.push('/modules/mm/returns-disposal/disposal')
        } catch (e: any) {
            pushToast('danger', 'Failed', e?.response?.data?.message ?? e.message)
        }
    }

    const createReturn = async () => {
        if (!returnRow || !supplierId) {
            pushToast('danger', 'Validation', 'Supplier is required')
            return
        }
        setSubmitting(true)
        try {
            const doc = await returnsDisposalService.createReturnFromBalances({
                companyId: returnRow.companyId,
                warehouseId: returnRow.warehouseId,
                supplierId,
                reason: 'DAMAGE',
                lines: [balanceLine(returnRow)],
            })
            pushToast('success', 'Created', doc.returnNumber)
            setReturnRow(null)
            router.push('/modules/mm/returns-disposal/supplier-returns')
        } catch (e: any) {
            pushToast('danger', 'Failed', e?.response?.data?.message ?? e.message)
        } finally {
            setSubmitting(false)
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
                header: 'Bin',
                cell: ({ row }) => row.original.storageBin?.binCode ?? '—',
            },
            {
                header: 'Stock Status',
                cell: ({ row }) => (
                    <StatusBadge tone="danger">{row.original.stockStatus}</StatusBadge>
                ),
            },
            {
                header: 'Quantity',
                cell: ({ row }) => Number(row.original.quantity),
            },
            {
                header: 'Actions',
                id: 'actions',
                cell: ({ row }) => (
                    <div className="flex gap-2">
                        <Button
                            size="xs"
                            variant="solid"
                            onClick={() => setReturnRow(row.original)}
                        >
                            Create Return
                        </Button>
                        <Button size="xs" onClick={() => createDisposal(row.original)}>
                            Create Disposal
                        </Button>
                    </div>
                ),
            },
        ],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [suppliers],
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Damaged Stock"
                description="Blocked / damaged balances — prefill supplier return or disposal."
                icon={<HiOutlineExclamation />}
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

            <FormDialog
                isOpen={!!returnRow}
                onClose={() => setReturnRow(null)}
                size="md"
                title="Create supplier return from blocked stock"
                icon={<HiOutlineExclamation />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setReturnRow(null)}>Cancel</Button>
                        <Button size="sm" variant="solid" loading={submitting} onClick={createReturn}>
                            Create return
                        </Button>
                    </>
                }
            >
                <FormItem label="Supplier">
                    <Select
                        options={suppliers}
                        value={suppliers.find((o) => o.value === supplierId)}
                        onChange={(o: { value?: string } | null) => setSupplierId(o?.value ?? '')}
                    />
                </FormItem>
                <p className="text-sm text-gray-500">
                    Prefills {returnRow?.material?.materialCode} qty{' '}
                    {returnRow ? Number(returnRow.quantity) : 0} from blocked stock.
                </p>
            </FormDialog>
        </PageContainer>
    )
}

export default DamagedStockPage
