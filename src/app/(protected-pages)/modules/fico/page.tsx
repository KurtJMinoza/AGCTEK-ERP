import ModuleLandingPage from '@/components/erp/ModuleLandingPage'
import getMyPermissions from '@/server/actions/permissions/getMyPermissions'

export const metadata = {
    title: 'FICO — Finance & Controlling | AGCTEK ERP',
    description: 'Chart of accounts and fiscal year configuration.',
}

/** FICO Phase 1 exposes only the chart of accounts and the fiscal calendar. */
const FICO_PHASE1_SUBMODULES = ['chart-of-accounts', 'gl-accounts', 'fiscal-years']

export default async function Page() {
    return (
        <ModuleLandingPage
            moduleCode="fico"
            permissions={await getMyPermissions()}
            submoduleCodes={FICO_PHASE1_SUBMODULES}
        />
    )
}
