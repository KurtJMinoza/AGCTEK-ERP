export interface ListMeta {
    total: number
    page: number
    limit: number
    totalPages: number
}

export interface SupplierInvoice {
    id: string
    invoiceNumber: string
    companyId: string
    supplierId: string
    purchaseOrderId: string
    currencyId?: string | null
    invoiceDate: string
    postingDate?: string | null
    taxAmount: string | number
    totalAmount: string | number
    status: string
    matchStatus?: string | null
    paymentEligible: boolean
    approvedBy?: string | null
    approvedAt?: string | null
    matchedAt?: string | null
    remarks?: string | null
    createdAt: string
    supplier?: { id: string; supplierCode: string; supplierName: string }
    purchaseOrder?: { id: string; poNumber: string }
    currency?: { id: string; code: string } | null
    lines?: SupplierInvoiceLine[]
    exceptions?: MatchException[]
    _count?: { lines: number; exceptions: number }
}

export interface SupplierInvoiceLine {
    id: string
    lineNumber: number
    materialId: string
    purchaseOrderLineId: string
    uomId: string
    invoicedQuantity: string | number
    unitPrice: string | number
    taxAmount: string | number
    lineTotal: string | number
    matchedQuantity: string | number
    matchStatus: string
    quantityVariance?: string | number
    priceVariance?: string | number
    taxVariance?: string | number
    material?: { materialCode: string; materialName: string }
    receipts?: Array<{
        id: string
        goodsReceiptLineId: string
        allocatedQuantity: string | number
        goodsReceiptLine?: {
            quantity: string | number
            receipt?: { documentNumber: string; status: string }
        }
    }>
}

export interface MatchException {
    id: string
    invoiceId: string
    invoiceLineId?: string | null
    purchaseOrderId: string
    varianceType: string
    severity: string
    message: string
    status: string
    paymentBlocked: boolean
    poSnapshot?: unknown
    grSnapshot?: unknown
    invoiceSnapshot?: unknown
    createdAt: string
    invoice?: {
        invoiceNumber: string
        supplier?: { supplierName: string }
        purchaseOrder?: { poNumber: string }
    }
    purchaseOrder?: { poNumber: string }
}
