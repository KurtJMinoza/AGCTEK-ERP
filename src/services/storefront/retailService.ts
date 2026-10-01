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
    productAttribute,
    type SdProductRecord,
} from '@/modules/sd/services/productCatalogService'
import { useProductCatalogStore } from '@/modules/sd/store/useProductCatalogStore'
import { productImageSrc } from '@/utils/productImage'

/** Maps an SD product (division DIV_RETAIL) to the AWIC storefront view. */
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

/** Mock ATP until MM availability is wired to the storefront. */
const SOLD_OUT_SKUS = new Set(['VIT-C-1000'])

const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
        setTimeout(resolve, ms)
    })

export async function checkStockATP(sku: string): Promise<InventoryATP> {
    await sleep(120)
    if (SOLD_OUT_SKUS.has(sku)) {
        return { sku, availableQuantity: 0, reservedQuantity: 2, physicalStock: 0 }
    }
    const seed = [...sku].reduce((sum, char) => sum + char.charCodeAt(0), 0)
    const available = 40 + (seed % 50)
    return {
        sku,
        availableQuantity: available,
        reservedQuantity: 2,
        physicalStock: available + 2,
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
