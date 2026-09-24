export type StoTransferType =
    | 'BIN_TO_BIN'
    | 'WAREHOUSE_TO_WAREHOUSE'
    | 'BRANCH_TO_BRANCH'
    | 'PLANT_TO_PLANT'

export type StoStatus =
    | 'DRAFT'
    | 'SUBMITTED'
    | 'PENDING_APPROVAL'
    | 'APPROVED'
    | 'ALLOCATED'
    | 'PICKING'
    | 'DISPATCHED'
    | 'IN_TRANSIT'
    | 'PARTIALLY_RECEIVED'
    | 'FULLY_RECEIVED'
    | 'CANCELLED'
    | 'CLOSED'

export type StockTransferOrderLine = {
    id: string
    lineNumber: number
    materialId: string
    quantity: number
    uomId: string
    sourceBinId?: string | null
    destinationBinId?: string | null
    batchId?: string | null
    serialNumberId?: string | null
    allocatedQty: number
    dispatchedQty: number
    receivedQty: number
    status: string
    material?: {
        id: string
        materialCode: string
        materialName: string
        baseUomId?: string
    } | null
    sourceBin?: { id: string; code: string } | null
    destinationBin?: { id: string; code: string } | null
}

export type TransferShipment = {
    id: string
    shipmentNumber: string
    status: string
    dispatchedAt?: string | null
    dispatchedBy?: string | null
    lines?: Array<{ id: string; orderLineId: string; quantity: number }>
}

export type TransferReceipt = {
    id: string
    receiptNumber: string
    status: string
    receivedAt?: string | null
    receivedBy?: string | null
    lines?: Array<{
        id: string
        orderLineId: string
        quantity: number
        destinationBinId?: string | null
    }>
}

export type StockTransferOrder = {
    id: string
    orderNumber: string
    companyId: string
    transferType: StoTransferType
    sourceWarehouseId: string
    destinationWarehouseId: string
    status: StoStatus
    reservationHeaderId?: string | null
    requestedBy?: string | null
    approvedBy?: string | null
    submittedAt?: string | null
    approvedAt?: string | null
    closedAt?: string | null
    notes?: string | null
    postingDate: string
    createdAt: string
    updatedAt: string
    sourceWarehouse?: { id: string; code: string; name: string } | null
    destinationWarehouse?: { id: string; code: string; name: string } | null
    lines: StockTransferOrderLine[]
    shipments?: TransferShipment[]
    receipts?: TransferReceipt[]
}

export type StoListResponse = {
    data: StockTransferOrder[]
    total: number
    page: number
    pageSize: number
}

export type StoQueryParams = {
    page?: number
    pageSize?: number
    companyId?: string
    sourceWarehouseId?: string
    destinationWarehouseId?: string
    status?: StoStatus | string
    transferType?: StoTransferType | string
    search?: string
}

export type CreateStoLinePayload = {
    materialId: string
    quantity: number
    uomId: string
    sourceBinId?: string
    destinationBinId?: string
    batchId?: string
    serialNumberId?: string
}

export type CreateStoPayload = {
    companyId: string
    transferType: StoTransferType
    sourceWarehouseId: string
    destinationWarehouseId: string
    postingDate?: string
    requestedBy?: string
    notes?: string
    lines: CreateStoLinePayload[]
}

export type DispatchStoPayload = {
    dispatchedBy?: string
    lines?: Array<{ orderLineId: string; quantity: number }>
}

export type ReceiveStoPayload = {
    receivedBy?: string
    shipmentId?: string
    lines: Array<{
        orderLineId: string
        quantity: number
        destinationBinId?: string
    }>
}
