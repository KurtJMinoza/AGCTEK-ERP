import { cache } from 'react'
import { redirect } from 'next/navigation'
import getServerSession from '@/server/actions/auth/getServerSession'
import { resolveErpApiBaseUrl } from '@/configs/app.config'
import { ACCESS_DENIED_PATH } from '@/constants/route.constant'
import type { MyPermissions } from '@/services/PermissionService'

/** Signed-in user's effective permissions, fetched once per request. Null when unavailable. */
const getMyPermissions = cache(async (): Promise<MyPermissions | null> => {
    const session = await getServerSession()
    const userId = session?.user?.id
    if (!userId) return null

    try {
        const response = await fetch(`${resolveErpApiBaseUrl()}/permissions/me`, {
            headers: { 'X-User-Id': userId },
            cache: 'no-store',
        })
        if (!response.ok) return null
        return (await response.json()) as MyPermissions
    } catch {
        return null
    }
})

export function canViewModule(permissions: MyPermissions | null, moduleCode: string) {
    return Boolean(permissions?.permissions[moduleCode]?.canView)
}

/** Redirects to Access Denied unless the user has View on the module (fails closed). */
export async function requireModuleView(moduleCode: string) {
    if (!canViewModule(await getMyPermissions(), moduleCode)) {
        redirect(ACCESS_DENIED_PATH)
    }
}

export default getMyPermissions
