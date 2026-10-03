import {
    RETAIL_DIVISION_ID,
    type CartItem,
    type InventoryATP,
    type RetailProduct,
    type RetailProductCategory,
    type RetailProductReview,
    type SalesOrderShippingDetails,
} from '@/types/storefront/retail'
import {
    processEcommerceOrder,
    type EcommerceOrderResult,
    type PricingItem,
} from '@/modules/sd/services/ecommerceService'
import {
    fetchStorefrontAvailability,
    productAttribute,
    productImageGallery,
    type SdProductRecord,
} from '@/modules/sd/services/productCatalogService'
import { useProductCatalogStore } from '@/modules/sd/store/useProductCatalogStore'
import { productImageSrc } from '@/utils/productImage'
/** Maps an SD product (division DIV_RETAIL) to the AWIC storefront view. */
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
        salesOrgId: RETAIL_DIVISION_ID,
        popularity: productAttribute<number | undefined>(
            record,
            'popularity',
            undefined,
        ),
    }
}

const loadRetailCatalog = () =>
    useProductCatalogStore.getState().ensureLoaded(RETAIL_DIVISION_ID)

export async function fetchRetailProducts(): Promise<RetailProduct[]> {
    return (await loadRetailCatalog()).map(toRetailProduct)
}

export async function fetchRetailProductBySku(
    sku: string,
): Promise<RetailProduct | null> {
    const wanted = sku.trim().toLowerCase()
    const record = (await loadRetailCatalog()).find(
        (item) => item.sku.toLowerCase() === wanted,
    )
    return record ? toRetailProduct(record) : null
}

/** Commercial ATP from SD ↔ MM (replaces mock storefront stock). */
export async function checkStockATP(sku: string): Promise<InventoryATP> {
    try {
        return await fetchStorefrontAvailability(RETAIL_DIVISION_ID, sku)
    } catch {
        return {
            sku,
            availableQuantity: 0,
            reservedQuantity: 0,
            physicalStock: 0,
            ledgerAvailable: 0,
            state: 'OUT_OF_STOCK',
        }
    }
}

export type SubmitSalesOrderInput = {
    customerId: string
    items: CartItem[]
    shipping: SalesOrderShippingDetails
    discountCode?: string | null
}

export const toPricingItems = (items: CartItem[]): PricingItem[] =>
    items.map((item) => ({ sku: item.product.sku, quantity: item.quantity }))

export async function submitSalesOrder(
    input: SubmitSalesOrderInput,
): Promise<EcommerceOrderResult> {
    return processEcommerceOrder({
        customerId: input.customerId,
        items: toPricingItems(input.items),
        shipping: input.shipping,
        discountCode: input.discountCode || undefined,
    })
}
