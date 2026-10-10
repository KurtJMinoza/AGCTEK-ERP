export const RETAIL_DIVISION_ID = 'DIV_RETAIL' as const

export type RetailProductCategory =
    | 'Vitamins'
    | 'Bags'
    | 'Accessories'
    | 'General Goods'

export type RetailProductReview = {
    id: string
    author: string
    rating: number
    title: string
    body: string
    date: string
}

export type RetailProduct = {
    productId: string
    itemId: string
    sku: string
    name: string
    description: string
    /** Longer product story shown on the detail page */
    details: string
    features: string[]
    reviews: RetailProductReview[]
    basePrice: number
    category: RetailProductCategory
    imageUrl: string
    imageGallery: string[]
    salesOrgId: string
    popularity?: number
}

export type InventoryATP = {
    sku: string
    /** Commercial ATP (Product Catalog “Stock available”). */
    availableQuantity: number
    reservedQuantity: number
    /** Company on-hand across warehouses (MM ledger). */
    physicalStock: number
    /** Company available across warehouses (MM ledger). */
    ledgerAvailable?: number
    state?:
        | 'IN_STOCK'
        | 'LOW_STOCK'
        | 'OUT_OF_STOCK'
        | 'NOT_MAPPED'
        | 'NON_INVENTORY'
}

/** Prices are not stored on the cart; SD pricing computes all totals. */
export type CartItem = {
    product: RetailProduct
    quantity: number
}

export type SalesOrderShippingDetails = {
    fullName: string
    email: string
    phone: string
    addressLine1: string
    city: string
    region: string
    postalCode: string
    country: string
}

export type RetailCatalogCategoryFilter =
    | 'all'
    | 'vitamins'
    | 'bags'
    | 'general'
