'use client'

import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import WarehouseTaskTable from '../components/WarehouseTaskTable'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/warehouse-management/exceptions'

const ExceptionsPage = () => (
    <PageContainer>
        <Breadcrumb items={buildErpBreadcrumbs(ROUTE)} />
        <PageHeader
            title="Task Exceptions"
            description="Tasks in exception status — review, resolve, and release back to execution."
        />
        <WarehouseTaskTable mode="exceptions" />
    </PageContainer>
)

export default ExceptionsPage
