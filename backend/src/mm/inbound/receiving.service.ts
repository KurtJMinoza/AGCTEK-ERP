import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { GoodsReceiptService } from '../stock-ops/goods-receipt.service'
import { ReceiveDto } from './dto/inbound.dto'
import { Decimal } from '@prisma/client/runtime/library'

function appendFlag(existing: string | null, flag: string): string {
    if (!existing) return flag
    const parts = existing.split(',')
    if (parts.includes(flag)) return existing
    return `${existing},${flag}`
}

@Injectable()
export class ReceivingService {
    constructor(
        private prisma: PrismaService,
        private goodsReceiptService: GoodsReceiptService,
    ) {}

    /**
     * Record barcode/manual receiving against an expected receipt.
     * Creates a DRAFT Goods Receipt with variance flags; posting happens via GR post.
     */
    async receive(dto: ReceiveDto) {
        const er = await this.prisma.mmExpectedReceipt.findUnique({
            where: { id: dto.expectedReceiptId },
            include: {
                lines: { include: { material: true } },
                purchaseOrder: true,
            },
        })
        if (!er) throw new NotFoundException('Expected receipt not found')
        if (['CLOSED', 'CANCELLED'].includes(er.status)) {
            throw new BadRequestException(`Cannot receive against ${er.status} expected receipt`)
        }
        if (!dto.lines?.length) throw new BadRequestException('At least one line is required')

        const lineMap = new Map(er.lines.map((l) => [l.id, l]))
        const grLines: any[] = []

        for (const recv of dto.lines) {
            const erLine = lineMap.get(recv.expectedReceiptLineId)
            if (!erLine) {
                throw new BadRequestException(`Expected receipt line ${recv.expectedReceiptLineId} not found`)
            }

            let discrepancyFlag: string | null = null
            let rejected = Number(recv.rejectedQuantity ?? 0)
            const material = erLine.material

            // Barcode / material identity → WRONG_MATERIAL variance (still creates GR)
            if (recv.barcode) {
                const bc = await this.prisma.mmBarcode.findFirst({
                    where: { barcodeValue: recv.barcode, deletedAt: null },
                })
                if (!bc) throw new BadRequestException(`Barcode not found: ${recv.barcode}`)
                if (bc.materialId !== erLine.materialId) {
                    discrepancyFlag = appendFlag(discrepancyFlag, 'WRONG_MATERIAL')
                    rejected = Math.max(rejected, Number(recv.receivedQuantity))
                }
            }
            if (recv.materialId && recv.materialId !== erLine.materialId) {
                discrepancyFlag = appendFlag(discrepancyFlag, 'WRONG_MATERIAL')
                rejected = Math.max(rejected, Number(recv.receivedQuantity))
            }

            if (material.batchManaged) {
                if (!recv.batchId) {
                    throw new BadRequestException(`Batch required for ${material.materialCode}`)
                }
                const batch = await this.prisma.mmBatch.findUnique({
                    where: { id: recv.batchId },
                })
                if (!batch || batch.materialId !== erLine.materialId) {
                    discrepancyFlag = appendFlag(discrepancyFlag, 'WRONG_BATCH')
                    rejected = Math.max(rejected, Number(recv.receivedQuantity))
                }
            }
            if (material.serialManaged) {
                if (!recv.serialNumberId) {
                    throw new BadRequestException(`Serial required for ${material.materialCode}`)
                }
                const serial = await this.prisma.mmSerialNumber.findUnique({
                    where: { id: recv.serialNumberId },
                })
                if (!serial || serial.materialId !== erLine.materialId) {
                    discrepancyFlag = appendFlag(discrepancyFlag, 'WRONG_SERIAL')
                    rejected = Math.max(rejected, Number(recv.receivedQuantity))
                }
            }

            const expected = Number(erLine.expectedQuantity)
            const already = Number(erLine.receivedQuantity)
            const remaining = Math.max(0, expected - already)
            const received = Number(recv.receivedQuantity)
            const damaged = Number(recv.damagedQuantity ?? 0)
            if (received < 0 || damaged < 0 || rejected < 0) {
                throw new BadRequestException('Quantities cannot be negative')
            }
            if (damaged + rejected > received + 1e-9) {
                throw new BadRequestException(
                    'Damaged + rejected cannot exceed received quantity',
                )
            }

            const shortage = Math.max(0, remaining - received)
            const overage = Math.max(0, received - remaining)
            if (damaged > 0) discrepancyFlag = appendFlag(discrepancyFlag, 'DAMAGE')
            if (rejected > 0 && !discrepancyFlag?.includes('WRONG_')) {
                discrepancyFlag = appendFlag(discrepancyFlag, 'REJECTED')
            }
            if (shortage > 0) discrepancyFlag = appendFlag(discrepancyFlag, 'SHORTAGE')
            if (overage > 0) discrepancyFlag = appendFlag(discrepancyFlag, 'OVERAGE')

            const goodQty = Math.max(0, received - damaged - rejected)
            if (received <= 0) {
                throw new BadRequestException('Received quantity must be greater than zero')
            }

            // Wrong-identity lines post zero good qty (all rejected) but keep variance trail
            const postQty = discrepancyFlag?.includes('WRONG_')
                ? received
                : received

            grLines.push({
                materialId: erLine.materialId,
                quantity: postQty,
                expectedQuantity: remaining,
                shortageQuantity: shortage,
                overageQuantity: overage,
                damagedQuantity: damaged,
                rejectedQuantity: rejected,
                uomId: erLine.uomId,
                storageBinId: recv.storageBinId,
                batchId:
                    discrepancyFlag?.includes('WRONG_BATCH') ||
                    discrepancyFlag?.includes('WRONG_MATERIAL')
                        ? undefined
                        : recv.batchId,
                serialNumberId:
                    discrepancyFlag?.includes('WRONG_SERIAL') ||
                    discrepancyFlag?.includes('WRONG_MATERIAL')
                        ? undefined
                        : recv.serialNumberId,
                unitCost: recv.unitCost ?? 0,
                purchaseOrderLineId: erLine.purchaseOrderLineId ?? undefined,
                expectedReceiptLineId: erLine.id,
                discrepancyFlag: discrepancyFlag ?? undefined,
                remarks: [
                    damaged > 0 ? `Damaged qty: ${damaged}` : null,
                    rejected > 0 ? `Rejected qty: ${rejected}` : null,
                    discrepancyFlag?.includes('WRONG_')
                        ? `Identity variance: ${discrepancyFlag}`
                        : null,
                ]
                    .filter(Boolean)
                    .join('; ') || undefined,
                stockStatus:
                    goodQty > 0 && material.qualityInspectionRequired
                        ? 'QUALITY_INSPECTION'
                        : undefined,
            })
        }

        const today = new Date().toISOString()
        const gr = await this.goodsReceiptService.create({
            companyId: er.companyId,
            warehouseId: er.warehouseId,
            purchaseOrderId: er.purchaseOrderId ?? undefined,
            expectedReceiptId: er.id,
            asnId: er.asnId ?? undefined,
            supplierId: er.supplierId,
            receiverId: dto.receiverId,
            createdBy: dto.createdBy,
            postingDate: dto.postingDate ?? today,
            documentDate: dto.documentDate ?? today,
            stockStatus: 'UNRESTRICTED',
            lines: grLines,
        } as any)

        if (er.status === 'OPEN') {
            await this.prisma.mmExpectedReceipt.update({
                where: { id: er.id },
                data: { status: 'IN_PROGRESS' },
            })
        }

        return this.goodsReceiptService.findOne(gr.id)
    }
}
