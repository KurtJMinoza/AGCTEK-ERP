import { requireRead } from '@/server/actions/permissions/getMyPermissions'
import type { ReactNode } from 'react'

const ModuleLayout = async ({
    children,
    params,
}: {
    children: ReactNode
    params: Promise<{ moduleCode: string }>
}) => {
    await requireRead((await params).moduleCode)
    return <>{children}</>
}

export default ModuleLayout
