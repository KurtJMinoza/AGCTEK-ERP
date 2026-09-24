import { Injectable } from '@nestjs/common'
import { InventoryPostingService } from './inventory-posting.service'
import { postingKey } from '../common/idempotency.util'
import {
    PostAdjustmentDto,
    PostIssueDto,
    PostReceiptDto,
    PostTransferDto,
} from './dto/inventory-operation.dto'
import { PostTransactionDto } from './dto/post-transaction.dto'

@Injectable()
export class InventoryOperationService {
    constructor(private posting: InventoryPostingService) {}

    postReceipt(dto: PostReceiptDto) {
        return this.posting.postTransaction(this.toPostDto(dto, 'RECEIPT'))
    }

    postIssue(dto: PostIssueDto) {
        return this.posting.postTransaction({
            ...this.toPostDto(dto, 'ISSUE'),
            stockCheckMode: dto.stockCheckMode,
            releaseReservedQuantity: dto.releaseReservedQuantity,
        })
    }

    async postTransfer(dto: PostTransferDto) {
        const suffix = dto.idempotencyKey ?? dto.sourceDocumentLineId ?? 'xfer'
        const base = this.toPostDto(dto, 'TRANSFER_OUT')
        const outKey = postingKey('xfer', suffix, undefined, 'out')
        const inKey = postingKey('xfer', suffix, undefined, 'in')

        return this.posting.postTransferPair(
            {
                ...base,
                movementType: 'TRANSFER_OUT',
                storageBinId: dto.sourceBinId ?? dto.storageBinId,
                sourceBinId: dto.sourceBinId ?? dto.storageBinId,
                idempotencyKey: dto.idempotencyKey ? `${dto.idempotencyKey}:out` : outKey,
            },
            {
                ...base,
                warehouseId: dto.destinationWarehouseId,
                movementType: 'TRANSFER_IN',
                storageBinId: dto.destinationBinId ?? dto.storageBinId,
                destinationBinId: dto.destinationBinId ?? dto.storageBinId,
                idempotencyKey: dto.idempotencyKey ? `${dto.idempotencyKey}:in` : inKey,
                sourceDocumentId: dto.sourceDocumentId,
            },
        )
    }

    postAdjustment(dto: PostAdjustmentDto) {
        return this.posting.postTransaction(this.toPostDto(dto, dto.movementType))
    }

    private toPostDto(
        dto: PostReceiptDto | PostIssueDto | PostTransferDto | PostAdjustmentDto,
        movementType: PostTransactionDto['movementType'],
    ): PostTransactionDto {
        return {
            companyId: dto.companyId,
            plantId: dto.plantId,
            warehouseId: dto.warehouseId,
            storageBinId: dto.storageBinId,
            materialId: dto.materialId,
            batchId: dto.batchId,
            serialNumberId: dto.serialNumberId,
            stockStatus: dto.stockStatus,
            movementType,
            quantity: dto.quantity,
            uomId: dto.uomId,
            unitCost: dto.unitCost,
            totalCost: dto.totalCost,
            postingDate: dto.postingDate,
            documentDate: dto.documentDate,
            sourceModule: dto.sourceModule ?? 'INVENTORY',
            sourceDocumentType: dto.sourceDocumentType,
            sourceDocumentId: dto.sourceDocumentId,
            sourceDocumentLineId: dto.sourceDocumentLineId,
            reasonCode: dto.reasonCode,
            remarks: dto.remarks,
            idempotencyKey: dto.idempotencyKey,
            createdBy: dto.createdBy,
        }
    }
}
