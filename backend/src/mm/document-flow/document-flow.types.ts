/** Canonical MM document types for the universal flow API. */
export const MM_DOCUMENT_FLOW_TYPES = [
    'PURCHASE_REQUISITION',
    'RFQ',
    'QUOTATION',
    'PURCHASE_ORDER',
    'ASN',
    'EXPECTED_RECEIPT',
    'RECEIVING_DOCUMENT',
    'GOODS_RECEIPT',
    'INSPECTION_LOT',
    'QUALITY_DECISION',
    'PUTAWAY_TASK',
    'RESERVATION',
    'ALLOCATION',
    'PICK_TASK',
    'PACK_SESSION',
    'GOODS_ISSUE',
    'STO',
    'TRANSFER_SHIPMENT',
    'TRANSFER_RECEIPT',
    'INVENTORY_TRANSACTION',
    'ACCOUNTING_EVENT',
] as const

export type MmDocumentFlowType = (typeof MM_DOCUMENT_FLOW_TYPES)[number]

export type DocumentFlowNode = {
    documentType: MmDocumentFlowType | string
    documentId: string
    status: string
    displayNumber: string
    createdAt: string
}

export type DocumentFlowResponse = {
    companyId: string
    upstream: DocumentFlowNode[]
    current: DocumentFlowNode
    downstream: DocumentFlowNode[]
}

/** Internal node with company scope for filtering. */
export type ScopedFlowNode = DocumentFlowNode & { companyId: string }

export type FlowGraph = {
    companyId: string
    current: ScopedFlowNode
    related: ScopedFlowNode[]
}
