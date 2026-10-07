'use client'

import { useCallback, useEffect, useState } from 'react'
import useCurrentSession from '@/utils/hooks/useCurrentSession'
import {
    apiGetMyPermissions,
    hasPermission,
    type MyPermissions,
    type PermissionAction,
} from '@/services/PermissionService'

const CACHE_TTL_MS = 60_000

let cache: { userId: string; at: number; promise: Promise<MyPermissions> } | null =
    null

function loadPermissions(userId: string) {
    if (!cache || cache.userId !== userId || Date.now() - cache.at > CACHE_TTL_MS) {
        const promise = apiGetMyPermissions()
        promise.catch(() => {
            if (cache?.promise === promise) cache = null
        })
        cache = { userId, at: Date.now(), promise }
    }
    return cache.promise
}

/** Drop the cached permissions, e.g. after a role's permissions are edited. */
export function invalidatePermissions() {
    cache = null
}

/**
 * Resource CRUD permissions for the signed-in user, for menu/button visibility only.
 * `can('crm.leads', 'create')` checks a resource; `can('crm')` checks whether any CRM resource is readable.
 * The backend remains the security boundary.
 */
function usePermissions() {
    const { session } = useCurrentSession()
    const userId = session?.user?.id
    const [data, setData] = useState<MyPermissions | null>(null)
    const [loading, setLoading] = useState(Boolean(userId))

    useEffect(() => {
        if (!userId) return
        let active = true
        setLoading(true)
        loadPermissions(userId)
            .then((result) => active && setData(result))
            .catch(() => active && setData(null))
            .finally(() => active && setLoading(false))
        return () => {
            active = false
        }
    }, [userId])

    const can = useCallback(
        (code: string, action: PermissionAction = 'read') => hasPermission(data, code, action),
        [data],
    )

    return { role: data?.role, permissions: data, loading, can }
}

export default usePermissions
