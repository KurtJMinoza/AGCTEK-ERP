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
    salesOrgId: typeof RETAIL_DIVISION_ID
    popularity?: number
}

export type InventoryATP = {
    sku: string
    availableQuantity: number
    reservedQuantity: number
    physicalStock: number
}

export type CartItem = {
    product: RetailProduct
    quantity: number
    itemTotal: number
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

export type SalesOrderPayload = {
    customerId: string
    divisionId: typeof RETAIL_DIVISION_ID
    items: Array<{
        sku: string
        quantity: number
        unitPrice: number
        lineTotal: number
    }>
    shipping: SalesOrderShippingDetails
    totalAmount: number
}

export type RetailCatalogCategoryFilter =
    | 'all'
    | 'vitamins'
    | 'bags'
    | 'general'
