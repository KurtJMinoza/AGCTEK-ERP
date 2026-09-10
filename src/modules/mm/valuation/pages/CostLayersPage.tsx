'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { valuationService } from '../services/valuationService'
import { warehouseService } from '../../warehouse/services/warehouseService'
import type { CostLayer } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/valuation/cost-layers'
type Opt = { value: string; label: string }

const CostLayersPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [rows, setRows] = useState<CostLayer[]>([])
    const [loading, setLoading] = useState(false)
    const [warehouses, setWarehouses] = useState<Opt[]>([])
    const [warehouseId, setWarehouseId] = useState('')
    const [status, setStatus] = useState('')

    useEffect(() => {
        warehouseService
            .list({ limit: 200 })
            .then((d: any) =>
                setWarehouses(
                    (d?.data ?? []).map((w: any) => ({
                        value: w.id,
                        label: `${w.code} — ${w.name}`,
                    })),
                ),
            )
            .catch(() => undefined)
    }, [])

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await valuationService.listCostLayers({
                warehouseId: warehouseId || undefined,
                status: status || undefined,
            })
            setRows(res.data)
        } catch (e: any) {
            toast.push(
                <Notification type="danger" title="Error" closable>
                    {e?.response?.data?.message || 'Load failed'}
                </Notification>,
            )
        } finally {
            setLoading(false)
        }
    }, [warehouseId, status])

    useEffect(() => {
        load()
    }, [load])

    const columns: ColumnDef<CostLayer>[] = useMemo(
        () => [
            {
                header: 'Material',
                cell: ({ row }) =>
                    row.original.material?.materialCode || row.original.materialId,
            },
            {
                header: 'Warehouse',
                cell: ({ row }) =>
                    row.original.warehouse?.name || row.original.warehouseId,
            },
            { header: 'Original Qty', accessorKey: 'originalQuantity' },
            { header: 'Remaining', accessorKey: 'remainingQuantity' },
            { header: 'Unit Cost', accessorKey: 'unitCost' },
            {
                header: 'Posting Date',
                cell: ({ row }) =>
                    new Date(row.original.postingDate).toLocaleDateString(),
            },
            {
                header: 'Status',
                cell: ({ row }) => <StatusBadge status={row.original.status} />,
            },
        ],
        [],
    )

    const statusOpts = [
        { value: '', label: 'All' },
        { value: 'OPEN', label: 'OPEN' },
        { value: 'DEPLETED', label: 'DEPLETED' },
        { value: 'REVERSED', label: 'REVERSED' },
    ]

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Cost Layers"
                description="FIFO receipt layers and remaining quantities"
                
            />
            <AdaptiveCard className="mb-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <FormItem label="Warehouse">
                        <Select
                            isClearable
                            options={warehouses}
                            value={warehouses.find((o) => o.value === warehouseId) || null}
                            onChange={(o: any) => setWarehouseId(o?.value || '')}
                        />
                    </FormItem>
                    <FormItem label="Status">
                        <Select
                            options={statusOpts}
                            value={statusOpts.find((o) => o.value === status)}
                            onChange={(o: any) => setStatus(o?.value || '')}
                        />
                    </FormItem>
                    <Button variant="solid" onClick={load}>
                        Refresh
                    </Button>
                </div>
            </AdaptiveCard>
            <AdaptiveCard>
                <DataTable columns={columns} data={rows} loading={loading} />
            </AdaptiveCard>
        </PageContainer>
    )
}

export default CostLayersPage
