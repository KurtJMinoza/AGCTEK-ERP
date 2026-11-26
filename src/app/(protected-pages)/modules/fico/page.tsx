import ModuleLandingPage from '@/components/erp/ModuleLandingPage'
import getMyPermissions from '@/server/actions/permissions/getMyPermissions'

export const metadata = {
    title: 'FICO — Finance & Controlling | AGCTEK ERP',
    description: 'Chart of accounts and fiscal year configuration.',
}

/** FICO landing cards (rollout filter). */
const FICO_SUBMODULES = [
    'overview',
    'journal-entries',
    'general-ledger',
    'trial-balance',
    'chart-of-accounts',
    'gl-accounts',
    'company-accounting-settings',
    'fiscal-years',
    'fiscal-periods',
    'number-ranges',
    'tax-codes',
    'document-types-fi',
    'accounting-events',
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
