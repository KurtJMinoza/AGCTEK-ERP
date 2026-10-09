import {
    type RetailProduct,
    type RetailProductCategory,
    type RetailProductReview,
} from '@/types/storefront/retail'
import {
    productAttribute,
    productImageGallery,
    type SdProductRecord,
} from '@/modules/sd/services/productCatalogService'
import { productImageSrc } from '@/utils/productImage'

/** Maps an SD product (division DIV_RETAIL) to the AWIC retail view used by the POS. */
export function toRetailProduct(record: SdProductRecord): RetailProduct {
    const images = productImageGallery(record).map((url) =>
        productImageSrc(url),
    )
    return {
        productId: record.id,
        itemId: productAttribute(record, 'itemId', record.id),
        sku: record.sku,
        name: record.name,
        description: record.description,
        details: productAttribute(record, 'details', record.description),
        features: productAttribute<string[]>(record, 'features', []),
        reviews: productAttribute<RetailProductReview[]>(record, 'reviews', []),
        basePrice: record.price,
        category: record.category as RetailProductCategory,
        imageUrl: images[0] ?? productImageSrc(record.imageUrl),
        imageGallery: images,
        salesOrgId: record.divisionId,
        popularity: productAttribute<number | undefined>(
            record,
            'popularity',
            undefined,
        ),
    }
}
