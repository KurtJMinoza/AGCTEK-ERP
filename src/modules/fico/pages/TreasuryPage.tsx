'use client'

import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    FicoCompanySelect,
    useFicoCompanies,
} from '../components/FicoCompanySelect'
import TreasuryWorkbench from '../components/treasury/TreasuryWorkbench'
import { FicoCompanyRequired } from '../components/workbench/FicoWorkbenchChrome'

const ROUTE = '/modules/fico/treasury'

const TreasuryPage = () => {
    const { companies, companyId, setCompanyId, loading: companyLoading } =
        useFicoCompanies()

    return (
        <PageContainer>
            <PageHeader
                title="Cash & bank"
                description="Treasury master data, settlement journals, and payment account resolution."
                breadcrumbs={buildErpBreadcrumbs(ROUTE)}
                actions={
                    <FicoCompanySelect
                        companies={companies}
                        value={companyId}
                        onChange={setCompanyId}
                        loading={companyLoading}
                        allowAll={false}
                    />
                }
            />
            {companyId ? (
                <TreasuryWorkbench companyId={companyId} />
            ) : (
                <FicoCompanyRequired />
            )}
        </PageContainer>
    )
}

export default TreasuryPage