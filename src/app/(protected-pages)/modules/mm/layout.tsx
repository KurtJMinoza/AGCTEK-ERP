import { requireModuleView } from '@/server/actions/permissions/getMyPermissions'
import type { ReactNode } from 'react'

const MmLayout = async ({ children }: { children: ReactNode }) => {
    await requireModuleView('mm')
    return <>{children}</>
}

export default MmLayout
