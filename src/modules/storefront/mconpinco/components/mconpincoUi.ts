import type { ApplianceProduct } from '@/modules/sd/catalogs/mconpincoCatalog'

/** Brand "fire" surface: deep maroon fading to black, with #DC2626 (red-600) reserved for accents. */
export const FIRE_SURFACE =
    'bg-gradient-to-br from-[#2f0f0f] via-[#180c0c] to-[#0a0a0a] text-white'

export const DARK_BUTTON = () =>
    `${FIRE_SURFACE} hover:from-[#4a1515] hover:via-[#2a1010] active:from-[#1f0a0a] active:via-[#120909] dark:ring-1 dark:ring-inset dark:ring-white/10`

/** Red is reserved for conversion points: Add to Cart and prices. */
export const ADD_TO_CART_BUTTON = () =>
    'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white'

export const formatPrice = (value: number) =>
    new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
        value,
    )

/** Null when the product has no struck-through reference price. */
export const discountPercent = (product: ApplianceProduct) =>
    product.originalPrice
        ? Math.round((1 - product.basePrice / product.originalPrice) * 100)
        : null
