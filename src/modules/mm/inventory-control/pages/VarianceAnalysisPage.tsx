'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { inventoryControlService } from '../services/inventoryControlService'
import { warehouseService } from '../../warehouse/services/warehouseService'
import type { InventoryCountLine } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/inventory-control/variance-analysis'

type Opt = { value: string; label: string }

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const VarianceAnalysisPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [rows, setRows] = useState<InventoryCountLine[]>([])
    const [loading, setLoading] = useState(true)
    const [warehouseId, setWarehouseId] = useState('')
    const [warehouses, setWarehouses] = useState<Opt[]>([])

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const statuses = [
                'COUNTED',
                'REQUIRE_RECOUNT',
                'RECOUNTED',
                'APPROVED',
                'ADJUSTED',
            ]
            const results = await Promise.all(
                statuses.map((status) =>
                    inventoryControlService.listLines({
                        status,
                        warehouseId: warehouseId || undefined,
                        limit: 100,
                    }),
                ),
            )
            const merged = results.flatMap((r) => r.data).filter((l) => {
                const v = Number(l.varianceQuantity ?? 0)
                return v !== 0 || ['REQUIRE_RECOUNT', 'RECOUNTED'].includes(l.status)
            })
            // unique by id
            const map = new Map(merged.map((l) => [l.id, l]))
            setRows([...map.values()])
        } catch (e: any) {
            pushToast('danger', 'Load failed', e?.response?.data?.message ?? e.message)
        } finally {
            setLoading(false)
        }
    }, [warehouseId])

    useEffect(() => {
        load()
        warehouseService.list({ limit: 200 }).then((wh: any) => {
            setWarehouses(
                (wh?.data ?? []).map((w: any) => ({
                    value: w.id,
                    label: `${w.code} — ${w.name}`,
                })),
            )
        })
    }, [load])

    const columns: ColumnDef<InventoryCountLine>[] = useMemo(
        () => [
            {
                header: 'Count',
                cell: ({ row }) => row.original.count?.countNumber ?? '—',
            },
            {
                header: 'Material',
                cell: ({ row }) =>
                    row.original.material?.materialCode ??
                    row.original.materialId.slice(0, 8),
            },
            {
                header: 'System',
                cell: ({ row }) => Number(row.original.systemQuantity ?? 0),
            },
            {
                header: 'Physical',
                cell: ({ row }) =>
                    Number(
                        row.original.finalQuantity ??
                            row.original.recountQuantity ??
                            row.original.countedQuantity ??
                            0,
                    ),
            },
            {
                header: 'Variance qty',
                cell: ({ row }) => Number(row.original.varianceQuantity ?? 0),
            },
            {
                header: 'Variance value',
                cell: ({ row }) => Number(row.original.varianceValue ?? 0).toFixed(2),
            },
            {
                header: 'Counter',
                cell: ({ row }) => row.original.countedBy ?? row.original.assignedCounter ?? '—',
            },
            {
                header: 'Original',
                cell: ({ row }) =>
                    row.original.originalCount != null
                        ? Number(row.original.originalCount)
                        : '—',
            },
            {
                header: 'Recount',
                cell: ({ row }) =>
                    row.original.recountQuantity != null
                        ? Number(row.original.recountQuantity)
                        : '—',
            },
            {
                header: 'Approver',
                cell: ({ row }) => row.original.approvedBy ?? '—',
            },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <StatusBadge
                        tone={
                            row.original.status === 'REQUIRE_RECOUNT'
                                ? 'warning'
                                : 'default'
                        }
                    >
                        {row.original.status === 'REQUIRE_RECOUNT'
                            ? 'Recount required'
                            : row.original.status}
                    </StatusBadge>
                ),
            },
        ],
        [],
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Variance Analysis"
                description="Physical vs system quantity and value by count line."
                actions={<Button onClick={load}>Refresh</Button>}
            />
            <AdaptiveCard className="mb-4">
                <FormItem label="Warehouse">
                    <Select
                        className="max-w-md"
                        options={warehouses}
                        value={warehouses.find((o) => o.value === warehouseId) ?? null}
                        onChange={(o: any) => setWarehouseId(o?.value ?? '')}
                        isClearable
                    />
                </FormItem>
            </AdaptiveCard>
            <AdaptiveCard>
                <DataTable columns={columns} data={rows} loading={loading} />
            </AdaptiveCard>
        </PageContainer>
    )
}

export default VarianceAnalysisPage
