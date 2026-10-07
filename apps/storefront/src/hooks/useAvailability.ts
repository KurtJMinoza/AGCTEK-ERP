import { useEffect, useState } from 'react'
import { commerceApi } from '../api/client'
import { MAX_LINE_QUANTITY } from '../context/CartContext'
import type { Availability, Product } from '../types'

/** Live ATP for one product from the ERP; the server stays the authority on what can be sold. */
export function useAvailability(product: Pick<Product, 'divisionId' | 'sku'> | null) {
    const [stock, setStock] = useState<Availability | null>(null)
    const [loading, setLoading] = useState(true)
    const divisionId = product?.divisionId
    const sku = product?.sku

    useEffect(() => {
        if (!divisionId || !sku) return
        let cancelled = false
        setLoading(true)
        commerceApi
            .getAvailability(divisionId, sku)
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
    const available = stock ? Math.max(0, Math.floor(stock.availableQuantity)) : null
    const soldOut = !unlimited && available !== null && available <= 0
    const maxQuantity =
        unlimited || available === null ? MAX_LINE_QUANTITY : Math.min(available, MAX_LINE_QUANTITY)

    return { stock, loading, available, soldOut, maxQuantity }
}
