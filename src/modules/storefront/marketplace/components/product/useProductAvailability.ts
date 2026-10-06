'use client'

import { useEffect, useState } from 'react'
import {
    fetchStorefrontAvailability,
    type SdProductRecord,
    type StorefrontAvailability,
} from '@/modules/sd/services/productCatalogService'

const MAX_QUANTITY = 99

/** Live ATP for one product; the server stays the authority on what can be sold. */
export function useProductAvailability(
    product: Pick<SdProductRecord, 'divisionId' | 'sku'>,
) {
    const [stock, setStock] = useState<StorefrontAvailability | null>(null)
    const [loading, setLoading] = useState(true)
    const { divisionId, sku } = product

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        fetchStorefrontAvailability(divisionId, sku)
            .then((result) => {
                if (!cancelled) setStock(result)
            })
            .catch(() => {
                if (!cancelled) setStock(null)
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [divisionId, sku])

    const unlimited = stock?.state === 'NON_INVENTORY'
    const available = stock
        ? Math.max(0, Math.floor(stock.availableQuantity))
        : null
    const soldOut = !unlimited && available !== null && available <= 0
    const maxQuantity =
        unlimited || available === null
            ? MAX_QUANTITY
            : Math.min(available, MAX_QUANTITY)

    return { stock, loading, available, soldOut, maxQuantity }
}
