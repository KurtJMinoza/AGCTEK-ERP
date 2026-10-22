'use client'

import { useEffect, useMemo, useState } from 'react'
import {
    productOptionVariantsService,
    type VariantStockAvailability,
} from '@/modules/sd/services/productOptionVariantsService'

/**
 * Batch ATP for every variant on a product (server-side MM authority).
 */
export function useProductVariantsAvailability(
    productId: string | null | undefined,
    enabled = true,
) {
    const [rows, setRows] = useState<VariantStockAvailability[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(false)

    useEffect(() => {
        if (!enabled || !productId?.trim()) {
            setRows([])
            setLoading(false)
            setError(false)
            return
        }
        let cancelled = false
        setLoading(true)
        setError(false)
        productOptionVariantsService
            .productVariantsAvailability(productId)
            .then((data) => {
                if (!cancelled) setRows(data)
            })
            .catch(() => {
                if (!cancelled) {
                    setRows([])
                    setError(true)
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [productId, enabled])

    const byVariantId = useMemo(() => {
        const map = new Map<string, VariantStockAvailability>()
        for (const row of rows) {
            map.set(row.variantId, row)
        }
        return map
    }, [rows])

    return { rows, byVariantId, loading, error }
}
