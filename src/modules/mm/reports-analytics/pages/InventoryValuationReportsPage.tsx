'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import StatCard from '@/components/shared/StatCard'
import ValuationResponsiveTable, {
    type ColumnDef,
} from '@/modules/mm/valuation/components/ValuationResponsiveTable'
import {
    ValDocNumberCell,
    ValMaterialCell,
    ValMethodTag,
    ValMoneyCell,
    ValPlainCell,
    ValQtyCell,
} from '@/modules/mm/valuation/components/valuationTableUi'
import { reportsAnalyticsParentBreadcrumbs } from '../utils/reportsAnalyticsPageUi'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import { FormItem } from '@/components/ui/Form'
import { HiOutlineCalculator, HiOutlineRefresh } from 'react-icons/hi'
import { useDeferredFilterRefs, useLazyMmRefs } from '@/modules/mm/shared/useLazyMmRefs'
import { reportsAnalyticsService } from '../services/reportsAnalyticsService'
import type { InventoryValueRow } from '@/modules/mm/valuation/types'

const ROUTE = '/modules/mm/reports-analytics/inventory-valuation-reports'

type ValuationReportPayload = {
    data?: InventoryValueRow[]
    totals?: { inventoryValue?: number | string }
    readOnly?: boolean
}

const InventoryValuationReportsPage = () => {
    const parentBreadcrumbs = useMemo(
        () => reportsAnalyticsParentBreadcrumbs(ROUTE),
        [],
    )
    const { companies, loadFilterRefs } = useDeferredFilterRefs('companies')
    const { ensure: ensureWarehouses, warehouses: allWarehouses } = useLazyMmRefs()
    const [companyId, setCompanyId] = useState('')
    const [warehouseId, setWarehouseId] = useState('')
    const [payload, setPayload] = useState<ValuationReportPayload | null>(null)
    const [loading, setLoading] = useState(false)

    const rows = payload?.data ?? []

    useEffect(() => {
        const t = window.setTimeout(() => loadFilterRefs(), 0)
        return () => window.clearTimeout(t)
    }, [loadFilterRefs])

    useEffect(() => {
        if (!companyId && companies[0]) setCompanyId(companies[0].value)
    }, [companyId, companies])

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
            setPayload(await reportsAnalyticsService.inventoryValuation(params))
        } finally {
            setLoading(false)
        }
    }, [companyId, params])

    useEffect(() => {
        load()
    }, [load])

    const totalValue = useMemo(() => {
        const t = payload?.totals?.inventoryValue
        if (t != null && t !== '') return Number(t)
        return rows.reduce((sum, r) => sum + (Number(r.inventoryValue) || 0), 0)
    }, [payload?.totals?.inventoryValue, rows])

    const columns: ColumnDef<InventoryValueRow>[] = useMemo(
        () => [
            {
                header: 'Material',
                meta: { className: 'min-w-[200px]' },
                cell: ({ row }) => (
                    <ValMaterialCell
                        code={row.original.materialCode}
                        name={row.original.materialName}
                    />
                ),
            },
            {
                header: 'Warehouse',
                meta: { className: 'min-w-[140px]' },
                cell: ({ row }) => (
                    <ValDocNumberCell
                        icon="layer"
                        primary={row.original.warehouseName || '—'}
                        secondary={row.original.warehouseId?.slice(0, 8)}
                    />
                ),
            },
            {
                header: 'Qty',
                meta: { className: 'text-right min-w-[88px]' },
                cell: ({ row }) => <ValQtyCell value={row.original.quantity} />,
            },
            {
                header: 'Unit cost',
                meta: { className: 'text-right min-w-[100px]' },
                cell: ({ row }) => <ValMoneyCell amount={row.original.unitCost} />,
            },
            {
                header: 'Inventory value',
                meta: { className: 'text-right min-w-[120px]' },
                cell: ({ row }) => (
                    <ValMoneyCell
                        amount={row.original.inventoryValue}
                        emphasize="positive"
                    />
                ),
            },
            {
                header: 'Method',
                meta: { className: 'min-w-[100px]' },
                cell: ({ row }) => (
                    <ValMethodTag method={row.original.valuationMethod} />
                ),
            },
            {
                header: 'Batch',
                meta: { className: 'min-w-[88px]' },
                cell: ({ row }) => (
                    <ValPlainCell mono muted>
                        {row.original.batchId ? row.original.batchId.slice(0, 8) : '—'}
                    </ValPlainCell>
                ),
            },
        ],
        [],
    )

    return (
        <PageContainer>
            <PageHeader
                breadcrumbs={parentBreadcrumbs}
                title="Inventory Valuation"
                description="Read-only inventory value by material and warehouse (analytics report)."
                icon={<HiOutlineCalculator />}
                actions={
                    <Button
                        variant="solid"
                        icon={<HiOutlineRefresh />}
                        loading={loading}
                        onClick={load}
                    >
                        Refresh
                    </Button>
                }
            />

            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <StatCard
                    label="Total inventory value"
                    value={totalValue.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                    })}
                    tone="success"
                />
                <StatCard label="Lines" value={rows.length} />
                <StatCard
                    label="Scope"
                    value={warehouseId ? 'Single warehouse' : 'All warehouses'}
                />
            </div>

            <AdaptiveCard className="mb-4">
                <div className="grid max-w-xl gap-4 sm:grid-cols-2">
                    <FormItem label="Company">
                        <Select
                            options={companies}
                            value={companies.find((o) => o.value === companyId)}
                            onChange={(o: { value?: string } | null) => {
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
                            onChange={(o: { value?: string } | null) =>
                                setWarehouseId(o?.value ?? '')
                            }
                        />
                    </FormItem>
                </div>
                {payload?.readOnly ? (
                    <p className="mt-3 text-xs text-gray-500">
                        Report data is read-only and sourced from the valuation engine.
                    </p>
                ) : null}
            </AdaptiveCard>

            <AdaptiveCard>
                <ValuationResponsiveTable
                    columns={columns}
                    data={rows}
                    loading={loading}
                    getRowId={(row, index) =>
                        `${row.materialId}-${row.warehouseId}-${row.batchId ?? 'none'}-${index}`
                    }
                    tableMinWidthClass="min-w-[1024px]"
                    mobile={{
                        title: (row) => row.materialName || row.materialCode,
                        subtitle: (row) => row.warehouseName,
                        metrics: (row) => [
                            { label: 'Qty', value: Number(row.quantity).toLocaleString() },
                            {
                                label: 'Value',
                                value: Number(row.inventoryValue).toLocaleString(),
                            },
                            { label: 'Method', value: row.valuationMethod.replace(/_/g, ' ') },
                        ],
                    }}
                />
            </AdaptiveCard>
        </PageContainer>
    )
}

export default InventoryValuationReportsPage
