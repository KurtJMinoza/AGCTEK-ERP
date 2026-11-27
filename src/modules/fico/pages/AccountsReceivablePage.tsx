'use client'

import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    FicoCompanySelect,
    useFicoCompanies,
} from '../components/FicoCompanySelect'
import AccountsReceivableWorkbench from '../components/accountsReceivable/AccountsReceivableWorkbench'

const ROUTE = '/modules/fico/accounts-receivable'

const AccountsReceivablePage = () => {
    const { companies, companyId, setCompanyId, loading: companyLoading } =
        useFicoCompanies()

    return (
        <PageContainer>
            <PageHeader
                title="AR Open Items"
                description="Customer receivables from issued sales invoices and POS charge / unpaid balances — open amounts, due dates, and aging."
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
                <AccountsReceivableWorkbench key={companyId} companyId={companyId} />
            ) : (
                <p className="text-sm text-gray-500">
                    Select a company to load Accounts Receivable open items.
                </p>
            )}
        </PageContainer>
    )
}

export default AccountsReceivablePage
