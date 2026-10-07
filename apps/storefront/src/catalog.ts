import type { DivisionId, Product } from './types'

export const MARKETPLACE_NAME = 'AGC Marketplace'

/** Checkout order of stores (matches the web split cart). */
export const DIVISION_ORDER: readonly DivisionId[] = [
    'DIV_RETAIL',
    'DIV_LPG',
    'DIV_APPLIANCES',
]

export type OfficialStore = {
    divisionId: DivisionId
    name: string
    tagline: string
    /** Ionicons name. */
    icon: 'heart-outline' | 'snow-outline' | 'flame-outline'
}

export const OFFICIAL_STORES: readonly OfficialStore[] = [
    {
        divisionId: 'DIV_RETAIL',
        name: 'AWIC',
        tagline: 'Health & Wellness',
        icon: 'heart-outline',
    },
    {
        divisionId: 'DIV_APPLIANCES',
        name: 'MCONPINCO',
        tagline: 'Home Appliances',
        icon: 'snow-outline',
    },
    {
        divisionId: 'DIV_LPG',
        name: 'LPG',
        tagline: 'Energy & Gas',
        icon: 'flame-outline',
    },
]

export const storeName = (divisionId: string | null) =>
    OFFICIAL_STORES.find((s) => s.divisionId === divisionId)?.name ??
    divisionId ??
    'Store'

export const isDivisionId = (value: string): value is DivisionId =>
    (DIVISION_ORDER as readonly string[]).includes(value)

/** SKUs are unique per store only, so cart lines are keyed by both. */
export const productKey = (product: Pick<Product, 'divisionId' | 'sku'>) =>
    `${product.divisionId}:${product.sku}`

export const discountPercent = (product: Product) =>
    product.originalPrice !== null && product.originalPrice > product.price
        ? Math.round((1 - product.price / product.originalPrice) * 100)
        : null

export const averageRating = (product: Product) =>
    product.reviews.length
        ? product.reviews.reduce((sum, r) => sum + r.rating, 0) /
          product.reviews.length
        : null

export type SortKey = 'recommended' | 'discount' | 'price-asc' | 'price-desc'

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
    { value: 'recommended', label: 'Recommended' },
    { value: 'discount', label: 'Biggest discount' },
    { value: 'price-asc', label: 'Price: low to high' },
    { value: 'price-desc', label: 'Price: high to low' },
]

export const sortProducts = (products: Product[], sort: SortKey) => {
    if (sort === 'price-asc') return [...products].sort((a, b) => a.price - b.price)
    if (sort === 'price-desc') return [...products].sort((a, b) => b.price - a.price)
    if (sort === 'discount')
        return [...products].sort(
            (a, b) => (discountPercent(b) ?? 0) - (discountPercent(a) ?? 0),
        )
    return products
}

const normalize = (value: string) =>
    value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()

/** Every search word must appear in the name, SKU, category, store or tagline. */
export const matchesSearch = (product: Product, query: string) => {
    const words = normalize(query).split(/\s+/).filter(Boolean)
    if (words.length === 0) return true
    const haystack = normalize(
        [
            product.name,
            product.sku,
            product.category,
            storeName(product.divisionId),
            product.tagline ?? '',
            product.description,
        ].join(' '),
    )
    return words.every((word) => haystack.includes(word))
}

/** Category name → Ionicons glyph (same categories as the web grid). */
export const CATEGORY_ICONS: Record<string, string> = {
    Vitamins: 'medkit-outline',
    Bags: 'bag-handle-outline',
    Accessories: 'watch-outline',
    'General Goods': 'cube-outline',
    Refill: 'flame-outline',
    'Brand-New': 'sparkles-outline',
    'Add-on': 'construct-outline',
    Cooling: 'snow-outline',
    Laundry: 'water-outline',
    Kitchen: 'restaurant-outline',
    Boxes: 'cube-outline',
    Chemicals: 'flask-outline',
    Consumables: 'cube-outline',
    Electrical: 'flash-outline',
    Furniture: 'bed-outline',
    Hardware: 'hammer-outline',
    'IT Equipment': 'hardware-chip-outline',
    Mechanical: 'settings-outline',
    Networking: 'git-network-outline',
    'Office Supplies': 'attach-outline',
    Packaging: 'cube-outline',
    Peripherals: 'keypad-outline',
    'Safety Gear': 'shield-checkmark-outline',
    'Spare Parts': 'build-outline',
    Stationery: 'create-outline',
    Textiles: 'shirt-outline',
}

export type MarketplaceCategory = {
    name: string
    /** The only store selling this category, or null when several do. */
    divisionId: string | null
    count: number
}

/** Categories present in the live catalogue, most-stocked first (same as the web grid). */
export const marketplaceCategories = (products: Product[]): MarketplaceCategory[] => {
    const byName = new Map<string, { divisions: Set<string>; count: number }>()
    for (const product of products) {
        const name = product.category?.trim()
        if (!name) continue
        const entry = byName.get(name) ?? { divisions: new Set<string>(), count: 0 }
        entry.divisions.add(product.divisionId)
        entry.count += 1
        byName.set(name, entry)
    }
    return [...byName.entries()]
        .map(([name, { divisions, count }]) => ({
            name,
            divisionId: divisions.size === 1 ? [...divisions][0] : null,
            count,
        }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/** LPG refills / sets (not add-ons) — used for the "LPG from ₱…" promo. */
export const isLpgMain = (product: Product) => product.divisionId === 'DIV_LPG' && !product.isAddon
