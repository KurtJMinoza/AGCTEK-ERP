import { isRenderableImageSrc } from '@/utils/productImage'
import {
    productAttribute,
    type SdProductRecord,
} from '../services/productCatalogService'

export const LPG_DIVISION_ID = 'DIV_LPG' as const

export const LPG_CATEGORIES = ['Refill', 'Brand-New', 'Add-on'] as const

export type LpgProductCategory = (typeof LPG_CATEGORIES)[number]

export type LpgProduct = {
    sku: string
    name: string
    description: string
    category: LpgProductCategory
    /** PHP, VAT-inclusive list price */
    basePrice: number
    /** Cylinder net weight in kg, used for display only. */
    weightKg?: number
    /** What the customer receives, shown as bullets on the product page. */
    includes: string[]
    /** Public image paths (e.g. `/img/lpg/...`); a placeholder is shown when empty. */
    images?: string[]
}

/** Maps an SD product (division DIV_LPG) to the LPG storefront view. */
export function toLpgProduct(record: SdProductRecord): LpgProduct {
    const images = [
        record.imageUrl,
        ...productAttribute<string[]>(record, 'images', []),
    ].filter((src, index, all) => isRenderableImageSrc(src) && all.indexOf(src) === index)
    return {
        sku: record.sku,
        name: record.name,
        description: record.description,
        category: record.category as LpgProductCategory,
        basePrice: record.price,
        weightKg: productAttribute<number | undefined>(
            record,
            'weightKg',
            undefined,
        ),
        includes: productAttribute<string[]>(record, 'includes', []),
        images,
    }
}

export const isLpgAddon = (product: Pick<LpgProduct, 'category'>) =>
    product.category === 'Add-on'
