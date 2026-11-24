import ModuleLandingPage from '@/components/erp/ModuleLandingPage'
import getMyPermissions from '@/server/actions/permissions/getMyPermissions'

export const metadata = {
    title: 'FICO — Finance & Controlling | AGCTEK ERP',
    description: 'Chart of accounts and fiscal year configuration.',
}

/**
 * FICO module submodules.
 * Phase 1: chart of accounts + fiscal calendar + manual journals.
 * Phase 2: company accounting settings + posting periods + number ranges + tax codes.
 */
const FICO_SUBMODULES = [
    'chart-of-accounts',
    'gl-accounts',
    'journal-entries',
    'fiscal-years',
    'company-settings',
    'fiscal-periods',
    'number-ranges',
    'tax-codes',
    'document-types-fi',
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
