export type PrStatus =
    | 'DRAFT'
    | 'SUBMITTED'
    | 'PENDING_APPROVAL'
    | 'APPROVED'
    | 'REJECTED'
    | 'RETURNED'
    | 'PARTIALLY_CONVERTED'
    | 'FULLY_CONVERTED'
    | 'CANCELLED'
    | 'CLOSED'

export interface PrLine {
    id: string
    requisitionId: string
    materialId: string
    material?: { id: string; materialCode: string; materialName: string } | null
    description: string
    requestedQuantity: number | string
    uomId: string
    uom?: { id: string; code: string; name: string } | null
    estimatedUnitPrice: number | string
    estimatedTotal: number | string
    requiredDate: string
    warehouseId?: string | null
    warehouse?: { id: string; name: string; code: string } | null
    preferredSupplierId?: string | null
    preferredSupplier?: { id: string; supplierCode: string; supplierName: string } | null
    convertedQty: number | string
    remarks?: string | null
}

export interface PrConversion {
    id: string
    requisitionId: string
    lineId: string
    targetType: 'RFQ' | 'PO' | string
    targetId?: string | null
    convertedQty: number | string
    convertedBy?: string | null
    convertedAt: string
}

export interface ApprovalTask {
    id: string
    instanceId: string
    stepNumber: number
    approverRole: string
    approverId?: string | null
    status: string
    comment?: string | null
    decidedBy?: string | null
    decidedAt?: string | null
}

export interface WorkflowInstance {
    id: string
    entityType: string
    entityId: string
    workflowId: string
    status: string
    initiatedBy?: string | null
    initiatedAt: string
    decidedAt?: string | null
    tasks?: ApprovalTask[]
    workflow?: { id: string; code: string; name: string; approverRole: string } | null
}

export interface PurchaseRequisition {
    id: string
    requisitionNumber: string
    companyId: string
    company?: { id: string; name: string } | null
    businessUnitId?: string | null
    branchId?: string | null
    departmentId?: string | null
    costCenterId?: string | null
    projectId?: string | null
    requesterId: string
    requiredDate: string
    purpose: string
    status: PrStatus
    approvedBy?: string | null
    rejectionReason?: string | null
    returnedReason?: string | null
    submittedAt?: string | null
    approvedAt?: string | null
    createdBy?: string | null
    createdAt: string
    updatedAt: string
    workflowInstanceId?: string | null
    workflowInstance?: WorkflowInstance | null
    lines: PrLine[]
    conversions?: PrConversion[]
}

export interface PrAudit {
    id: string
    requisitionId: string
    action: string
    field?: string | null
    oldValue?: string | null
    newValue?: string | null
    performedBy?: string | null
    performedAt: string
    details?: any
}

export interface PrListResponse {
    data: PurchaseRequisition[]
    total: number
    page: number
    pageSize: number
}

export interface PrQueryParams {
    status?: string
    requesterId?: string
    departmentId?: string
    search?: string
    page?: number
    pageSize?: number
}

export function prTotalAmount(pr: PurchaseRequisition): number {
    return (pr.lines ?? []).reduce((sum, l) => sum + Number(l.estimatedTotal || 0), 0)
}

export function prRemainingQty(line: PrLine): number {
    return Math.max(0, Number(line.requestedQuantity) - Number(line.convertedQty || 0))
}

/* ─── RFQ & Supplier Quotations (MM-07) ─── */

export type RfqStatus =
    | 'DRAFT'
    | 'ISSUED'
    | 'PARTIALLY_RESPONDED'
    | 'RESPONDED'
    | 'EVALUATION'
    | 'AWARDED'
    | 'CLOSED'
    | 'CANCELLED'

export type QuotationStatus =
    | 'DRAFT'
    | 'SUBMITTED'
    | 'WITHDRAWN'
    | 'EXPIRED'
    | 'SELECTED'

export type RfqSupplierResponseStatus =
    | 'INVITED'
    | 'RESPONDED'
    | 'DECLINED'
    | 'EXPIRED'

export interface MmRfqLine {
    id: string
    rfqId: string
    lineNumber: number
    materialId: string
    material?: { id: string; materialCode: string; materialName: string } | null
    quantity: number | string
    uomId: string
    uom?: { id: string; code: string; name: string } | null
    requiredDate?: string | null
    specifications?: string | null
    prLineId?: string | null
}

export interface MmRfqSupplier {
    id: string
    rfqId: string
    supplierId: string
    supplier?: {
        id: string
        supplierCode: string
        supplierName: string
        status?: string
    } | null
    invitedAt: string
    responseStatus: RfqSupplierResponseStatus | string
    respondedAt?: string | null
    notes?: string | null
}

export interface MmSupplierQuotationLine {
    id: string
    quotationId: string
    rfqLineId?: string | null
    materialId: string
    material?: { id: string; materialCode: string; materialName: string } | null
    quantity: number | string
    uomId: string
    uom?: { id: string; code: string; name?: string } | null
    unitPrice: number | string
    discount: number | string
    tax: number | string
    lineTotal: number | string
    leadTimeDays?: number | null
    moq?: number | string | null
    warranty?: string | null
    notes?: string | null
}

export interface MmSupplierQuotation {
    id: string
    quotationNumber: string
    rfqId: string
    rfq?: {
        id: string
        rfqNumber: string
        status: RfqStatus | string
        responseDeadline?: string
    } | null
    supplierId: string
    supplier?: { id: string; supplierCode: string; supplierName: string } | null
    validityDate: string
    currencyId?: string | null
    currency?: { id: string; code: string; symbol?: string; name?: string } | null
    paymentTermsId?: string | null
    paymentTerms?: { id: string; code: string; name: string; dueDays?: number } | null
    deliveryTerms?: string | null
    freight: number | string
    tax: number | string
    total: number | string
    status: QuotationStatus | string
    qualityScore?: number | string | null
    supplierScore?: number | string | null
    notes?: string | null
    submittedAt?: string | null
    createdBy?: string | null
    createdAt: string
    updatedAt: string
    lines: MmSupplierQuotationLine[]
}

export interface MmRfqAward {
    id: string
    rfqId: string
    supplierId: string
    supplier?: { id: string; supplierCode: string; supplierName: string } | null
    quotationId?: string | null
    quotation?: { id: string; quotationNumber: string; total?: number | string } | null
    reason: string
    evaluatedBy?: string | null
    evaluatedAt: string
    autoSelected: boolean
    createdAt: string
}

export interface MmRfqAudit {
    id: string
    rfqId: string
    action: string
    field?: string | null
    oldValue?: string | null
    newValue?: string | null
    performedBy?: string | null
    performedAt: string
    details?: unknown
}

export interface MmRfq {
    id: string
    rfqNumber: string
    companyId: string
    company?: { id: string; code?: string; name: string } | null
    buyerId: string
    issueDate?: string | null
    responseDeadline: string
    currencyId?: string | null
    currency?: { id: string; code: string; name?: string; symbol?: string } | null
    status: RfqStatus
    purpose?: string | null
    notes?: string | null
    autoSelectCheapest: boolean
    purchaseRequisitionId?: string | null
    purchaseRequisition?: {
        id: string
        requisitionNumber: string
        status?: string
    } | null
    createdBy?: string | null
    createdAt: string
    updatedAt: string
    lines: MmRfqLine[]
    invitedSuppliers?: MmRfqSupplier[]
    quotations?: MmSupplierQuotation[]
    awards?: MmRfqAward[]
}

export interface MmRfqListResponse {
    data: MmRfq[]
    total: number
    page: number
    pageSize: number
}

export interface MmRfqQueryParams {
    status?: string
    search?: string
    page?: number
    pageSize?: number
}

export interface MmQuotationListResponse {
    data: MmSupplierQuotation[]
    total: number
    page: number
    pageSize: number
}

export interface MmQuotationQueryParams {
    rfqId?: string
    supplierId?: string
    status?: string
    search?: string
    page?: number
    pageSize?: number
}

export interface RfqComparisonLine {
    id: string
    rfqLineId?: string | null
    materialId: string
    materialCode?: string
    materialName?: string
    quantity: number
    unitPrice: number
    discount: number
    tax: number
    lineTotal: number
    leadTimeDays?: number | null
    moq?: number | null
    warranty?: string | null
}

export interface RfqComparisonRow {
    quotationId: string
    quotationNumber: string
    supplierId: string
    supplierCode: string
    supplierName: string
    status: QuotationStatus | string
    expired: boolean
    validityDate: string
    currency?: { id: string; code: string; symbol?: string } | null
    paymentTerms?: { id: string; code: string; name: string; dueDays?: number } | null
    deliveryTerms?: string | null
    freight: number
    tax: number
    total: number
    landedCost?: number
    avgUnitPrice: number
    avgLeadTimeDays: number | null
    maxMoq: number | null
    qualityScore: number | null
    supplierScore: number | null
    lineCount: number
    lines: RfqComparisonLine[]
}

export interface RfqComparisonResponse {
    rfq: {
        id: string
        rfqNumber: string
        status: RfqStatus | string
        autoSelectCheapest: boolean
        responseDeadline: string
        lines: MmRfqLine[]
    }
    quotations: RfqComparisonRow[]
    cheapestQuotationId: string | null
    awardHint: string
}

/* ─── Purchase Order (MM-08) ─── */

export type PoStatus =
    | 'DRAFT'
    | 'PENDING_APPROVAL'
    | 'APPROVED'
    | 'SENT'
    | 'PARTIALLY_RECEIVED'
    | 'FULLY_RECEIVED'
    | 'CLOSED'
    | 'CANCELLED'
    | 'REJECTED'

export interface MmPurchaseOrderLine {
    id: string
    purchaseOrderId: string
    lineNumber: number
    materialId: string
    material?: {
        id: string
        materialCode: string
        materialName: string
        materialCategoryId?: string | null
    } | null
    description: string
    quantity: number | string
    uomId: string
    uom?: { id: string; code: string; name: string } | null
    unitPrice: number | string
    discount: number | string
    tax: number | string
    freight: number | string
    lineTotal: number | string
    requiredDate?: string | null
    expectedDeliveryDate?: string | null
    warehouseId?: string | null
    warehouse?: { id: string; name: string; code: string } | null
    storageBinId?: string | null
    storageBin?: { id: string; code: string } | null
    costCenterId?: string | null
    projectId?: string | null
    receivedQuantity: number | string
    invoicedQuantity: number | string
    prLineId?: string | null
    rfqLineId?: string | null
    quotationLineId?: string | null
    remarks?: string | null
}

export interface MmPurchaseOrderAttachment {
    id: string
    purchaseOrderId: string
    fileName: string
    fileUrl?: string | null
    storageKey?: string | null
    uploadedBy?: string | null
    uploadedAt: string
}

export interface MmPurchaseOrder {
    id: string
    poNumber: string
    companyId: string
    company?: { id: string; name: string } | null
    branchId?: string | null
    supplierId: string
    supplier?: { id: string; supplierCode: string; supplierName: string } | null
    buyerId: string
    currencyId?: string | null
    currency?: { id: string; code: string; name?: string } | null
    paymentTermsId?: string | null
    paymentTerms?: { id: string; code: string; name: string } | null
    deliveryTerms?: string | null
    warehouseId?: string | null
    warehouse?: { id: string; code: string; name: string } | null
    expectedDeliveryDate?: string | null
    status: PoStatus | string
    totalAmount: number | string
    purchaseRequisitionId?: string | null
    purchaseRequisition?: { id: string; requisitionNumber: string } | null
    rfqId?: string | null
    rfq?: { id: string; rfqNumber: string } | null
    quotationId?: string | null
    quotation?: { id: string; quotationNumber: string } | null
    awardId?: string | null
    award?: { id: string } | null
    overDeliveryPctOverride?: number | string | null
    underDeliveryPctOverride?: number | string | null
    priceTolerancePctOverride?: number | string | null
    quantityTolerancePctOverride?: number | string | null
    approvedBy?: string | null
    approvedAt?: string | null
    rejectionReason?: string | null
    returnedReason?: string | null
    submittedAt?: string | null
    sentAt?: string | null
    closedAt?: string | null
    cancelledAt?: string | null
    cancelReason?: string | null
    createdBy?: string | null
    createdAt: string
    updatedAt: string
    workflowInstanceId?: string | null
    workflowInstance?: WorkflowInstance | null
    lines: MmPurchaseOrderLine[]
    attachments?: MmPurchaseOrderAttachment[]
    goodsReceipts?: Array<{
        id: string
        documentNumber: string
        status: string
        postingDate?: string
    }>
}

export interface MmPurchaseOrderAudit {
    id: string
    purchaseOrderId: string
    action: string
    field?: string | null
    oldValue?: string | null
    newValue?: string | null
    performedBy?: string | null
    performedAt: string
    details?: unknown
}

export interface PoDocumentFlow {
    purchaseOrder: { id: string; number: string; status: string }
    purchaseRequisition: { id: string; number: string } | null
    rfq: { id: string; number: string } | null
    quotation: { id: string; number: string } | null
    award: { id: string } | null
    goodsReceipts: Array<{
        id: string
        number: string
        status: string
        postingDate?: string
    }>
}

export interface MmPoToleranceConfig {
    id?: string
    companyId: string
    overDeliveryPct: number | string
    underDeliveryPct: number | string
    priceTolerancePct: number | string
    quantityTolerancePct: number | string
}

export interface PoListResponse {
    data: MmPurchaseOrder[]
    total: number
    page: number
    pageSize: number
}

export interface PoQueryParams {
    status?: string
    supplierId?: string
    buyerId?: string
    companyId?: string
    search?: string
    page?: number
    pageSize?: number
}

export function poOpenQty(line: MmPurchaseOrderLine): number {
    return Math.max(0, Number(line.quantity) - Number(line.receivedQuantity || 0))
}
