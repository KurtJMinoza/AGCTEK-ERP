import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import { VarianceQueryDto } from './dto/receiving.dto'
import {
    DetectedVariance,
    VarianceType,
    appendDiscrepancyFlag,
} from './receiving-variance.util'

export type LineVarianceInput = {
    expectedReceiptLineId: string
    materialId: string
    uomId: string
    expectedQuantity: number
    alreadyReceived: number
    receivedQuantity: number
    damagedQuantity: number
    rejectedQuantity: number
    batchId?: string
    serialNumberId?: string
    barcode?: string
    overrideMaterialId?: string
    material: {
        materialCode?: string
        batchManaged: boolean
        serialManaged: boolean
    }
}

@Injectable()
export class ReceivingVarianceService {
    constructor(private prisma: PrismaService) {}

    async detectLineVariances(input: LineVarianceInput): Promise<DetectedVariance[]> {
        const variances: DetectedVariance[] = []
        let rejected = input.rejectedQuantity

        if (input.barcode) {
            const bc = await this.prisma.mmBarcode.findFirst({
                where: { barcodeValue: input.barcode, deletedAt: null },
            })
            if (bc && bc.materialId !== input.materialId) {
                variances.push({
                    varianceType: 'UNEXPECTED_ITEM',
                    quantity: input.receivedQuantity,
                    description: `Barcode maps to different material`,
                })
                rejected = Math.max(rejected, input.receivedQuantity)
            }
        }

        if (input.overrideMaterialId && input.overrideMaterialId !== input.materialId) {
            variances.push({
                varianceType: 'UNEXPECTED_ITEM',
                quantity: input.receivedQuantity,
                description: `Scanned material differs from expected line`,
            })
            rejected = Math.max(rejected, input.receivedQuantity)
        }

        if (input.material.batchManaged && input.batchId) {
            const batch = await this.prisma.mmBatch.findUnique({ where: { id: input.batchId } })
            if (!batch || batch.materialId !== input.materialId) {
                variances.push({
                    varianceType: 'BATCH_MISMATCH',
                    quantity: input.receivedQuantity,
                    description: `Batch does not match material ${input.material.materialCode ?? input.materialId}`,
                })
                rejected = Math.max(rejected, input.receivedQuantity)
            }
        }

        if (input.material.serialManaged && input.serialNumberId) {
            const serial = await this.prisma.mmSerialNumber.findUnique({
                where: { id: input.serialNumberId },
            })
            if (!serial || serial.materialId !== input.materialId) {
                variances.push({
                    varianceType: 'SERIAL_MISMATCH',
                    quantity: input.receivedQuantity,
                    description: `Serial does not match material`,
                })
                rejected = Math.max(rejected, input.receivedQuantity)
            }
        }

        const remaining = Math.max(0, input.expectedQuantity - input.alreadyReceived)
        const shortage = Math.max(0, remaining - input.receivedQuantity)
        const overage = Math.max(0, input.receivedQuantity - remaining)

        if (shortage > 0) {
            variances.push({
                varianceType: 'UNDER_RECEIPT',
                quantity: shortage,
                description: `Received ${input.receivedQuantity}, expected ${remaining} remaining`,
            })
        }
        if (overage > 0) {
            variances.push({
                varianceType: 'OVER_RECEIPT',
                quantity: overage,
                description: `Received ${input.receivedQuantity}, expected ${remaining} remaining`,
            })
        }
        if (input.damagedQuantity > 0) {
            variances.push({
                varianceType: 'DAMAGED',
                quantity: input.damagedQuantity,
                description: `Damaged quantity on receive`,
            })
        }

        return variances
    }

    async persistVariances(
        receivingDocumentId: string,
        receivingLineId: string,
        variances: DetectedVariance[],
    ) {
        if (!variances.length) return []
        return this.prisma.mmReceivingVariance.createMany({
            data: variances.map((v) => ({
                receivingDocumentId,
                receivingLineId,
                varianceType: v.varianceType,
                quantity: new Decimal(v.quantity),
                description: v.description,
                status: 'OPEN',
            })),
        })
    }

    async list(query: VarianceQueryDto) {
        const where: any = {}
        if (query.status) where.status = query.status
        if (query.varianceType) where.varianceType = query.varianceType
        if (query.companyId) {
            where.receivingDocument = { companyId: query.companyId }
        }
        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 20
        const [data, total] = await Promise.all([
            this.prisma.mmReceivingVariance.findMany({
                where,
                include: {
                    receivingDocument: {
                        select: {
                            id: true,
                            documentNumber: true,
                            status: true,
                            companyId: true,
                        },
                    },
                    receivingLine: {
                        select: { id: true, materialId: true, receivedQuantity: true },
                    },
                },
                orderBy: { detectedAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmReceivingVariance.count({ where }),
        ])
        return { data, total, page, pageSize }
    }

    flagsFromVariances(variances: DetectedVariance[]): string | undefined {
        const map: Record<VarianceType, string> = {
            UNDER_RECEIPT: 'SHORTAGE',
            OVER_RECEIPT: 'OVERAGE',
            DAMAGED: 'DAMAGE',
            UNEXPECTED_ITEM: 'WRONG_MATERIAL',
            BATCH_MISMATCH: 'WRONG_BATCH',
            SERIAL_MISMATCH: 'WRONG_SERIAL',
            UOM_MISMATCH: 'UOM_MISMATCH',
        }
        let flag: string | null = null
        for (const v of variances) {
            flag = appendDiscrepancyFlag(flag, map[v.varianceType] ?? v.varianceType)
        }
        return flag ?? undefined
    }
}
