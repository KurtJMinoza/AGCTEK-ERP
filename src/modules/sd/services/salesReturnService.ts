import ErpAxiosBase from '@/services/axios/ErpAxiosBase'

const BASE = '/sd/sales-returns'

export type SdSalesReturnStatus =
    | 'REQUESTED'
    | 'AUTHORIZED'
    | 'REJECTED'
    | 'CANCELLED'

export type SdSalesReturnLine = {
    id: string
    lineNumber: number
    salesOrderLineId: string
    materialId: string | null
    sku: string | null
    description: string | null
    quantity: string | number
    uomId: string | null
    disposition: string | null
}

export type SdSalesReturn = {
    id: string
    returnNumber: string
    companyId: string
    salesOrderId: string
    customerId: string
    warehouseId: string | null
    damageReportId: string | null
    reason: string | null
    notes: string | null
    status: SdSalesReturnStatus
    createdAt: string
    updatedAt: string
    lines: SdSalesReturnLine[]
    salesOrder?: {
        id: string
        orderNumber: string
        status: string
        channel?: string
        source?: string
        createdAt?: string
    } | null
    customer?: {
        id: string
        customerNumber: string
        companyName: string
        contactName: string | null
    } | null
    /** SCM damage report that originated this return, when it came from a delivery damage. */
    damageReport?: {
        id: string
        reference: string
        shipmentId: string
        status: string
    } | null
    /** MM customer return intake opened from this return, once handed off. */
    customerReturn?: {
        id: string
        returnNumber: string
        status: string
    } | null
}

export type Paginated<T> = {
    data: T[]
    total: number
    page: number
    pageSize: number
}

export type InitiateMmIntakeResult = {
    created: boolean
    salesReturnNumber: string
    customerReturn: { id: string; returnNumber: string; status: string }
}

export type ListSalesReturnsParams = {
    companyId?: string
    status?: string
    salesOrderId?: string
    page?: number
    pageSize?: number
}

export const salesReturnService = {
    list: (params?: ListSalesReturnsParams) =>
        ErpAxiosBase.get<Paginated<SdSalesReturn>>(BASE, { params }).then(
            (r) => r.data,
        ),

    get: (id: string) =>
        ErpAxiosBase.get<SdSalesReturn>(
            `${BASE}/${encodeURIComponent(id)}`,
        ).then((r) => r.data),

    authorize: (id: string) =>
        ErpAxiosBase.post<SdSalesReturn>(
            `${BASE}/${encodeURIComponent(id)}/authorize`,
            {},
        ).then((r) => r.data),

    reject: (id: string, reason?: string) =>
        ErpAxiosBase.post<SdSalesReturn>(
            `${BASE}/${encodeURIComponent(id)}/reject`,
            reason ? { reason } : {},
        ).then((r) => r.data),

    cancel: (id: string, reason?: string) =>
        ErpAxiosBase.post<SdSalesReturn>(
            `${BASE}/${encodeURIComponent(id)}/cancel`,
            reason ? { reason } : {},
        ).then((r) => r.data),

    /** SD → MM handoff: opens (idempotently) the MM customer return intake. */
    initiateMmIntake: (
        id: string,
        data?: {
            warehouseId?: string
            remarks?: string
            lines?: Array<{
                salesReturnLineId: string
                batchId?: string
                serialNumberId?: string
                storageBinId?: string
                unitCost?: number
            }>
        },
    ) =>
        ErpAxiosBase.post<InitiateMmIntakeResult>(
            `${BASE}/${encodeURIComponent(id)}/initiate-intake`,
            data ?? {},
        ).then((r) => r.data),
}
