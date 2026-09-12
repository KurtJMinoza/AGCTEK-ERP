'use client'

import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import StoOrderBoard from '../components/StoOrderBoard'

const ROUTE = '/modules/mm/warehouse-management/transfer-history'

const STATUS_OPTS = [
    { value: '', label: 'Closed & cancelled' },
    { value: 'CLOSED', label: 'Closed' },
    { value: 'CANCELLED', label: 'Cancelled' },
    { value: 'FULLY_RECEIVED', label: 'Fully received' },
]

const TransferHistoryPage = () => (
    <PageContainer>
        <Breadcrumb items={buildErpBreadcrumbs(ROUTE)} />
        <PageHeader
            title="Transfer History"
            description="Closed and cancelled stock transfer orders for audit and review."
        />
        <StoOrderBoard
            fixedStatuses={['CLOSED', 'CANCELLED', 'FULLY_RECEIVED']}
            statusFilterOptions={STATUS_OPTS}
            allowedActions={[]}
            showSummary={false}
            emptyMessage="No historical transfer orders yet."
        />
    </PageContainer>
)

export default TransferHistoryPage
