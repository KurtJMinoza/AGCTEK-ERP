'use client'

import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import StoOrderBoard from '../components/StoOrderBoard'

const ROUTE = '/modules/mm/warehouse-management/in-transit'

const STATUS_OPTS = [
    { value: '', label: 'All in-transit' },
    { value: 'DISPATCHED', label: 'Dispatched' },
    { value: 'IN_TRANSIT', label: 'In transit' },
    { value: 'PARTIALLY_RECEIVED', label: 'Partially received' },
]

const InTransitPage = () => (
    <PageContainer>
        <Breadcrumb items={buildErpBreadcrumbs(ROUTE)} />
        <PageHeader
            title="In Transit"
            description="Dispatched stock transfer shipments currently moving between warehouses."
        />
        <StoOrderBoard
            fixedStatuses={['DISPATCHED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED']}
            statusFilterOptions={STATUS_OPTS}
            allowedActions={['receive']}
            emptyMessage="No transfers currently in transit."
        />
    </PageContainer>
)

export default InTransitPage
