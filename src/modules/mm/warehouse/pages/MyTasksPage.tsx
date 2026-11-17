'use client'

import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import WarehouseTaskTable from '../components/WarehouseTaskTable'
import { warehouseParentBreadcrumbs } from '../utils/warehousePageUi'
const ROUTE = '/modules/mm/warehouse-management/my-tasks'

const MyTasksPage = () => (
    <PageContainer>
        <PageHeader
            breadcrumbs={warehouseParentBreadcrumbs(ROUTE)}
            title="My Tasks"
            description="Tasks assigned to you — start, complete, or report exceptions from the floor."
        />
        <WarehouseTaskTable mode="my" />
    </PageContainer>
)

export default MyTasksPage
