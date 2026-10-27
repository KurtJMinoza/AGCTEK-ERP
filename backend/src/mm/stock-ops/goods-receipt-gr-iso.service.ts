import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import { ReceivingVarianceService } from '../receiving/receiving-variance.service'
import { QualityHoldService } from '../receiving/quality-hold.service'
import { DetectedVariance } from '../receiving/receiving-variance.util'

/**
 * ISO 9001 receiving side-effects on goods receipt (variances, holds, audit).
 * Physical quantity remains owned by InventoryPostingService via GoodsReceiptService.post.
 */
@Injectable()
export class GoodsReceiptGrIsoService {
    constructor(
        private prisma: PrismaService,
        private variances: ReceivingVarianceService,
        private holds: QualityHoldService,
    ) {}

    async writeAudit(
        goodsReceiptId: string,
        action: string,
        performedBy: string | undefined,
        companyId: string,
        patch?: { previousValue?: object; newValue?: object; reason?: string },
    ) {
        await this.prisma.mmGoodsReceiptAudit.create({
            data: {
                goodsReceiptId,
                action,
                performedBy: performedBy ?? null,
                companyId,
                previousValue: patch?.previousValue ?? undefined,
                newValue: patch?.newValue ?? undefined,
                reason: patch?.reason ?? null,
            },
        })
    }

    async syncVariancesAndHoldsFromPostedGr(
        doc: {
            id: string
            companyId: string
            warehouseId: string
            supplierId: string | null
            createdBy: string | null
            lines: Array<{
                id: string
                materialId: string
                uomId: string
                quantity: Decimal
                expectedQuantity: Decimal | null
                shortageQuantity: Decimal
                overageQuantity: Decimal
                damagedQuantity: Decimal
                purchaseOrderLineId: string | null
                material: {
                    materialCode?: string
                    batchManaged: boolean
                    serialManaged: boolean
                }
            }>
        },
    ) {
        let seq = await this.nextVarianceSeq()
        for (const line of doc.lines) {
            const detected: DetectedVariance[] = []
            const shortage = Number(line.shortageQuantity ?? 0)
            const overage = Number(line.overageQuantity ?? 0)
            const damaged = Number(line.damagedQuantity ?? 0)
            if (shortage > 0) {
                detected.push({
                    varianceType: 'UNDER_RECEIPT',
                    quantity: shortage,
                    description: `Shortage on GR line (${shortage} units)`,
                })
            }
            if (overage > 0) {
                detected.push({
                    varianceType: 'OVER_RECEIPT',
                    quantity: overage,
                    description: `Over-receipt on GR line (${overage} units)`,
                })
            }
            if (damaged > 0) {
                detected.push({
                    varianceType: 'DAMAGED',
                    quantity: damaged,
                    description: `Visible damage recorded at receipt (${damaged} units)`,
                })
            }
            if (!detected.length) continue

            for (const v of detected) {
                const varianceNumber = `VAR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(seq++).padStart(5, '0')}`
                await this.prisma.mmReceivingVariance.create({
                    data: {
                        varianceNumber,
                        companyId: doc.companyId,
                        goodsReceiptId: doc.id,
                        goodsReceiptLineId: line.id,
                        varianceType: v.varianceType,
                        quantity: new Decimal(v.quantity),
                        description: v.description,
                        severity: v.varianceType === 'DAMAGED' ? 'HIGH' : 'MEDIUM',
                        status: 'OPEN',
                    },
                })
            }

            if (damaged > 0) {
                await this.holds.create({
                    companyId: doc.companyId,
                    warehouseId: doc.warehouseId,
                    goodsReceiptLineId: line.id,
                    materialId: line.materialId,
                    holdType: 'QUARANTINE',
                    targetStockStatus: 'BLOCKED',
                    reason: `Damaged at goods receipt (${damaged} units)`,
                    heldBy: doc.createdBy ?? undefined,
                })
            }
        }
    }

    private async nextVarianceSeq() {
        const prefix = `VAR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-`
        const last = await this.prisma.mmReceivingVariance.findFirst({
            where: { varianceNumber: { startsWith: prefix } },
            orderBy: { varianceNumber: 'desc' },
            select: { varianceNumber: true },
        })
        if (!last?.varianceNumber) return 1
        const n = parseInt(last.varianceNumber.slice(prefix.length), 10)
        return isNaN(n) ? 1 : n + 1
    }
}
