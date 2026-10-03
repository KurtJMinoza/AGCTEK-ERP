import { requireModuleView } from '@/server/actions/permissions/getMyPermissions'
import type { ReactNode } from 'react'

const ScmLayout = async ({ children }: { children: ReactNode }) => {
    await requireModuleView('scm')
    return <>{children}</>
}

export default ScmLayout
