'use client'

import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import WarehouseTaskTable from '../components/WarehouseTaskTable'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/warehouse-management/my-tasks'

const MyTasksPage = () => (
    <PageContainer>
        <Breadcrumb items={buildErpBreadcrumbs(ROUTE)} />
        <PageHeader
            title="My Tasks"
            description="Tasks assigned to you — start, complete, or report exceptions from the floor."
        />
        <WarehouseTaskTable mode="my" />
    </PageContainer>
)

export default MyTasksPage
