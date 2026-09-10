'use client'

import { AnalyticsReportPage, DataTable } from './AnalyticsReportShell'

const DeadStockPage = () => (
    <AnalyticsReportPage
        route="/modules/mm/reports-analytics/dead-stock"
        title="Dead Stock"
        description="Materials with on-hand quantity and no outbound movement in the configured window"
        reportEndpoint="dead-stock"
        showDeadStockDays
        render={(data) => (
            <DataTable
                columns={[
                    { header: 'Code', accessorKey: 'materialCode' },
                    { header: 'Name', accessorKey: 'materialName' },
                    { header: 'Quantity', accessorKey: 'quantity' },
                    { header: 'Days idle', accessorKey: 'daysWithoutMovement' },
                ]}
                data={data?.rows ?? []}
            />
        )}
    />
)

export default DeadStockPage
