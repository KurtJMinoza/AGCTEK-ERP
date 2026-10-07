import type { ReactNode } from 'react'
import { requireModuleView } from '@/server/actions/permissions/getMyPermissions'

const CrmLayout = async ({ children }: { children: ReactNode }) => {
    await requireModuleView('crm')
    return <>{children}</>
}

export default CrmLayout
