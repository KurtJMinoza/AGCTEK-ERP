import { requireRead } from '@/server/actions/permissions/getMyPermissions'
import type { ReactNode } from 'react'

const MmLayout = async ({ children }: { children: ReactNode }) => {
    await requireRead('mm')
    return <>{children}</>
}

export default MmLayout
