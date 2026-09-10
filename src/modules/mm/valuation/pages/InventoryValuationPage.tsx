'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { valuationService } from '../services/valuationService'
import { warehouseService } from '../../warehouse/services/warehouseService'
import { orgService } from '../../material-master/services/referenceService'
import type { InventoryValueRow } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/valuation/inventory-valuation'
type Opt = { value: string; label: string }

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const InventoryValuationPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [rows, setRows] = useState<InventoryValueRow[]>([])
    const [loading, setLoading] = useState(false)
    const [companies, setCompanies] = useState<Opt[]>([])
    const [warehouses, setWarehouses] = useState<Opt[]>([])
    const [companyId, setCompanyId] = useState('')
    const [warehouseId, setWarehouseId] = useState('')

    useEffect(() => {
        Promise.all([
            orgService.companies(),
            warehouseService.list({ limit: 200 }),
        ])
            .then(([cos, wh]: any[]) => {
                const c = (Array.isArray(cos) ? cos : cos?.data ?? []).map(
                    (x: any) => ({
                        value: x.id,
                        label: x.name || x.code,
                    }),
                )
                const w = (wh?.data ?? []).map((x: any) => ({
                    value: x.id,
                    label: `${x.code} — ${x.name}`,
                }))
                setCompanies(c)
                setWarehouses(w)
                if (c[0]) setCompanyId(c[0].value)
            })
            .catch(() => pushToast('danger', 'Error', 'Failed to load filters'))
    }, [])

    const load = useCallback(async () => {
        if (!companyId) return
        setLoading(true)
        try {
            const res = await valuationService.getInventoryValue({
                companyId,
                warehouseId: warehouseId || undefined,
            })
            setRows(res.data)
        } catch (e: any) {
            pushToast('danger', 'Error', e?.response?.data?.message || 'Load failed')
        } finally {
            setLoading(false)
        }
    }, [companyId, warehouseId])

    useEffect(() => {
        load()
    }, [load])

    const columns: ColumnDef<InventoryValueRow>[] = useMemo(
        () => [
            { header: 'Material', accessorKey: 'materialCode' },
            { header: 'Name', accessorKey: 'materialName' },
            { header: 'Warehouse', accessorKey: 'warehouseName' },
            { header: 'Qty', accessorKey: 'quantity' },
            { header: 'Unit Cost', accessorKey: 'unitCost' },
            { header: 'Value', accessorKey: 'inventoryValue' },
            { header: 'Method', accessorKey: 'valuationMethod' },
        ],
        [],
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Inventory Valuation"
                description="Quantity × applicable cost by material and warehouse"
                
            />
            <AdaptiveCard className="mb-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
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
                            value={warehouses.find((o) => o.value === warehouseId) || null}
                            onChange={(o: any) => setWarehouseId(o?.value || '')}
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

export default InventoryValuationPage
