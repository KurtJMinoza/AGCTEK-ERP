'use client'

import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    FicoCompanySelect,
    useFicoCompanies,
} from '../components/FicoCompanySelect'
import AccountingEventsPanel from '../components/AccountingEventsPanel'

const ROUTE = '/modules/fico/accounting-events'

const AccountingEventsPage = () => {
    const {
        companies,
        companyId,
        setCompanyId,
        loading: companyLoading,
    } = useFicoCompanies()

    return (
        <PageContainer>
            <PageHeader
                title="Accounting Events"
                description="Monitor operational postings from MM, SD, POS, and PP into FICO — pending, posted, and failed events."
                breadcrumbs={buildErpBreadcrumbs(ROUTE)}
                actions={
                    <FicoCompanySelect
                        companies={companies}
                        value={companyId}
                        onChange={setCompanyId}
                        loading={companyLoading}
                    />
                }
            />
            <AccountingEventsPanel key={companyId} companyId={companyId} />
        </PageContainer>
    )
}

export default AccountingEventsPage