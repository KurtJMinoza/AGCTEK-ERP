import ModuleLandingPage from '@/components/erp/ModuleLandingPage'
import getMyPermissions from '@/server/actions/permissions/getMyPermissions'

export const metadata = {
    title: 'FICO — Finance & Controlling | AGCTEK ERP',
    description: 'Chart of accounts and fiscal year configuration.',
}/** FICO module submodules. Phase 1: chart of accounts + fiscal calendar.
 * Phase 2: company accounting settings + posting periods + number ranges.
 * Add further submodules here as their UI is completed.
 */
const FICO_SUBMODULES = [
    'chart-of-accounts',
    'gl-accounts',
    'fiscal-years',
    'company-settings',
    'fiscal-periods',
    'number-ranges',
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
