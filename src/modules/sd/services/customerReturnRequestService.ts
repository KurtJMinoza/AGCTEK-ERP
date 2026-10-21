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

/** COD Customer Return commercial choices (Replace = orange, Refund = red). */
export const RESOLUTION_LABEL: Record<string, string> = {
    REPLACEMENT: 'Replace request',
    REFUND: 'Refund request',
    STORE_CREDIT: 'Store credit',
}

/** StatusBadge tones: REPLACEMENT → warning (amber/orange), REFUND → danger (red). */
export const RESOLUTION_TONE: Record<
    string,
    'success' | 'default' | 'warning' | 'danger' | 'info'
> = {
    REPLACEMENT: 'warning',
    REFUND: 'danger',
    STORE_CREDIT: 'info',
}

export const RETURN_STATUS_TONE: Record<
    string,
    'success' | 'default' | 'warning' | 'danger' | 'info'
> = {
    REQUESTED: 'warning',
    APPROVED: 'info',
    REJECTED: 'danger',
    AWAITING_RETURN: 'warning',
    RECEIVED: 'info',
    UNDER_INSPECTION: 'warning',
    RESTOCKED: 'success',
    MARKED_DAMAGED: 'danger',
    SCRAPPED: 'danger',
    REFUNDED: 'success',
    CLOSED: 'default',
    CANCELLED: 'default',
}

/** Refund settlement waits on finance (FICO); the demo payment step is opt-in. */
export const DEMO_REFUND_PAYMENT_ENABLED =
    process.env.NEXT_PUBLIC_SD_DEMO_REFUND_PAYMENT === 'true'

/** Refund states as shown to staff: approved refunds wait on finance until FICO pays them. */
export const REFUND_STATUS_LABEL: Record<string, string> = {
    REQUESTED: 'Requested',
    NONE: 'Not started',
    NOT_REQUIRED: 'Not required',
    PENDING_REFUND: 'Pending finance',
    APPROVED: 'Approved · awaiting finance',
    PAID: 'Paid',
    FAILED: 'Failed',
}

/** True when cash was never collected — Refund/Replace CTAs must stay off. */
export function isCommercialResolutionBlocked(refundStatus: string): boolean {
    return refundStatus === 'NOT_REQUIRED'
}

/**
 * Which column carries the request's state. A Refund request lives under
 * Refund Status (REQUESTED until the refund record exists); a Replace request
 * lives under Return Status and has no refund. `null` = not applicable.
 */
export function displayStatuses(
    row: Pick<
        CustomerReturnRequestRow,
        'status' | 'refundStatus' | 'preferredResolution'
    >,
): { returnStatus: string | null; refundStatus: string | null } {
    if (row.preferredResolution === 'REFUND' && row.refundStatus === 'NONE') {
        return {
            returnStatus: row.status === 'REQUESTED' ? null : row.status,
            refundStatus: 'REQUESTED',
        }
    }
    if (row.preferredResolution === 'REPLACEMENT') {
        return { returnStatus: row.status, refundStatus: null }
    }
    return { returnStatus: row.status, refundStatus: row.refundStatus }
}

export type CustomerReturnRequestRow = {
    id: string
    requestNumber: string
    status: string
    refundStatus: string
    reason: string | null
    conditionNote: string | null
    preferredResolution: string | null
    /** Child SO opened on approve when resolution is REPLACEMENT. */
    replacementSalesOrderId: string | null
    /** CRM case (storefront returns): approve / reject happen on the ticket, not here. */
    crmTicket?: { id: string } | null
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
        paymentMethod?: string | null
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
export type ApproveReturnPayload = ReturnActionPayload & {
    approvedBy?: string
    preferredResolution?: 'REFUND' | 'REPLACEMENT' | 'STORE_CREDIT'
}
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

    approve: (id: string, data: ApproveReturnPayload) =>
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