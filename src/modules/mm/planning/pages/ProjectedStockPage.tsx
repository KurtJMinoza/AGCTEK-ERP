'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import Select from '@/components/ui/Select'
import Card from '@/components/ui/Card'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { planningService } from '../services/planningService'
import { useDeferredFilterRefs } from '@/modules/mm/shared/useLazyMmRefs'
import type { ProjectedStockRow } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/planning-mrp/projected-stock'

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const ProjectedStockPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [rows, setRows] = useState<ProjectedStockRow[]>([])
    const [loading, setLoading] = useState(true)
    const [runLabel, setRunLabel] = useState<string | null>(null)
    const { companies, warehouses, materials, loadFilterRefs } =
        useDeferredFilterRefs('companies', 'warehouses', 'materials')
    const [companyId, setCompanyId] = useState('')
    const [warehouseId, setWarehouseId] = useState('')
    const [materialId, setMaterialId] = useState('')

    useEffect(() => {
        if (!companyId && companies[0]) setCompanyId(companies[0].value)
    }, [companies, companyId])

    const load = useCallback(async () => {
        if (!companyId) return
        setLoading(true)
        try {
            const res = await planningService.listProjectedStock({
                companyId,
                warehouseId: warehouseId || undefined,
                materialId: materialId || undefined,
                limit: 200,
            })
            setRows(res.data)
            setRunLabel(res.data[0]?.mrpRun?.runNumber ?? null)
        } catch (e: any) {
            pushToast('danger', 'Error', e?.response?.data?.message || 'Load failed')
        } finally {
            setLoading(false)
        }
    }, [companyId, warehouseId, materialId])

    useEffect(() => {
        load()
        const t = window.setTimeout(() => loadFilterRefs(), 0)
        return () => window.clearTimeout(t)
    }, [load, loadFilterRefs])

    const summary = useMemo(() => {
        const minClosing = rows.reduce<number | null>((min, r) => {
            const v = Number(r.closingQty)
            if (min === null || v < min) return v
            return min
        }, null)
        const totalDemand = rows.reduce((s, r) => s + Number(r.demandQty), 0)
        const totalSupply = rows.reduce((s, r) => s + Number(r.supplyQty), 0)
        return { minClosing, totalDemand, totalSupply, buckets: rows.length }
    }, [rows])

    const columns: ColumnDef<ProjectedStockRow>[] = useMemo(
        () => [
            {
                header: 'Date',
                cell: ({ row }) =>
                    row.original.bucketDate
                        ? String(row.original.bucketDate).slice(0, 10)
                        : '—',
            },
            {
                header: 'Material',
                cell: ({ row }) => row.original.material?.materialCode ?? '—',
            },
            {
                header: 'Warehouse',
                cell: ({ row }) => row.original.warehouse?.code ?? '—',
            },
            {
                header: 'Opening',
                cell: ({ row }) => Number(row.original.openingQty),
            },
            {
                header: 'Demand',
                cell: ({ row }) => Number(row.original.demandQty),
            },
            {
                header: 'Supply',
                cell: ({ row }) => Number(row.original.supplyQty),
            },
            {
                header: 'Reservation',
                cell: ({ row }) => Number(row.original.reservationQty),
            },
            {
                header: 'Closing (proj.)',
                cell: ({ row }) => Number(row.original.closingQty),
            },
        ],
        [],
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Projected Stock"
                description={
                    runLabel
                        ? `Time-phased availability from latest MRP run ${runLabel}`
                        : 'Time-phased projected availability from the latest completed MRP run'
                }
            />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {[
                    { label: 'Buckets', value: summary.buckets },
                    { label: 'Min closing', value: summary.minClosing ?? '—' },
                    { label: 'Total demand', value: summary.totalDemand },
                    { label: 'Total supply', value: summary.totalSupply },
                ].map((c) => (
                    <Card key={c.label} className="p-4">
                        <div className="text-xs text-gray-500">{c.label}</div>
                        <div className="text-2xl font-semibold">{c.value}</div>
                    </Card>
                ))}
            </div>

            <AdaptiveCard className="mb-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormItem label="Company">
                        <Select
                            options={companies}
                            value={companies.find((o) => o.value === companyId)}
                            onChange={(o: any) => setCompanyId(o?.value || '')}
                        />
                    </FormItem>
                    <FormItem label="Warehouse">
                        <Select
                            isClearable
                            options={warehouses}
                            value={
                                warehouseId
                                    ? warehouses.find((o) => o.value === warehouseId)
                                    : null
                            }
                            onChange={(o: any) => setWarehouseId(o?.value || '')}
                        />
                    </FormItem>
                    <FormItem label="Material">
                        <Select
                            isClearable
                            options={materials}
                            value={
                                materialId
                                    ? materials.find((o) => o.value === materialId)
                                    : null
                            }
                            onChange={(o: any) => setMaterialId(o?.value || '')}
                        />
                    </FormItem>
                </div>
            </AdaptiveCard>

            <AdaptiveCard>
                <DataTable columns={columns} data={rows} loading={loading} />
            </AdaptiveCard>
        </PageContainer>
    )
}

export default ProjectedStockPage
