import { InventoryPostingService } from '../../inventory/inventory-posting.service'

export type InterWhLine = {
    id: string
    materialId: string
    quantity: number
    uomId: string
    sourceBinId?: string | null
    destinationBinId?: string | null
    batchId?: string | null
    serialNumberId?: string | null
}

/**
 * Canonical inter-warehouse transit posting (InventoryPostingService only).
 * Dispatch: source UNRESTRICTED OUT + dest IN_TRANSIT IN.
 * Receive: dest IN_TRANSIT OUT + dest UNRESTRICTED IN.
 */
export async function postInterWarehouseDispatch(params: {
    posting: InventoryPostingService
    companyId: string
    sourceWarehouseId: string
    destinationWarehouseId: string
    documentId: string
    sourceDocumentType: string
    sourceModule: string
    postingDate: string
    createdBy?: string
    lines: InterWhLine[]
    idempotencyPrefix: string
}) {
    const {
        posting,
        companyId,
        sourceWarehouseId,
        destinationWarehouseId,
        documentId,
        sourceDocumentType,
        sourceModule,
        postingDate,
        createdBy,
        lines,
        idempotencyPrefix,
    } = params

    for (const line of lines) {
        const qty = Number(line.quantity)
        if (qty <= 0) continue

        await posting.postTransaction({
            companyId,
            warehouseId: sourceWarehouseId,
            storageBinId: line.sourceBinId ?? undefined,
            materialId: line.materialId,
            batchId: line.batchId ?? undefined,
            serialNumberId: line.serialNumberId ?? undefined,
            stockStatus: 'UNRESTRICTED',
            movementType: 'TRANSFER_OUT',
            quantity: qty,
            uomId: line.uomId,
            postingDate,
            documentDate: postingDate,
            sourceModule,
            sourceDocumentType,
            sourceDocumentId: documentId,
            sourceDocumentLineId: line.id,
            createdBy,
            idempotencyKey: `${idempotencyPrefix}:${line.id}:out`,
        })

        await posting.postTransaction({
            companyId,
            warehouseId: destinationWarehouseId,
            materialId: line.materialId,
            batchId: line.batchId ?? undefined,
            serialNumberId: line.serialNumberId ?? undefined,
            stockStatus: 'IN_TRANSIT',
            movementType: 'TRANSFER_IN',
            quantity: qty,
            uomId: line.uomId,
            postingDate,
            documentDate: postingDate,
            sourceModule,
            sourceDocumentType,
            sourceDocumentId: documentId,
            sourceDocumentLineId: line.id,
            createdBy,
            idempotencyKey: `${idempotencyPrefix}:${line.id}:transit-in`,
        })
    }
}

export async function postInterWarehouseReceive(params: {
    posting: InventoryPostingService
    companyId: string
    destinationWarehouseId: string
    documentId: string
    sourceDocumentType: string
    sourceModule: string
    postingDate: string
    createdBy?: string
    line: InterWhLine
    receivedQty: number
    idempotencyKey: string
}) {
    const {
        posting,
        companyId,
        destinationWarehouseId,
        documentId,
        sourceDocumentType,
        sourceModule,
        postingDate,
        createdBy,
        line,
        receivedQty,
        idempotencyKey,
    } = params

    await posting.postTransaction({
        companyId,
        warehouseId: destinationWarehouseId,
        materialId: line.materialId,
        batchId: line.batchId ?? undefined,
        serialNumberId: line.serialNumberId ?? undefined,
        stockStatus: 'IN_TRANSIT',
        movementType: 'TRANSFER_OUT',
        quantity: receivedQty,
        uomId: line.uomId,
        postingDate,
        documentDate: postingDate,
        sourceModule,
        sourceDocumentType,
        sourceDocumentId: documentId,
        sourceDocumentLineId: line.id,
        createdBy,
        idempotencyKey: `${idempotencyKey}:transit-out`,
    })

    await posting.postTransaction({
        companyId,
        warehouseId: destinationWarehouseId,
        storageBinId: line.destinationBinId ?? undefined,
        materialId: line.materialId,
        batchId: line.batchId ?? undefined,
        serialNumberId: line.serialNumberId ?? undefined,
        stockStatus: 'UNRESTRICTED',
        movementType: 'TRANSFER_IN',
        quantity: receivedQty,
        uomId: line.uomId,
        postingDate,
        documentDate: postingDate,
        sourceModule,
        sourceDocumentType,
        sourceDocumentId: documentId,
        sourceDocumentLineId: line.id,
        createdBy,
        idempotencyKey: `${idempotencyKey}:unr-in`,
    })
}
