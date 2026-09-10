'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { planningService } from '../services/planningService'
import { warehouseService } from '../../warehouse/services/warehouseService'
import { orgService } from '../../material-master/services/referenceService'
import type { MaterialRequirement } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

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
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [rows, setRows] = useState<MaterialRequirement[]>([])
    const [loading, setLoading] = useState(true)
    const [companies, setCompanies] = useState<Opt[]>([])
    const [warehouses, setWarehouses] = useState<Opt[]>([])
    const [companyId, setCompanyId] = useState('')
    const [warehouseId, setWarehouseId] = useState('')

    useEffect(() => {
        Promise.all([
            orgService.companies(),
            warehouseService.list({ limit: 200 }),
        ]).then(([cos, wh]: any[]) => {
            const c = (Array.isArray(cos) ? cos : cos?.data ?? []).map(
                (x: any) => ({ value: x.id, label: x.name || x.code }),
            )
            setCompanies(c)
            setWarehouses(
                (wh?.data ?? []).map((x: any) => ({
                    value: x.id,
                    label: `${x.code} — ${x.name}`,
                })),
            )
            if (c[0]) setCompanyId(c[0].value)
        })
    }, [])

    const load = useCallback(async () => {
        if (!companyId) return
        setLoading(true)
        try {
            const res = await planningService.listRequirements({
                companyId,
                warehouseId: warehouseId || undefined,
                limit: 200,
            })
            setRows(
                res.data.filter(
                    (r) =>
                        Number(r.safetyStock) > 0 ||
                        Number(r.availableQty) < Number(r.safetyStock),
                ),
            )
        } catch (e: any) {
            pushToast('danger', 'Error', e?.response?.data?.message || 'Load failed')
        } finally {
            setLoading(false)
        }
    }, [companyId, warehouseId])

    useEffect(() => {
        load()
    }, [load])

    const columns: ColumnDef<MaterialRequirement>[] = useMemo(
        () => [
            {
                header: 'Material',
                cell: ({ row }) => row.original.material?.materialCode ?? '—',
            },
            {
                header: 'Name',
                cell: ({ row }) => row.original.material?.materialName ?? '—',
            },
            {
                header: 'Warehouse',
                cell: ({ row }) => row.original.warehouse?.code ?? '—',
            },
            {
                header: 'Available',
                cell: ({ row }) => Number(row.original.availableQty),
            },
            {
                header: 'Safety stock',
                cell: ({ row }) => Number(row.original.safetyStock),
            },
            {
                header: 'Gap',
                cell: ({ row }) => {
                    const gap =
                        Number(row.original.safetyStock) -
                        Number(row.original.availableQty)
                    return gap > 0 ? gap : 0
                },
            },
            {
                header: 'Status',
                cell: ({ row }) =>
                    Number(row.original.availableQty) <
                    Number(row.original.safetyStock) ? (
                        <StatusBadge status="BELOW_SAFETY" />
                    ) : (
                        <StatusBadge status="OK" />
                    ),
            },
        ],
        [],
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Safety Stock"
                description="Available stock versus safety stock from the latest MRP snapshot"
            />
            <AdaptiveCard className="mb-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                warehouses.find((o) => o.value === warehouseId) ||
                                null
                            }
                            onChange={(o: any) => setWarehouseId(o?.value || '')}
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

export default SafetyStockPage
