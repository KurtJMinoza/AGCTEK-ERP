import { cache, type ReactNode } from 'react'
import { redirect } from 'next/navigation'
import getServerSession from '@/server/actions/auth/getServerSession'
import { resolveErpApiBaseUrl } from '@/configs/app.config'
import { ACCESS_DENIED_PATH } from '@/constants/route.constant'
import { hasPermission, type MyPermissions } from '@/services/PermissionService'

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

/** A group (`crm`) is readable when any of its resources is. */
export function canViewModule(permissions: MyPermissions | null, moduleCode: string) {
    return hasPermission(permissions, moduleCode, 'read')
}

/** Redirects to Access Denied unless the user can read the module or resource (fails closed). */
export async function requireRead(code: string) {
    if (!hasPermission(await getMyPermissions(), code, 'read')) {
        redirect(ACCESS_DENIED_PATH)
    }
}

/** Layout that guards a route segment by resource code, e.g. `export default resourceGuardLayout('mm.procurement')`. */
export function resourceGuardLayout(code: string) {
    return async function ResourceGuardLayout({ children }: { children: ReactNode }) {
        await requireRead(code)
        return children
    }
}

export default getMyPermissions
