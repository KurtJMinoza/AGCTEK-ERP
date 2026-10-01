'use client'

import { useMemo } from 'react'
import {
    calculateCartPricing,
    type CartPricing,
} from '@/modules/sd/services/ecommerceService'
import { toPricingItems } from '@/services/storefront/retailService'
import { useProductCatalogStore } from '@/modules/sd/store/useProductCatalogStore'
import { RETAIL_DIVISION_ID } from '@/types/storefront/retail'
import { useRetailCartStore } from '../store/retailCartStore'

/** SD-priced view of the current bag; null when the bag is empty or unpriceable. */
export function useCartPricing(): CartPricing | null {
    const items = useRetailCartStore((s) => s.items)
    const discountCode = useRetailCartStore((s) => s.discountCode)
    const catalog = useProductCatalogStore(
        (s) => s.catalogs[RETAIL_DIVISION_ID]?.products,
    )

    return useMemo(() => {
        if (items.length === 0 || !catalog) return null
        try {
            return calculateCartPricing(toPricingItems(items), discountCode)
        } catch {
            return null
        }
    }, [items, discountCode, catalog])
}
