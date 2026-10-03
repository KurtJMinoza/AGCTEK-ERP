'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useRetailClientStore } from '@/modules/storefront/retail/store/retailClientStore'

/**
 * Runs `action` immediately for a signed-in client; otherwise opens the sign-in
 * dialog and runs it once sign-in succeeds. Closing the dialog without signing
 * in drops the pending action.
 */
export function useSignedInAction() {
    const client = useRetailClientStore((s) => s.client)
    const isLoginOpen = useRetailClientStore((s) => s.isLoginOpen)
    const openLogin = useRetailClientStore((s) => s.openLogin)
    const pending = useRef<(() => void) | null>(null)

    useEffect(() => {
        if (!pending.current) return
        if (client) {
            const action = pending.current
            pending.current = null
            action()
        } else if (!isLoginOpen) {
            pending.current = null
        }
    }, [client, isLoginOpen])

    return useCallback(
        (action: () => void) => {
            if (client) {
                action()
                return
            }
            pending.current = action
            openLogin()
        },
        [client, openLogin],
    )
}
