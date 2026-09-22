'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable from '@/components/shared/DataTable'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import { FormItem } from '@/components/ui/Form'
import { useDeferredFilterRefs, useLazyMmRefs } from '@/modules/mm/shared/useLazyMmRefs'
import { reportsAnalyticsService } from '../services/reportsAnalyticsService'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/reports-analytics/inventory-valuation-reports'

type Opt = { value: string; label: string }

const InventoryValuationReportsPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const { companies, loadFilterRefs } = useDeferredFilterRefs('companies')
    const { ensure: ensureWarehouses, warehouses: allWarehouses } = useLazyMmRefs()
    const [companyId, setCompanyId] = useState('')
    const [warehouseId, setWarehouseId] = useState('')
    const [data, setData] = useState<any>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        const t = window.setTimeout(() => loadFilterRefs(), 0)
        return () => window.clearTimeout(t)
    }, [loadFilterRefs])

    useEffect(() => {
        if (!companyId && companies[0]) setCompanyId(companies[0].value)
    }, [companies, companyId])

    useEffect(() => {
        if (!companyId) return
        void ensureWarehouses('warehouses')
    }, [companyId, ensureWarehouses])

    const warehouses = useMemo(
        () =>
            allWarehouses.filter((w) => {
                const company = (w.meta as { companyId?: string } | undefined)?.companyId
                return !companyId || !company || company === companyId
            }),
        [allWarehouses, companyId],
    )

    const params = useMemo(
        () => ({
            companyId,
            ...(warehouseId ? { warehouseId } : {}),
            limit: 100,
        }),
        [companyId, warehouseId],
    )

    const load = useCallback(async () => {
        if (!companyId) return
        setLoading(true)
        try {
            setData(await reportsAnalyticsService.inventoryValuation(params))
        } finally {
            setLoading(false)
        }
    }, [companyId, params])

    useEffect(() => {
        load()
    }, [load])

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Inventory Valuation"
                description="Read-only inventory value by material and warehouse"
                actions={
                    <Button loading={loading} onClick={load}>
                        Refresh
                    </Button>
                }
            />
            <AdaptiveCard className="mb-4">
                <div className="grid gap-4 sm:grid-cols-2 max-w-xl">
                    <FormItem label="Company">
                        <Select
                            options={companies}
                            value={companies.find((o) => o.value === companyId)}
                            onChange={(o: any) => {
                                setCompanyId(o?.value ?? '')
                                setWarehouseId('')
                            }}
                        />
                    </FormItem>
                    <FormItem label="Warehouse">
                        <Select
                            isClearable
                            placeholder="All warehouses"
                            options={warehouses}
                            value={
                                warehouseId
                                    ? warehouses.find((o) => o.value === warehouseId)
                                    : null
                            }
                            onChange={(o: any) => setWarehouseId(o?.value ?? '')}
                        />
                    </FormItem>
                </div>
            </AdaptiveCard>
            {data?.totals && (
                <p className="mb-4 text-sm text-gray-600">
                    Total inventory value:{' '}
                    <strong>{Number(data.totals.inventoryValue).toLocaleString()}</strong>
                    {data.readOnly && ' (read-only)'}
                </p>
            )}
            <AdaptiveCard>
                <DataTable
                    columns={[
                        { header: 'Warehouse', accessorKey: 'warehouseName' },
                        { header: 'Material', accessorKey: 'materialCode' },
                        { header: 'Name', accessorKey: 'materialName' },
                        { header: 'Qty', accessorKey: 'quantity' },
                        { header: 'Unit cost', accessorKey: 'unitCost' },
                        { header: 'Value', accessorKey: 'inventoryValue' },
                        { header: 'Method', accessorKey: 'valuationMethod' },
                    ]}
                    data={data?.data ?? []}
                />
            </AdaptiveCard>
        </PageContainer>
    )
}

export default InventoryValuationReportsPage
