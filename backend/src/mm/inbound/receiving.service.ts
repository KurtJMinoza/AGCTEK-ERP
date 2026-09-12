import { Injectable } from '@nestjs/common'
import { ReceivingDocumentService } from '../receiving/receiving-document.service'
import { ReceiveDto } from './dto/inbound.dto'
import { CreateReceivingDocumentDto } from '../receiving/dto/receiving.dto'

/**
 * Legacy inbound receiving entry — delegates to ReceivingDocumentService.
 * autoPost=true preserves one-step DRAFT GR behavior for mobile/scanner compat.
 */
@Injectable()
export class ReceivingService {
    constructor(private receivingDocs: ReceivingDocumentService) {}

    async receive(dto: ReceiveDto & { autoPost?: boolean }) {
        const payload: CreateReceivingDocumentDto = {
            expectedReceiptId: dto.expectedReceiptId,
            receiverId: dto.receiverId,
            createdBy: dto.createdBy,
            postingDate: dto.postingDate,
            documentDate: dto.documentDate,
            autoPost: dto.autoPost ?? true,
            lines: dto.lines.map((l) => ({
                expectedReceiptLineId: l.expectedReceiptLineId,
                receivedQuantity: l.receivedQuantity,
                damagedQuantity: l.damagedQuantity,
                rejectedQuantity: l.rejectedQuantity,
                batchId: l.batchId,
                serialNumberId: l.serialNumberId,
                storageBinId: l.storageBinId,
                unitCost: l.unitCost,
                barcode: l.barcode,
                materialId: l.materialId,
                uomId: l.uomId,
            })),
        }

        const result = await this.receivingDocs.create(payload)
        if (payload.autoPost && 'goodsReceipt' in result) {
            return result.goodsReceipt
        }
        return result
    }
}
