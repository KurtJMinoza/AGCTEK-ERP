'use client'

import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Button from '@/components/ui/Button'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    FicoCompanySelect,
    useFicoCompanies,
} from '../components/FicoCompanySelect'
import ArAccountsReceivableWorkbench from '../components/ar/ArAccountsReceivableWorkbench'
import { FicoCompanyRequired } from '../components/workbench/FicoWorkbenchChrome'

const ROUTE = '/modules/fico/accounts-receivable'

const AccountsReceivablePage = () => {
    const { companies, companyId, setCompanyId, loading: companyLoading } =
        useFicoCompanies()

    return (
        <PageContainer>
            <PageHeader
                title="Accounts Receivable"
                description="Customer subledger workbench — open items with POS/SO invoice reference, aging buckets, collections, credit exposure, and G/L reconciliation."
                breadcrumbs={buildErpBreadcrumbs(ROUTE)}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <FicoCompanySelect
                            companies={companies}
                            value={companyId}
                            onChange={setCompanyId}
                            loading={companyLoading}
                            allowAll={false}
                        />
                    </div>
                }
            />
            {companyId ? (
                <ArAccountsReceivableWorkbench companyId={companyId} />
            ) : (
                <FicoCompanyRequired />
            )}
        </PageContainer>
    )
}

export default AccountsReceivablePage