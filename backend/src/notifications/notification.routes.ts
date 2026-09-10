type RouteBuilder = (entityId: string) => string

const ENTITY_DETAIL_ROUTES: Record<string, RouteBuilder> = {
    PURCHASE_ORDER: (id) => `/modules/mm/procurement/purchase-orders/${id}`,
    PURCHASE_REQUISITION: (id) => `/modules/mm/procurement/purchase-requisitions/${id}`,
    RFQ: (id) => `/modules/mm/procurement/rfqs/${id}`,
    MATERIAL: (id) => `/modules/mm/material-master/materials-skus/${id}`,
    MM_MATERIAL: (id) => `/modules/mm/material-master/materials-skus/${id}`,
    SUPPLIER: (id) => `/modules/mm/supplier-management/supplier-master/${id}`,
    EXPECTED_RECEIPT: (id) => `/modules/mm/receiving/expected-receipts/${id}`,
}

export function resolveEntityDetailPath(entityType: string, entityId: string): string {
    const builder = ENTITY_DETAIL_ROUTES[entityType.toUpperCase()]
    return builder ? builder(entityId) : ''
}
