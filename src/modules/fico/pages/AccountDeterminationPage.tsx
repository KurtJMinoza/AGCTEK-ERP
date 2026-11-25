'use client'

import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    FicoCompanySelect,
    useFicoCompanies,
} from '../components/FicoCompanySelect'
import AccountDeterminationPanel from '../components/AccountDeterminationPanel'

const ROUTE = '/modules/fico/account-determination'

/** MM transaction-key account mappings (legacy bridge used by automatic journal posting). */
const AccountDeterminationPage = () => {
    const {
        companies,
        companyId,
        setCompanyId,
        loading: companyLoading,
    } = useFicoCompanies()

    return (
        <PageContainer>
            <PageHeader
                title="MM Account Determination"
                description="Configure transaction-key debit and credit mappings used when MM inventory events post to the general ledger."
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
            <AccountDeterminationPanel key={companyId} companyId={companyId} />
        </PageContainer>
    )
}

export default AccountDeterminationPage