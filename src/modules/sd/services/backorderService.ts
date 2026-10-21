import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import { toApiError } from './apiError'

export type BackorderReason =
    | 'STOCK_SHORTAGE'
    | 'AWAITING_RESERVATION'
    | 'NO_MATERIAL'

export type Backorder = {
    /** Sales order line id. */
    id: string
    salesOrderId: string
    orderNumber: string
    customerId: string
    customerName: string | null
    customerCode: string | null
    customerEmail: string | null
    customerPhone: string | null
    divisionId: string | null
    sku: string | null
    productName: string
    uom: string | null
    orderedQty: number
    openQty: number
    openValue: number
    currency: string
    orderDate: string
    ageDays: number
    critical: boolean
    reason: BackorderReason
    expectedRestockDate: string | null
}

export type BackorderListResult = {
    data: Backorder[]
    total: number
    page: number
    pageSize: number
    summary: {
        totalBackorderedValue: number
        affectedOrders: number
        criticalShortages: number
        currency: string
    }
    filters: {
        customers: Array<{ id: string; name: string }>
        divisions: string[]
    }
}

export async function listBackorders(params: {
    customerId?: string
    divisionId?: string
    page?: number
    pageSize?: number
}): Promise<BackorderListResult> {
    try {
        const { data } = await ErpAxiosBase.get<BackorderListResult>(
            '/sd/backorders',
            {
                params: {
                    ...params,
                    customerId: params.customerId || undefined,
                    divisionId: params.divisionId || undefined,
                },
            },
        )
        return data
    } catch (error) {
        throw toApiError(error, 'Unable to load backorders')
    }
}
