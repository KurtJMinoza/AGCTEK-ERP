import type { CatalogStockSnapshot as StockRow } from '../services/productCatalogService'

export type CatalogStockSnapshot = StockRow

export const stockLabel = (snapshot: CatalogStockSnapshot | undefined) => {
    if (!snapshot) return 'Loading...'
    if (snapshot.state === 'ERROR') return 'MM stock unavailable'
    if (snapshot.state === 'NOT_MAPPED') return 'Not linked to MM'
    const qty = Math.max(0, Math.floor(snapshot.availableQty ?? 0))
    if (qty === 0) return '0 available'
    return `${qty} available`
}

/**
 * Extra MM ledger context under the availability label. Stock is only ever the
 * live ledger value — never a material master cache — so the sub-label shows
 * where the number came from.
 */
export const stockDetail = (snapshot: CatalogStockSnapshot | undefined) => {
    if (!snapshot || snapshot.state === 'ERROR') return null
    if (snapshot.hasVariants) return 'Variant stock (default variant)'
    if (snapshot.state === 'NOT_MAPPED') return null
    if (snapshot.onHandQty == null) return null
    return `On hand ${Math.max(0, Math.floor(snapshot.onHandQty))} · Reserved ${Math.max(
        0,
        Math.floor(snapshot.reservedQty ?? 0),
    )}`
}

export const stockPercent = (snapshot: CatalogStockSnapshot | undefined) => {
    if (
        !snapshot ||
        snapshot.state === 'NOT_MAPPED' ||
        snapshot.state === 'ERROR'
    ) {
        return 0
    }
    const qty = Math.max(0, snapshot.availableQty ?? 0)
    if (qty <= 0) return 8
    if (qty < 10) return Math.min(100, 20 + qty * 6)
    if (qty < 50) return Math.min(100, 45 + qty)
    return Math.min(100, 55 + Math.log10(qty + 1) * 18)
}

export const stockBarClass = (state: string) => {
    if (state === 'ERROR') return 'bg-gray-400'
    if (state === 'OUT_OF_STOCK' || state === 'NOT_MAPPED') return 'bg-rose-500'
    if (state === 'LOW_STOCK') return 'bg-amber-500'
    return 'bg-emerald-500'
}

export const stockTextClass = (state: string) => {
    if (state === 'ERROR') return 'text-gray-500'
    if (state === 'OUT_OF_STOCK' || state === 'NOT_MAPPED') return 'text-rose-600'
    if (state === 'LOW_STOCK') return 'text-amber-600'
    return 'text-gray-700 dark:text-gray-300'
}

export const divisionTextClass = (_divisionId: string) =>
    'text-gray-800 dark:text-gray-200'

export const categoryTextClass = (_category: string) =>
    'text-gray-700 dark:text-gray-300'

export const priceTextClass = (_product: { originalPrice: number | null }) =>
    'text-gray-900 dark:text-gray-100'

export const badgeTextClass = () => ''

export const visibilityTextClass = (active: boolean) =>
    active ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-500'
