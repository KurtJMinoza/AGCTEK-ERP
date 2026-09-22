'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import Chart from '@/components/shared/Chart'
import Card from '@/components/ui/Card'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { FormItem } from '@/components/ui/Form'
import Tag from '@/components/ui/Tag'
import {
    useDeferredFilterRefs,
    useLazyMmRefs,
} from '@/modules/mm/shared/useLazyMmRefs'
import {
    analyticsService,
    type QualityAnalyticsResponse,
    type SupplierQualityMetricRow,
    type MaterialQualityMetricRow,
} from '@/modules/mm/analytics/services/analyticsService'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/reports-analytics/quality-analytics'

export default function QualityAnalyticsPage() {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const { companies, loadFilterRefs } = useDeferredFilterRefs('companies')
    const { ensure: ensureWarehouses, warehouses: allWarehouses } = useLazyMmRefs()

    const [companyId, setCompanyId] = useState('')
    const [warehouseId, setWarehouseId] = useState('')
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
    const [data, setData] = useState<QualityAnalyticsResponse | null>(null)
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

    const load = useCallback(async () => {
        if (!companyId) return
        setLoading(true)
        try {
            const result = await analyticsService.quality({
                companyId,
                ...(warehouseId ? { warehouseId } : {}),
                ...(dateFrom ? { dateFrom } : {}),
                ...(dateTo ? { dateTo } : {}),
            })
            setData(result)
        } finally {
            setLoading(false)
        }
    }, [companyId, warehouseId, dateFrom, dateTo])

    useEffect(() => {
        load()
    }, [load])

    const pct = (n: number) => `${(n * 100).toFixed(1)}%`

    const supplierCols: ColumnDef<SupplierQualityMetricRow>[] = useMemo(
        () => [
            { header: 'Supplier', accessorKey: 'supplierCode' },
            { header: 'Name', accessorKey: 'supplierName' },
            { header: 'Lots', accessorKey: 'lotsInspected' },
            {
                header: 'Accept %',
                accessorKey: 'acceptanceRate',
                cell: ({ row }) => pct(row.original.acceptanceRate),
            },
            {
                header: 'Reject %',
                accessorKey: 'rejectionRate',
                cell: ({ row }) => pct(row.original.rejectionRate),
            },
            { header: 'Defect Qty', accessorKey: 'defectQty' },
            { header: 'Open NC', accessorKey: 'openNcCount' },
        ],
        [],
    )

    const materialCols: ColumnDef<MaterialQualityMetricRow>[] = useMemo(
        () => [
            { header: 'Material', accessorKey: 'materialCode' },
            { header: 'Name', accessorKey: 'materialName' },
            { header: 'Lots', accessorKey: 'lotsInspected' },
            {
                header: 'Accept %',
                accessorKey: 'acceptanceRate',
                cell: ({ row }) => pct(row.original.acceptanceRate),
            },
            {
                header: 'Reject %',
                accessorKey: 'rejectionRate',
                cell: ({ row }) => pct(row.original.rejectionRate),
            },
            { header: 'Defect Qty', accessorKey: 'defectQty' },
        ],
        [],
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Quality Analytics"
                description="Read-only quality metrics from inspection, defect, hold, and NC records."
                actions={
                    <Button loading={loading} onClick={load}>
                        Refresh
                    </Button>
                }
            />

            {/* Filters */}
            <AdaptiveCard className="mb-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                    <FormItem label="From">
                        <Input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                        />
                    </FormItem>
                    <FormItem label="To">
                        <Input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                        />
                    </FormItem>
                </div>
            </AdaptiveCard>

            {data && (
                <div className="space-y-6">
                    {/* Summary stats */}
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <Card className="p-4">
                            <div className="text-sm text-gray-500">Inspection Lots</div>
                            <div className="text-2xl font-semibold">
                                {data.qualityInspection.lotCount}
                            </div>
                            <div className="text-xs text-gray-400">
                                {data.qualityInspection.pending} pending
                            </div>
                        </Card>
                        <Card className="p-4">
                            <div className="text-sm text-gray-500">Acceptance Rate</div>
                            <div className="text-2xl font-semibold">
                                {pct(data.qualityInspection.acceptanceRate)}
                            </div>
                        </Card>
                        <Card className="p-4">
                            <div className="text-sm text-gray-500">Active Holds</div>
                            <div className="text-2xl font-semibold">
                                {data.qualityHoldAging.activeCount}
                            </div>
                            <div className="text-xs text-gray-400">
                                avg {data.qualityHoldAging.avgHoldDurationHours}h duration
                            </div>
                        </Card>
                        <Card className="p-4">
                            <div className="text-sm text-gray-500">Open Nonconformances</div>
                            <div className="text-2xl font-semibold">
                                {data.nonconformanceMetric.openCount}
                            </div>
                            <div className="text-xs text-gray-400">
                                {data.nonconformanceMetric.openCapaCount} open CAPA
                            </div>
                        </Card>
                    </div>

                    {/* Inspection turnaround */}
                    <AdaptiveCard>
                        <h6 className="mb-2 font-semibold">Inspection Turnaround</h6>
                        <div className="grid gap-4 sm:grid-cols-3 text-sm">
                            <div>
                                Avg: <strong>{data.inspectionTurnaround.avgHours}h</strong>
                            </div>
                            <div>
                                Median: <strong>{data.inspectionTurnaround.medianHours}h</strong>
                            </div>
                            <div>
                                P90: <strong>{data.inspectionTurnaround.p90Hours}h</strong>
                            </div>
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                            Sample size: {data.inspectionTurnaround.sampleSize} lots
                        </div>
                    </AdaptiveCard>

                    {/* Hold aging buckets */}
                    <AdaptiveCard>
                        <h6 className="mb-2 font-semibold">Quality Hold Aging</h6>
                        <div className="flex gap-4 flex-wrap">
                            {Object.entries(data.qualityHoldAging.buckets).map(
                                ([bucket, count]) => (
                                    <Tag key={bucket}>
                                        {bucket}: {count}
                                    </Tag>
                                ),
                            )}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                            Released: {data.qualityHoldAging.releasedCount}
                        </div>
                    </AdaptiveCard>

                    {/* Defect trend chart */}
                    {(data.defectTrend.buckets?.length ?? 0) > 0 && (
                        <AdaptiveCard>
                            <h6 className="mb-2 font-semibold">Defect Trend (weekly)</h6>
                            <Chart
                                type="line"
                                series={[
                                    {
                                        name: 'Defects',
                                        data: data.defectTrend.buckets.map((b) => b.total),
                                    },
                                ]}
                                xAxis={data.defectTrend.buckets.map((b) => b.week)}
                                height={280}
                            />
                            {(data.defectTrend.topDefects?.length ?? 0) > 0 && (
                                <div className="mt-4">
                                    <h6 className="text-sm font-semibold mb-1">Top Defects</h6>
                                    <div className="flex gap-2 flex-wrap">
                                        {data.defectTrend.topDefects.map((d) => (
                                            <Tag key={d.code}>
                                                {d.code}: {d.count}
                                            </Tag>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </AdaptiveCard>
                    )}

                    {/* NC metric */}
                    <AdaptiveCard>
                        <h6 className="mb-2 font-semibold">Nonconformance Metrics</h6>
                        <div className="grid gap-4 sm:grid-cols-3 text-sm">
                            <div>
                                Total: <strong>{data.nonconformanceMetric.total}</strong>
                            </div>
                            <div>
                                Avg resolution:{' '}
                                <strong>{data.nonconformanceMetric.avgResolutionDays} days</strong>
                            </div>
                            <div>
                                Open CAPA:{' '}
                                <strong>{data.nonconformanceMetric.openCapaCount}</strong>
                            </div>
                        </div>
                        {Object.keys(data.nonconformanceMetric.byStatus).length > 0 && (
                            <div className="mt-2 flex gap-2 flex-wrap">
                                {Object.entries(data.nonconformanceMetric.byStatus).map(
                                    ([status, count]) => (
                                        <Tag key={status}>
                                            {status}: {count}
                                        </Tag>
                                    ),
                                )}
                            </div>
                        )}
                    </AdaptiveCard>

                    {/* Supplier quality table */}
                    <AdaptiveCard>
                        <h6 className="mb-2 font-semibold">Supplier Quality</h6>
                        <DataTable
                            columns={supplierCols}
                            data={data.supplierQualityMetric ?? []}
                        />
                    </AdaptiveCard>

                    {/* Material quality table */}
                    <AdaptiveCard>
                        <h6 className="mb-2 font-semibold">Material Quality</h6>
                        <DataTable
                            columns={materialCols}
                            data={data.materialQualityMetric ?? []}
                        />
                    </AdaptiveCard>
                </div>
            )}
        </PageContainer>
    )
}
