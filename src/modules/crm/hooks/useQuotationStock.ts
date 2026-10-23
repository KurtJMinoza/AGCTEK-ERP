'use client'

import { useEffect, useMemo, useState } from 'react'
import {
    checkQuotationStock,
    type ProductLineInput,
    type QuotationLineStock,
} from '@/modules/sd/services/quotationService'

const DEBOUNCE_MS = 400
const EMPTY: Map<string, QuotationLineStock> = new Map()

/**
 * Soft stock per product for quotation lines, refreshed a moment after products or quantities
 * change. A failed read leaves every line unknown (never "none"); nothing here blocks saving.
 */
export function useQuotationStock(lines: ProductLineInput[], enabled = true) {
    const key = useMemo(
        () =>
            JSON.stringify(
                lines
                    .filter((l) => l.productId && Number.isFinite(l.quantity) && l.quantity > 0)
                    .map((l) => [l.productId, l.quantity]),
            ),
        [lines],
    )
    const wanted = enabled && key !== '[]'
    /** Results are kept with the request they answer, so stale ones are never shown. */
    const [result, setResult] = useState<{ key: string; stock: Map<string, QuotationLineStock> } | null>(null)

    useEffect(() => {
        if (!wanted) return
        let active = true
        const timer = setTimeout(() => {
            const requested = JSON.parse(key) as [string, number][]
            checkQuotationStock(requested.map(([productId, quantity]) => ({ productId, quantity })))
                .then((rows) => active && setResult({ key, stock: new Map(rows.map((r) => [r.productId, r])) }))
                .catch(() => active && setResult({ key, stock: EMPTY }))
        }, DEBOUNCE_MS)
        return () => {
            active = false
            clearTimeout(timer)
        }
    }, [key, wanted])

    const current = wanted && result?.key === key
    return { stock: current ? result.stock : EMPTY, loading: wanted && !current }
}
