'use client'

import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import AccountDeterminationRulesPage from './AccountDeterminationRulesPage'

const ROUTE = '/modules/fico/account-determination'

/** Phase 04.21 — centralized account determination workbench. */
export default function AccountDeterminationWorkbench() {
    return (
        <PageContainer>
            <PageHeader
                title="Account Determination"
                description="Configure centralized G/L determination rules, transaction keys, and resolution simulation for automatic journal posting."
                breadcrumbs={buildErpBreadcrumbs(ROUTE)}
            />
            <AccountDeterminationRulesPage workbench />
        </PageContainer>
    )
}