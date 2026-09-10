'use client'

import { AnalyticsReportPage, Chart, DataTable } from './AnalyticsReportShell'

const SupplierPerformanceReportsPage = () => (
    <AnalyticsReportPage
        route="/modules/mm/reports-analytics/supplier-performance-reports"
        title="Supplier Performance"
        description="Supplier score rankings and trends (read-only)"
        reportEndpoint="supplier-performance"
        showDateRange
        showWarehouse={false}
        render={(data) => (
            <div className="space-y-6">
                {data?.summary && (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                        <div>Evaluated: {data.summary.suppliersEvaluated}</div>
                        <div>Avg overall: {Number(data.summary.avgOverallScore).toFixed(1)}</div>
                        <div>Avg delivery: {Number(data.summary.avgDelivery).toFixed(1)}</div>
                        <div>Open alerts: {data.summary.openAlerts}</div>
                    </div>
                )}
                {(data?.trend?.length ?? 0) > 0 && (
                    <Chart
                        type="line"
                        series={[
                            {
                                name: 'Overall score',
                                data: data.trend.map((t: any) => Number(t.overallScore)),
                            },
                        ]}
                        xAxis={data.trend.map((t: any) =>
                            new Date(t.periodEnd).toLocaleDateString(),
                        )}
                        height={280}
                    />
                )}
                <DataTable
                    columns={[
                        {
                            header: 'Supplier',
                            accessorKey: 'supplier.supplierName',
                            cell: ({ row }: any) =>
                                row.original.supplier?.supplierName ?? '—',
                        },
                        {
                            header: 'Code',
                            accessorKey: 'supplier.supplierCode',
                            cell: ({ row }: any) =>
                                row.original.supplier?.supplierCode ?? '—',
                        },
                        { header: 'Overall', accessorKey: 'overallScore' },
                        { header: 'Delivery', accessorKey: 'deliveryScore' },
                        { header: 'Quality', accessorKey: 'qualityScore' },
                        { header: 'Volume', accessorKey: 'purchaseVolume' },
                    ]}
                    data={data?.rankings ?? []}
                />
            </div>
        )}
    />
)

export default SupplierPerformanceReportsPage
