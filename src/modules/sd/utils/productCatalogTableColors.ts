import type { CatalogStockSnapshot as StockRow } from '../services/productCatalogService'

export type CatalogStockSnapshot = StockRow

export const stockLabel = (snapshot: CatalogStockSnapshot | undefined) => {
    if (!snapshot) return 'Loading…'
    const qty = Math.max(0, Math.floor(snapshot.availableQty))
    if (snapshot.state === 'NOT_MAPPED') return 'Not linked to MM'
    if (qty === 0) return '0 available'
    return `${qty} available`
}

export const stockPercent = (snapshot: CatalogStockSnapshot | undefined) => {
    if (!snapshot || snapshot.state === 'NOT_MAPPED') return 0
    const qty = Math.max(0, snapshot.availableQty)
    if (qty <= 0) return 8
    if (qty < 10) return Math.min(100, 20 + qty * 6)
    if (qty < 50) return Math.min(100, 45 + qty)
    return Math.min(100, 55 + Math.log10(qty + 1) * 18)
}

export const stockBarClass = (state: string) => {
    if (state === 'OUT_OF_STOCK' || state === 'NOT_MAPPED') return 'bg-rose-500'
    if (state === 'LOW_STOCK') return 'bg-amber-500'
    return 'bg-emerald-500'
}

export const stockTextClass = (state: string) => {
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
