'use client'

import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import StoOrderBoard from '../components/StoOrderBoard'

const ROUTE = '/modules/mm/warehouse-management/transfer-receipts'

const STATUS_OPTS = [
    { value: '', label: 'All receivable' },
    { value: 'DISPATCHED', label: 'Dispatched' },
    { value: 'IN_TRANSIT', label: 'In transit' },
    { value: 'PARTIALLY_RECEIVED', label: 'Partially received' },
]

const TransferReceiptsPage = () => (
    <PageContainer>
        <Breadcrumb items={buildErpBreadcrumbs(ROUTE)} />
        <PageHeader
            title="Transfer Receipts"
            description="Receive in-transit stock at the destination warehouse and post unrestricted inventory."
        />
        <StoOrderBoard
            fixedStatuses={['DISPATCHED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED']}
            statusFilterOptions={STATUS_OPTS}
            allowedActions={['receive']}
            emptyMessage="No transfer receipts waiting."
        />
    </PageContainer>
)

export default TransferReceiptsPage
