'use client'

import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import WarehouseTaskTable from '../components/WarehouseTaskTable'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/warehouse-management/task-queue'

const TaskQueuePage = () => (
    <PageContainer>
        <Breadcrumb items={buildErpBreadcrumbs(ROUTE)} />
        <PageHeader
            title="Task Queue"
            description="All open warehouse execution tasks across putaway, picking, transfer, and count workflows."
        />
        <WarehouseTaskTable mode="queue" />
    </PageContainer>
)

export default TaskQueuePage
