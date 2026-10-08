import type { ReactNode } from 'react'
import { requireRead } from '@/server/actions/permissions/getMyPermissions'
import { findSubmoduleByRoute, submodulePermissionCode } from '@/configs/erp-modules'

const SubmoduleLayout = async ({
    children,
    params,
}: {
    children: ReactNode
    params: Promise<{ moduleCode: string; submoduleCode: string }>
}) => {
    const { moduleCode, submoduleCode } = await params
    const match = findSubmoduleByRoute(moduleCode, submoduleCode)
    const code = match ? submodulePermissionCode(moduleCode, match.submodule) : null
    if (code) await requireRead(code)
    return <>{children}</>
}

export default SubmoduleLayout
