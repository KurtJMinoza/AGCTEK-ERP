'use client'

import { AnalyticsReportPage, Chart, DataTable } from './AnalyticsReportShell'

const StockAgingPage = () => (
    <AnalyticsReportPage
        route="/modules/mm/reports-analytics/stock-aging"
        title="Stock Aging"
        description="On-hand stock grouped by days since last inbound movement"
        reportEndpoint="aging"
        showAgingBuckets
        render={(data) => (
            <>
                {data?.definition && (
                    <p className="mb-4 text-sm text-gray-500">{data.definition}</p>
                )}
                {(data?.buckets?.length ?? 0) > 0 && (
                    <Chart
                        type="bar"
                        series={[
                            {
                                name: 'Quantity',
                                data: data.buckets.map((b: any) => Number(b.quantity)),
                            },
                        ]}
                        xAxis={data.buckets.map((b: any) => b.name)}
                        height={300}
                    />
                )}
                <DataTable
                    className="mt-4"
                    columns={[
                        { header: 'Bucket', accessorKey: 'name' },
                        { header: 'Materials', accessorKey: 'count' },
                        { header: 'Quantity', accessorKey: 'quantity' },
                    ]}
                    data={data?.buckets ?? []}
                />
            </>
        )}
    />
)

export default StockAgingPage
