'use client'

import { AnalyticsReportPage, DataTable } from './AnalyticsReportShell'

const StockReportsPage = () => (
    <AnalyticsReportPage
        route="/modules/mm/reports-analytics/stock-reports"
        title="Stock Reports"
        description="On-hand balances by material, warehouse, bin, batch, serial, and status"
        reportEndpoint="stock"
        extraParams={{ groupBy: 'material', limit: 100 }}
        render={(data) => (
            <>
                {data?.totals && (
                    <p className="mb-4 text-sm text-gray-600">
                        Total quantity: <strong>{Number(data.totals.quantity).toLocaleString()}</strong>
                        {' · '}
                        Rows: {data.meta?.total ?? 0}
                    </p>
                )}
                <DataTable
                    columns={[
                        { header: 'Material', accessorKey: 'label' },
                        { header: 'Quantity', accessorKey: 'quantity' },
                    ]}
                    data={data?.data ?? []}
                />
            </>
        )}
    />
)

export default StockReportsPage
