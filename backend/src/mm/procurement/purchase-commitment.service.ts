import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'

/**
 * Records purchasing commitments on PO approval.
 * PO is a commitment — it does NOT create inventory.
 */
@Injectable()
export class PurchaseCommitmentService {
    constructor(private prisma: PrismaService) {}

    async recordCommitment(params: {
        purchaseOrderId: string
        companyId: string
        amount: Decimal | number
        currencyId?: string | null
        createdBy?: string | null
    }) {
        const amount = new Decimal(params.amount)
        const existing = await this.prisma.mmPurchaseCommitment.findFirst({
            where: { purchaseOrderId: params.purchaseOrderId, status: 'OPEN' },
        })
        if (existing) {
            return existing
        }

        const commitment = await this.prisma.mmPurchaseCommitment.create({
            data: {
                purchaseOrderId: params.purchaseOrderId,
                companyId: params.companyId,
                amount,
                currencyId: params.currencyId ?? null,
                status: 'OPEN',
                externalRef: `MM-COMMIT-STUB-${params.purchaseOrderId}`,
                createdBy: params.createdBy ?? null,
            },
        })

        await this.prisma.mmPurchaseOrder.update({
            where: { id: params.purchaseOrderId },
            data: { commitmentRecordedAt: new Date() },
        })

        return commitment
    }

    async cancelCommitment(purchaseOrderId: string) {
        await this.prisma.mmPurchaseCommitment.updateMany({
            where: { purchaseOrderId, status: 'OPEN' },
            data: { status: 'CANCELLED', releasedAt: new Date() },
        })
    }
}
