import {
    RETAIL_DIVISION_ID,
    type RetailProduct,
    type RetailProductCategory,
    type RetailProductReview,
} from '@/types/storefront/retail'
import {
    productAttribute,
    type SdProductRecord,
} from '@/modules/sd/services/productCatalogService'
import { productImageSrc } from '@/utils/productImage'

/** Maps an SD product (division DIV_RETAIL) to the AWIC retail view used by the POS. */
export function toRetailProduct(record: SdProductRecord): RetailProduct {
    return {
        itemId: productAttribute(record, 'itemId', record.id),
        sku: record.sku,
        name: record.name,
        description: record.description,
        details: productAttribute(record, 'details', record.description),
        features: productAttribute<string[]>(record, 'features', []),
        reviews: productAttribute<RetailProductReview[]>(record, 'reviews', []),
        basePrice: record.price,
        category: record.category as RetailProductCategory,
        imageUrl: productImageSrc(record.imageUrl),
        salesOrgId: RETAIL_DIVISION_ID,
        popularity: productAttribute<number | undefined>(
            record,
            'popularity',
            undefined,
        ),
    }
}
