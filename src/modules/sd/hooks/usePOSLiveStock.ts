'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    fetchStorefrontAvailabilityBatch,
    type StorefrontAvailability,
} from '../services/productCatalogService'

/** How often the terminal re-reads live stock for the open cart. */
const POLL_MS = 10_000

/** One cart line the terminal needs stock for. */
export type POSStockLine = {
    sku: string
    variantId?: string | null
}

/** Cart line key — the same shape the POS cart store uses. */
export const posStockKey = (sku: string, variantId?: string | null) =>
    `${sku.toUpperCase()}#${variantId ?? ''}`

/**
 * Live remaining stock for the POS cart.
 *
 * The backend answers with the current MM ledger (on hand − reserved) for every
 * cart line in one request. The cart re-reads it whenever the lines change and
 * keeps polling while the cart is open, so stock taken by another terminal
 * shows up without a manual refresh.
 *
 * shortcut: polling every 10s instead of a stock event feed — swap in an MM
 * inventory event subscription when the terminal must react within a second.
 */
export function usePOSLiveStock(divisionId: string, lines: POSStockLine[]) {
    const [stock, setStock] = useState<Record<string, StorefrontAvailability>>(
        {},
    )
    const linesRef = useRef(lines)

    // Keep the ref in step with the cart before the poll effects read it.
    useEffect(() => {
        linesRef.current = lines
    }, [lines])

    const refresh = useCallback(async () => {
        const current = linesRef.current
        if (!current.length) {
            setStock({})
            return
        }
        try {
            const rows = await fetchStorefrontAvailabilityBatch(
                divisionId,
                current.map((line) => ({
                    sku: line.sku,
                    variantId: line.variantId ?? null,
                })),
            )
            const next: Record<string, StorefrontAvailability> = {}
            current.forEach((line, index) => {
                const row = rows[index]
                if (row) next[posStockKey(line.sku, line.variantId)] = row
            })
            setStock(next)
        } catch {
            // Keep the last known stock: the checkout ATP preflight is the
            // authority, the terminal must still be able to take a sale.
        }
    }, [divisionId])

    /** Changes whenever the cart lines change — drives both effects below. */
    const lineKey = useMemo(
        () =>
            lines
                .map((line) => posStockKey(line.sku, line.variantId))
                .sort()
                .join('|'),
        [lines],
    )

    useEffect(() => {
        // Deferred so the fetch (and its setState) runs outside the effect body.
        void Promise.resolve().then(() => refresh())
    }, [refresh, lineKey])

    useEffect(() => {
        if (!lines.length) return
        const timer = setInterval(() => void refresh(), POLL_MS)
        return () => clearInterval(timer)
    }, [refresh, lineKey, lines.length])

    /** Live stock of one cart line, or null while it is not known yet. */
    const availabilityFor = useCallback(
        (sku: string, variantId?: string | null) =>
            stock[posStockKey(sku, variantId)] ?? null,
        [stock],
    )

    return { stock, availabilityFor, refresh }
}
