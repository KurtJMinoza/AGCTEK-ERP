import ErpAxiosBase from '@/services/axios/ErpAxiosBase'

const BASE = '/sd/returns'

export const SALES_RETURN_STATUSES = [
    'REQUESTED',
    'APPROVED',
    'REJECTED',
    'AWAITING_RETURN',
    'RECEIVED',
    'UNDER_INSPECTION',
    'RESTOCKED',
    'MARKED_DAMAGED',
    'SCRAPPED',
    'REFUNDED',
    'CLOSED',
    'CANCELLED',
] as const
export type SalesReturnStatus = (typeof SALES_RETURN_STATUSES)[number]

export const REFUND_STATUSES = [
    'NONE',
    'NOT_REQUIRED',
    'PENDING_REFUND',
    'APPROVED',
    'PAID',
    'FAILED',
] as const

export const REFUND_METHOD_LABEL: Record<string, string> = {
    CASH_REFUND: 'Cash refund',
    BANK_TRANSFER: 'Bank transfer',
    DIGITAL_WALLET: 'Digital wallet',
    STORE_CREDIT: 'Store credit',
}

export type CustomerReturnRequestRow = {
    id: string
    requestNumber: string
    status: string
    refundStatus: string
    reason: string | null
    conditionNote: string | null
    preferredResolution: string | null
    refundAmount: string | null
    branchId: string | null
    warehouseId: string | null
    invoiceNumber: string | null
    createdAt: string
    customerId: string
    refunds: Array<{
        id: string
        refundNumber: string
        amount: string
        status: string
        refundMethod: string | null
        isDemo: boolean
        creditMemo: {
            id: string
            creditMemoNumber: string
            amount: string
            status: string
        } | null
    }>
    lines: Array<{
        id: string
        salesOrderLineId: string
        quantity: string | number
        reason: string | null
        disposition: string | null
        salesOrderLine?: {
            productNameSnapshot: string | null
            productSkuSnapshot: string | null
            materialCodeSnapshot: string | null
            sku: string | null
        } | null
    }>
    salesOrder?: {
        orderNumber: string
        customerName: string | null
        status: string
        company?: { id: string; code: string; name: string } | null
    } | null
}

export type ListCustomerReturnsParams = {
    companyId: string
    status?: string
    refundStatus?: string
}

/** Admin action payloads — company scope is required server-side. */
export type ReturnActionPayload = { companyId: string; performedBy?: string }
export type RejectReturnPayload = ReturnActionPayload & { reason?: string }
export type InspectReturnPayload = ReturnActionPayload & {
    result?: string
    notes?: string
}

export const customerReturnRequestService = {
    list: (params: ListCustomerReturnsParams) =>
        ErpAxiosBase.get<CustomerReturnRequestRow[]>(BASE, { params }).then(
            (r) => r.data,
        ),

    approve: (id: string, data: ReturnActionPayload) =>
        ErpAxiosBase.post<CustomerReturnRequestRow>(
            `${BASE}/${encodeURIComponent(id)}/approve`,
            data,
        ).then((r) => r.data),

    reject: (id: string, data: RejectReturnPayload) =>
        ErpAxiosBase.post<CustomerReturnRequestRow>(
            `${BASE}/${encodeURIComponent(id)}/reject`,
            data,
        ).then((r) => r.data),

    receive: (id: string, data: ReturnActionPayload) =>
        ErpAxiosBase.post<CustomerReturnRequestRow>(
            `${BASE}/${encodeURIComponent(id)}/receive`,
            data,
        ).then((r) => r.data),

    inspect: (id: string, data: InspectReturnPayload) =>
        ErpAxiosBase.post<CustomerReturnRequestRow>(
            `${BASE}/${encodeURIComponent(id)}/inspect`,
            data,
        ).then((r) => r.data),

    markRestock: (id: string, data: ReturnActionPayload) =>
        ErpAxiosBase.post<CustomerReturnRequestRow>(
            `${BASE}/${encodeURIComponent(id)}/mark-restock`,
            data,
        ).then((r) => r.data),

    markDamaged: (id: string, data: ReturnActionPayload) =>
        ErpAxiosBase.post<CustomerReturnRequestRow>(
            `${BASE}/${encodeURIComponent(id)}/mark-damaged`,
            data,
        ).then((r) => r.data),

    markScrap: (id: string, data: ReturnActionPayload) =>
        ErpAxiosBase.post<CustomerReturnRequestRow>(
            `${BASE}/${encodeURIComponent(id)}/mark-scrap`,
            data,
        ).then((r) => r.data),

    markNeedsInspection: (id: string, data: ReturnActionPayload) =>
        ErpAxiosBase.post<CustomerReturnRequestRow>(
            `${BASE}/${encodeURIComponent(id)}/mark-needs-inspection`,
            data,
        ).then((r) => r.data),

    /** DEMO ONLY — creates the refund record (never a real gateway). */
    createRefund: (
        id: string,
        data: ReturnActionPayload & { refundMethod?: string },
    ) =>
        ErpAxiosBase.post<CustomerReturnRequestRow>(
            `${BASE}/${encodeURIComponent(id)}/refund`,
            data,
        ).then((r) => r.data),

    /** COD never collected → no refund payable. */
    refundNotRequired: (id: string, data: ReturnActionPayload) =>
        ErpAxiosBase.post<CustomerReturnRequestRow>(
            `${BASE}/${encodeURIComponent(id)}/refund/not-required`,
            data,
        ).then((r) => r.data),

    refundApprove: (id: string, data: ReturnActionPayload) =>
        ErpAxiosBase.post<CustomerReturnRequestRow>(
            `${BASE}/${encodeURIComponent(id)}/refund/approve`,
            data,
        ).then((r) => r.data),

    refundPay: (id: string, data: ReturnActionPayload) =>
        ErpAxiosBase.post<CustomerReturnRequestRow>(
            `${BASE}/${encodeURIComponent(id)}/refund/pay`,
            data,
        ).then((r) => r.data),

    refundFail: (id: string, data: ReturnActionPayload & { reason?: string }) =>
        ErpAxiosBase.post<CustomerReturnRequestRow>(
            `${BASE}/${encodeURIComponent(id)}/refund/fail`,
            data,
        ).then((r) => r.data),

    close: (id: string, data: ReturnActionPayload) =>
        ErpAxiosBase.post<CustomerReturnRequestRow>(
            `${BASE}/${encodeURIComponent(id)}/close`,
            data,
        ).then((r) => r.data),
}