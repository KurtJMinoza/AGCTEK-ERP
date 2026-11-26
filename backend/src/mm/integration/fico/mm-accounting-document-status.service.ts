import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import {
    mmAccountingDisplayFromEventStatus,
    type MmAccountingPostingDisplayState,
} from './mm-accounting-posting-status.constants'

export type MmAccountingDocumentPointer = {
    documentType: string
    documentId: string
    companyId?: string | null
    eventStatus: string
    outcomeReason?: string | null
    lastErrorCode?: string | null
    isReversal?: boolean
}

/** Maps accounting event outcomes to MM stock document `accountingPostingStatus`. */
@Injectable()
export class MmAccountingDocumentStatusService {
    private readonly logger = new Logger(MmAccountingDocumentStatusService.name)

    constructor(private readonly prisma: PrismaService) {}

    async applyEventOutcome(input: MmAccountingDocumentPointer): Promise<void> {
        let display = mmAccountingDisplayFromEventStatus(
            input.eventStatus,
            input.outcomeReason,
            input.lastErrorCode,
        )
        if (input.isReversal && input.eventStatus === 'CONSUMED') {
            display = 'ACCOUNTING_REVERSED'
        }
        await this.writeStatus(input.documentType, input.documentId, display)
    }

    async markPending(documentType: string, documentId: string): Promise<void> {
        await this.writeStatus(documentType, documentId, 'PENDING_ACCOUNTING')
    }

    private async writeStatus(
        documentType: string,
        documentId: string,
        status: MmAccountingPostingDisplayState,
    ) {
        const type = documentType.trim().toUpperCase()
        try {
            switch (type) {
                case 'GOODS_RECEIPT':
                    await this.prisma.mmGoodsReceipt.updateMany({
                        where: { id: documentId },
                        data: { accountingPostingStatus: status },
                    })
                    break
                case 'GOODS_ISSUE':
                    await this.prisma.mmGoodsIssue.updateMany({
                        where: { id: documentId },
                        data: { accountingPostingStatus: status },
                    })
                    break
                case 'ADJUSTMENT':
                    await this.prisma.mmInventoryAdjustment.updateMany({
                        where: { id: documentId },
                        data: { accountingPostingStatus: status },
                    })
                    break
                case 'SUPPLIER_RETURN':
                    await this.prisma.mmSupplierReturn.updateMany({
                        where: { id: documentId },
                        data: { accountingPostingStatus: status },
                    })
                    break
                case 'CUSTOMER_RETURN':
                    await this.prisma.mmCustomerReturn.updateMany({
                        where: { id: documentId },
                        data: { accountingPostingStatus: status },
                    })
                    break
                case 'DISPOSAL':
                case 'SCRAP':
                    await this.prisma.mmDisposal.updateMany({
                        where: { id: documentId },
                        data: { accountingPostingStatus: status },
                    })
                    break
                default:
                    return
            }
        } catch (error) {
            this.logger.warn(
                `Could not update accountingPostingStatus for ${type}/${documentId}: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            )
        }
    }
}