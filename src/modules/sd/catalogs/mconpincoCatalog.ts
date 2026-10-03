import { productImageSrc } from '@/utils/productImage'
import {
    productAttribute,
    type SdProductRecord,
} from '../services/productCatalogService'

export const APPLIANCES_DIVISION_ID = 'DIV_APPLIANCES' as const

export const APPLIANCE_CATEGORIES = ['Cooling', 'Laundry', 'Kitchen'] as const

export type ApplianceCategory = (typeof APPLIANCE_CATEGORIES)[number]

export type ApplianceSpec = { label: string; value: string }

export type ApplianceProduct = {
    sku: string
    name: string
    /** One-line product subtitle shown under the name on the product page. */
    tagline: string
    description: string
    category: ApplianceCategory
    /** Brand label shown on the product page. */
    brand: string
    /** PHP, VAT-inclusive selling price — the only price SD pricing charges. */
    basePrice: number
    /** Pre-discount reference price, shown struck through; display only. */
    originalPrice: number | null
    /** Short selling-point tag, e.g. "Energy Saver". */
    badge: string | null
    /** Product photo: any URL or a local `/img/mconpinco/*` file. */
    imageUrl: string
    keyFeatures: string[]
    specs: ApplianceSpec[]
    warranty: string
    inclusions: string[]
}

/** Maps an SD product (division DIV_APPLIANCES) to the MCONPINCO storefront view. */
export function toApplianceProduct(record: SdProductRecord): ApplianceProduct {
    return {
        sku: record.sku,
        name: record.name,
        tagline: productAttribute(record, 'tagline', ''),
        description: record.description,
        category: record.category as ApplianceCategory,
        brand: productAttribute(record, 'brand', ''),
        basePrice: record.price,
        originalPrice:
            record.originalPrice !== null && record.originalPrice > record.price
                ? record.originalPrice
                : null,
        badge: record.badge,
        imageUrl: productImageSrc(record.imageUrl),
        keyFeatures: productAttribute<string[]>(record, 'keyFeatures', []),
        specs: productAttribute<ApplianceSpec[]>(record, 'specs', []),
        warranty: productAttribute(record, 'warranty', ''),
        inclusions: productAttribute<string[]>(record, 'inclusions', []),
    }
}
