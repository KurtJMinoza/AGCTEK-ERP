'use client'

import { AnalyticsReportPage } from './AnalyticsReportShell'
import InventoryTurnoverContent from '../components/InventoryTurnoverContent'

const InventoryTurnoverPage = () => (
    <AnalyticsReportPage
        route="/modules/mm/reports-analytics/inventory-turnover"
        title="Inventory Turnover"
        description="Issue quantity divided by average on-hand for the selected period"
        reportEndpoint="turnover"
        showDateRange
        render={(data, ctx) => (
            <InventoryTurnoverContent data={data} loading={ctx?.loading ?? false} />
        )}
    />
)

export default InventoryTurnoverPage
