'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import ValuationResponsiveTable, {
    type ColumnDef,
} from '../components/ValuationResponsiveTable'
import {
    ValMaterialCell,
    ValMethodTag,
    ValMoneyCell,
    ValPlainCell,
    ValQtyCell,
} from '../components/valuationTableUi'
import { valuationParentBreadcrumbs } from '../utils/valuationPageUi'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { valuationService } from '../services/valuationService'
import { useDeferredFilterRefs } from '@/modules/mm/shared/useLazyMmRefs'
import type { InventoryValueRow } from '../types'

const ROUTE = '/modules/mm/valuation/inventory-valuation'

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const InventoryValuationPage = () => {
    const parentBreadcrumbs = valuationParentBreadcrumbs(ROUTE)
    const [rows, setRows] = useState<InventoryValueRow[]>([])
    const [loading, setLoading] = useState(false)
    const { companies, warehouses, loadFilterRefs } = useDeferredFilterRefs('companies', 'warehouses')
    const [companyId, setCompanyId] = useState('')
    const [warehouseId, setWarehouseId] = useState('')

    useEffect(() => {
        if (!companyId && companies[0]) setCompanyId(companies[0].value)
    }, [companyId, companies])

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
        const t = window.setTimeout(() => loadFilterRefs(), 0)
        return () => window.clearTimeout(t)
    }, [load, loadFilterRefs])

    const columns: ColumnDef<InventoryValueRow>[] = useMemo(
        () => [
            {
                header: 'Material',
                cell: ({ row }) => (
                    <ValMaterialCell
                        code={row.original.materialCode}
                        name={row.original.materialName}
                    />
                ),
            },
            {
                header: 'Warehouse',
                cell: ({ row }) => (
                    <ValPlainCell>{row.original.warehouseName}</ValPlainCell>
                ),
            },
            {
                header: 'Qty',
                cell: ({ row }) => <ValQtyCell value={row.original.quantity} />,
            },
            {
                header: 'Unit cost',
                cell: ({ row }) => <ValMoneyCell amount={row.original.unitCost} />,
            },
            {
                header: 'Value',
                cell: ({ row }) => (
                    <ValMoneyCell amount={row.original.inventoryValue} emphasize="positive" />
                ),
            },
            {
                header: 'Method',
                cell: ({ row }) => (
                    <ValMethodTag method={row.original.valuationMethod} />
                ),
            },
        ],
        [],
    )

    return (
        <PageContainer>
            <PageHeader
                title="Inventory Valuation"
                description="Quantity × applicable cost by material and warehouse"
                breadcrumbs={parentBreadcrumbs}
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
                <ValuationResponsiveTable
                    columns={columns}
                    data={rows}
                    loading={loading}
                    getRowId={(row, index) =>
                        `${row.materialId}-${row.warehouseId}-${row.batchId ?? 'none'}-${index}`
                    }
                    tableMinWidthClass="min-w-[960px]"
                />
            </AdaptiveCard>
        </PageContainer>
    )
}

export default InventoryValuationPage
