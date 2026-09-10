'use client'

import { AnalyticsReportPage, DataTable } from './AnalyticsReportShell'

const InventoryTurnoverPage = () => (
    <AnalyticsReportPage
        route="/modules/mm/reports-analytics/inventory-turnover"
        title="Inventory Turnover"
        description="Issue quantity divided by average on-hand for the selected period"
        reportEndpoint="turnover"
        showDateRange
        render={(data) => (
            <>
                {data?.definition && (
                    <p className="mb-4 text-sm text-gray-500">{data.definition}</p>
                )}
                <DataTable
                    columns={[
                        { header: 'Code', accessorKey: 'materialCode' },
                        { header: 'Name', accessorKey: 'materialName' },
                        { header: 'Issue qty', accessorKey: 'issueQty' },
                        { header: 'Avg on-hand', accessorKey: 'averageOnHand' },
                        { header: 'Turnover', accessorKey: 'turnover' },
                    ]}
                    data={data?.rows ?? []}
                />
            </>
        )}
    />
)

export default InventoryTurnoverPage
