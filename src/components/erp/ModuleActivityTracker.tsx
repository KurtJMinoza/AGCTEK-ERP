'use client'

import { useCallback, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import {
    apiGetModuleActivity,
    apiMarkModuleSeen,
    moduleSeenKey,
} from '@/services/ModuleActivityService'
import { getActiveModuleCode, getActiveNavPath } from '@/utils/erp-navigation'
import { useModuleActivityStore } from '@/utils/hooks/useModuleActivity'

const POLL_MS = 60_000

/**
 * Keeps navigation "new data" badges current: marks the opened module and page as seen on every
 * navigation, then polls the server for new records while the tab is visible.
 */
export default function ModuleActivityTracker() {
    const pathname = usePathname()
    const setSummary = useModuleActivityStore((state) => state.setSummary)
    const clearSeen = useModuleActivityStore((state) => state.clearSeen)
    const requestId = useRef(0)

    const refresh = useCallback(async () => {
        const id = ++requestId.current
        try {
            const summary = await apiGetModuleActivity()
            if (id === requestId.current) setSummary(summary)
        } catch {
            // Badges are advisory; keep the last known counts.
        }
    }, [setSummary])

    useEffect(() => {
        const moduleCode = getActiveModuleCode(pathname)
        const pagePath = getActiveNavPath(pathname)
        const keys = [
            ...(moduleCode ? [moduleSeenKey(moduleCode)] : []),
            ...(pagePath ? [pagePath] : []),
        ]
        if (keys.length) clearSeen(moduleCode, pagePath)
        void (keys.length ? apiMarkModuleSeen(keys) : Promise.resolve())
            .catch(() => undefined)
            .then(refresh)
    }, [pathname, clearSeen, refresh])

    useEffect(() => {
        const tick = () => {
            if (document.visibilityState === 'visible') void refresh()
        }
        const id = window.setInterval(tick, POLL_MS)
        document.addEventListener('visibilitychange', tick)
        return () => {
            window.clearInterval(id)
            document.removeEventListener('visibilitychange', tick)
        }
    }, [refresh])

    return null
}
