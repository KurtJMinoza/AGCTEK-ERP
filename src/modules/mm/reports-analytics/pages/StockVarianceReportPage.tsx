'use client'

import Link from 'next/link'
import Button from '@/components/ui/Button'
import { AnalyticsReportPage, DataTable } from './AnalyticsReportShell'

const StockVarianceReportPage = () => (
    <AnalyticsReportPage
        route="/modules/mm/reports-analytics/stock-variance"
        title="Stock Variance"
        description="Cycle count variances (read-only). Adjust from Inventory Control."
        reportEndpoint="stock-variance"
        render={(data) => (
            <>
                {data?.totals && (
                    <p className="mb-4 text-sm text-gray-600">
                        Variance qty: {Number(data.totals.varianceQuantity).toLocaleString()}
                        {' · '}
                        Value: {Number(data.totals.varianceValue).toLocaleString()}
                    </p>
                )}
                <div className="mb-4">
                    <Link href="/modules/mm/inventory-control/inventory-counts">
                        <Button size="sm">Open Inventory Control</Button>
                    </Link>
                </div>
                <DataTable
                    columns={[
                        { header: 'Count #', accessorKey: 'countNumber' },
                        { header: 'Warehouse', accessorKey: 'warehouseName' },
                        { header: 'Material', accessorKey: 'materialCode' },
                        { header: 'System', accessorKey: 'systemQuantity' },
                        { header: 'Counted', accessorKey: 'countedQuantity' },
                        { header: 'Variance', accessorKey: 'varianceQuantity' },
                        { header: 'Value', accessorKey: 'varianceValue' },
                        { header: 'Status', accessorKey: 'status' },
                    ]}
                    data={data?.data ?? []}
                />
            </>
        )}
    />
)

export default StockVarianceReportPage
