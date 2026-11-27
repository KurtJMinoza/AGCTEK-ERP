'use client'

import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    FicoCompanySelect,
    useFicoCompanies,
} from '../components/FicoCompanySelect'
import ApAccountsPayableWorkbench from '../components/ap/ApAccountsPayableWorkbench'
import { FicoCompanyRequired } from '../components/workbench/FicoWorkbenchChrome'

const ROUTE = '/modules/fico/accounts-payable'

const AccountsPayablePage = () => {
    const { companies, companyId, setCompanyId, loading: companyLoading } =
        useFicoCompanies()

    return (
        <PageContainer>
            <PageHeader
                title="Accounts Payable"
                description="Supplier payables dashboard, invoices, open items, payment proposals, settlements, aging, and G/L reconciliation — tied to MM procurement and FICO journals."
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
            {companyId ? (
                <ApAccountsPayableWorkbench key={companyId} companyId={companyId} />
            ) : (
                <FicoCompanyRequired message="Select a company to open the accounts payable workbench." />
            )}
        </PageContainer>
    )
}

export default AccountsPayablePage