import type { ReactNode } from 'react'
import { requireRead } from '@/server/actions/permissions/getMyPermissions'

const CrmLayout = async ({ children }: { children: ReactNode }) => {
    await requireRead('crm')
    return <>{children}</>
}

export default CrmLayout
