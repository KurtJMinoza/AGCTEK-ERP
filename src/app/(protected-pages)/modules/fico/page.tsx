import ModuleLandingPage from '@/components/erp/ModuleLandingPage'
import getMyPermissions from '@/server/actions/permissions/getMyPermissions'

export const metadata = {
    title: 'FICO — Finance & Controlling | AGCTEK ERP',
    description: 'Chart of accounts and fiscal year configuration.',
}

/** FICO Phase 1 exposes the chart, G/L accounts, fiscal calendar, manual journals, and FI document types. */
const FICO_PHASE1_SUBMODULES = [
    'chart-of-accounts',
    'gl-accounts',
    'journal-entries',
    'fiscal-years',
    'document-types-fi',
]

export default async function Page() {
    return (
        <ModuleLandingPage
            moduleCode="fico"
            permissions={await getMyPermissions()}
            submoduleCodes={FICO_PHASE1_SUBMODULES}
        />
    )
}
