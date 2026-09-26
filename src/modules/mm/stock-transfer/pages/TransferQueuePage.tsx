'use client'

import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import StoOrderBoard from '../components/StoOrderBoard'

const ROUTE = '/modules/mm/warehouse-management/transfer-queue'

const STATUS_OPTS = [
    { value: '', label: 'All queue statuses' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'ALLOCATED', label: 'Allocated' },
    { value: 'PICKING', label: 'Picking' },
]

const TransferQueuePage = () => (
    <PageContainer>
        <Breadcrumb items={buildErpBreadcrumbs(ROUTE)} />
        <PageHeader
            title="Transfer Queue"
            description="Approved and allocated stock transfers awaiting pick or dispatch."
        />
        <StoOrderBoard
            fixedStatuses={['APPROVED', 'ALLOCATED', 'PICKING']}
            statusFilterOptions={STATUS_OPTS}
            allowedActions={['allocate', 'dispatch', 'cancel']}
            emptyMessage="No transfers waiting in queue."
        />
    </PageContainer>
)

export default TransferQueuePage
