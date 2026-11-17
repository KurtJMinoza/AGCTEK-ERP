'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import MrpResponsiveTable, { type ColumnDef } from '../components/MrpResponsiveTable'
import {
    MrpAnimatedStatus,
    MrpMaterialCell,
    MrpPlainCell,
    MrpQtyCell,
    MRP_FLAG_STATUS,
    mrpStatusTone,
} from '../components/mrpTableUi'
import { mrpParentBreadcrumbs } from '../utils/mrpPageUi'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import SafetyStockChart, {
    filterSafetyStockRows,
} from '../components/SafetyStockChart'
import { planningService } from '../services/planningService'
import { useDeferredFilterRefs } from '@/modules/mm/shared/useLazyMmRefs'
import type { MaterialRequirement } from '../types'

const ROUTE = '/modules/mm/planning-mrp/safety-stock'
type Opt = { value: string; label: string }

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const SafetyStockPage = () => {
    const parentBreadcrumbs = mrpParentBreadcrumbs(ROUTE)
    const [rows, setRows] = useState<MaterialRequirement[]>([])
    const [loading, setLoading] = useState(true)
    const { companies, warehouses, loadFilterRefs } = useDeferredFilterRefs(
        'companies',
        'warehouses',
    )
    const [companyId, setCompanyId] = useState('')
    const [warehouseId, setWarehouseId] = useState('')

    useEffect(() => {
        if (!companyId && companies[0]) setCompanyId(companies[0].value)
    }, [companies, companyId])

    const load = useCallback(async () => {
        if (!companyId) return
        setLoading(true)
        try {
            const res = await planningService.listRequirements({
                companyId,
                warehouseId: warehouseId || undefined,
                limit: 200,
            })
            setRows(filterSafetyStockRows(res.data))
        } catch (e: any) {
            pushToast(
                'danger',
                'Error',
                e?.response?.data?.message || 'Load failed',
            )
        } finally {
            setLoading(false)
        }
    }, [companyId, warehouseId])

    useEffect(() => {
        load()
        const t = window.setTimeout(() => loadFilterRefs(), 0)
        return () => window.clearTimeout(t)
    }, [load, loadFilterRefs])

    const columns: ColumnDef<MaterialRequirement>[] = useMemo(
        () => [
            {
                header: 'Material',
                cell: ({ row }) => (
                    <MrpMaterialCell
                        code={row.original.material?.materialCode}
                        name={row.original.material?.materialName}
                    />
                ),
            },
            {
                header: 'Warehouse',
                cell: ({ row }) => (
                    <MrpPlainCell mono>{row.original.warehouse?.code}</MrpPlainCell>
                ),
            },
            {
                header: 'Available',
                cell: ({ row }) => <MrpQtyCell value={row.original.availableQty} />,
            },
            {
                header: 'Safety stock',
                cell: ({ row }) => <MrpQtyCell value={row.original.safetyStock} />,
            },
            {
                header: 'Gap',
                cell: ({ row }) => {
                    const gap =
                        Number(row.original.safetyStock) -
                        Number(row.original.availableQty)
                    return (
                        <MrpQtyCell
                            value={gap > 0 ? gap : 0}
                            emphasize={gap > 0 ? 'danger' : undefined}
                        />
                    )
                },
            },
            {
                header: 'Status',
                cell: ({ row }) => {
                    const below =
                        Number(row.original.availableQty) <
                        Number(row.original.safetyStock)
                    const code = below ? 'BELOW_SAFETY' : 'OK'
                    return (
                        <MrpAnimatedStatus
                            status={code}
                            tone={mrpStatusTone(code, MRP_FLAG_STATUS)}
                        />
                    )
                },
            },
        ],
        [],
    )

    return (
        <PageContainer>
            <PageHeader
                breadcrumbs={parentBreadcrumbs}
                title="Safety Stock"
                description="Available stock versus safety stock from the latest MRP snapshot"
            />
            <AdaptiveCard className="mb-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormItem label="Company">
                        <Select
                            options={companies}
                            value={companies.find((o) => o.value === companyId)}
                            onChange={(o: Opt | null) =>
                                setCompanyId(o?.value || '')
                            }
                        />
                    </FormItem>
                    <FormItem label="Warehouse">
                        <Select
                            isClearable
                            options={warehouses}
                            value={
                                warehouses.find(
                                    (o) => o.value === warehouseId,
                                ) || null
                            }
                            onChange={(o: Opt | null) =>
                                setWarehouseId(o?.value || '')
                            }
                        />
                    </FormItem>
                </div>
            </AdaptiveCard>

            {companyId ? (
                <div className="mb-4">
                    <SafetyStockChart
                        companyId={companyId}
                        warehouseId={warehouseId || undefined}
                    />
                </div>
            ) : null}

            <AdaptiveCard>
                <MrpResponsiveTable
                    columns={columns}
                    data={rows}
                    loading={loading}
                    getRowId={(row) => row.id}
                    tableMinWidthClass="min-w-[920px]"
                />
            </AdaptiveCard>
        </PageContainer>
    )
}

export default SafetyStockPage
