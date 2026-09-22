export type DocumentFlowNode = {
    documentType: string
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
