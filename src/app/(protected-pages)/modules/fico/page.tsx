import ModuleLandingPage from '@/components/erp/ModuleLandingPage'
import getMyPermissions from '@/server/actions/permissions/getMyPermissions'

export const metadata = {
    title: 'FICO — Finance & Controlling | AGCTEK ERP',
    description: 'Chart of accounts and fiscal year configuration.',
}

/** FICO landing cards (rollout filter). Submodule `code` from `src/configs/erp-modules.ts`. */
const FICO_SUBMODULES = [
    'overview',
    'journal-entries',
    'general-ledger',
    'account-balances',
    'trial-balance',
    'ar-workbench',
    'treasury-accounts',
    'tax-reconciliation',
    'ap-workbench',
    'grir-clearing',
    'chart-of-accounts',
    'gl-accounts',
    'company-accounting-settings',
    'account-determination-rules',
    'fiscal-years',
    'fiscal-periods',
    'number-ranges',
    'tax-codes',
    'document-types-fi',
    'accounting-events',
    'ar-open-items',
]
export default async function Page() {
    return (
        <ModuleLandingPage
            moduleCode="fico"
            permissions={await getMyPermissions()}
            submoduleCodes={FICO_SUBMODULES}
        />
    )
}
