import { RETAIL_DIVISION_ID } from '@/types/storefront/retail'
import { LPG_DIVISION_ID } from '../catalogs/lpgCatalog'
import { APPLIANCES_DIVISION_ID } from '../catalogs/mconpincoCatalog'
import { useProductCatalogStore } from '../store/useProductCatalogStore'

export type SalesDivisionId =
    | typeof RETAIL_DIVISION_ID
    | typeof LPG_DIVISION_ID
    | typeof APPLIANCES_DIVISION_ID

export const SALES_DIVISION_IDS = [
    RETAIL_DIVISION_ID,
    LPG_DIVISION_ID,
    APPLIANCES_DIVISION_ID,
] as const

export type PricedLine = {
    sku: string
    name: string
    quantity: number
    unitPrice: number
    lineTotal: number
}

export type PricedLines = {
    lines: PricedLine[]
    subtotal: number
}

export const roundMoney = (value: number) => Number(value.toFixed(2))

/** Loads the division's active SD product catalog that `priceLines` prices from. */
export const loadPricingCatalog = (divisionId: SalesDivisionId) =>
    useProductCatalogStore.getState().ensureLoaded(divisionId)

/**
 * SD pricing engine: active SD product price × quantity, no seasonal
 * conditions. Shared by POS (Lane A) and e-commerce (Lane B); the backend
 * re-verifies every unit price against `sd_products` on save.
 * Throws when the division catalog is not loaded or a SKU is not sold.
 */
export function priceLines(
    items: ReadonlyArray<{ sku: string; quantity: number }>,
    divisionId: SalesDivisionId = RETAIL_DIVISION_ID,
): PricedLines {
    const catalog =
        useProductCatalogStore.getState().catalogs[divisionId]?.products
    if (!catalog) {
        throw new Error(`Product catalog for ${divisionId} is not loaded`)
    }
    const lines = items.map<PricedLine>((item) => {
        const product = catalog.find(
            (p) => p.sku.toLowerCase() === item.sku.toLowerCase(),
        )
        if (!product) {
            throw new Error(`Unknown SKU for ${divisionId}: ${item.sku}`)
        }
        return {
            sku: product.sku,
            name: product.name,
            quantity: item.quantity,
            unitPrice: product.price,
            lineTotal: roundMoney(product.price * item.quantity),
        }
    })

    return {
        lines,
        subtotal: roundMoney(
            lines.reduce((sum, line) => sum + line.lineTotal, 0),
        ),
    }
}
