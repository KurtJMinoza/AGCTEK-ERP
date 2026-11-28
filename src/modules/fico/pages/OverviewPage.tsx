'use client'

import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    FicoCompanySelect,
    useFicoCompanies,
} from '../components/FicoCompanySelect'
import FinanceOverviewWorkbench from '../components/overview/FinanceOverviewWorkbench'
import { FicoCompanyRequired } from '../components/workbench/FicoWorkbenchChrome'

const ROUTE = '/modules/fico/overview'

const OverviewPage = () => {
    const { companies, companyId, setCompanyId, loading } = useFicoCompanies()

    return (
        <PageContainer>
            <PageHeader
                title="Financial Overview"
                description="Company accounting health — master data counts, fiscal period posture, configuration warnings, and recent finance audit activity."
                breadcrumbs={buildErpBreadcrumbs(ROUTE)}
                actions={
                    <FicoCompanySelect
                        companies={companies}
                        value={companyId}
                        onChange={setCompanyId}
                        loading={loading}
                    />
                }
            />
            {companyId ? (
                <FinanceOverviewWorkbench key={companyId} companyId={companyId} />
            ) : (
                <FicoCompanyRequired message="Select a company to view the finance overview." />
            )}
        </PageContainer>
    )
}

export default OverviewPage