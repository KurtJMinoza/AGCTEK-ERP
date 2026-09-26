'use client'

import { useEffect, useRef } from 'react'
import { useRetailCartStore } from '@/modules/storefront/retail/store/retailCartStore'
import { useRetailClientStore } from '@/modules/storefront/retail/store/retailClientStore'
import {
    fetchRetailClientCart,
    saveRetailClientCart,
} from '@/services/storefront/retailClientService'

/**
 * Keeps the logged-in client's cart in sync with the database:
 * - On session restore, load saved cart from the API
 * - On local cart changes, debounce-save to the API
 */
export function useRetailCartSync() {
    const client = useRetailClientStore((s) => s.client)
    const items = useRetailCartStore((s) => s.items)
    const setItems = useRetailCartStore((s) => s.setItems)
    const hydratedRef = useRef(false)
    const skipNextSaveRef = useRef(false)
    const clientId = client?.customerId ?? null

    useEffect(() => {
        hydratedRef.current = false
        skipNextSaveRef.current = false

        if (!clientId) return

        let cancelled = false
        ;(async () => {
            try {
                const serverItems = await fetchRetailClientCart(clientId)
                if (cancelled) return

                const localItems = useRetailCartStore.getState().items
                if (serverItems.length > 0) {
                    skipNextSaveRef.current = true
                    setItems(serverItems)
                } else if (localItems.length > 0) {
                    await saveRetailClientCart(clientId, localItems)
                }
            } catch {
                // Keep local cart if sync fails (API down, etc.)
            } finally {
                if (!cancelled) hydratedRef.current = true
            }
        })()

        return () => {
            cancelled = true
        }
    }, [clientId, setItems])

    useEffect(() => {
        if (!clientId || !hydratedRef.current) return
        if (skipNextSaveRef.current) {
            skipNextSaveRef.current = false
            return
        }

        const timer = window.setTimeout(() => {
            void saveRetailClientCart(clientId, items).catch(() => undefined)
        }, 450)

        return () => window.clearTimeout(timer)
    }, [clientId, items])
}
