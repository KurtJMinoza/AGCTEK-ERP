import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../../prisma/prisma.service'
import { PriceVarianceType } from './valuation.constants'

export type CreatePriceVarianceInput = {
    companyId: string
    materialId: string
    warehouseId: string
    valuationTxnId?: string | null
    inventoryTxnId?: string | null
    varianceType: PriceVarianceType | string
    poPrice?: Decimal | null
    standardCost?: Decimal | null
    invoicePrice?: Decimal | null
    landedUnitCost?: Decimal | null
    actualUnitCost?: Decimal | null
    varianceAmount: Decimal
    remarks?: string | null
    status?: string
}

@Injectable()
export class PriceVarianceService {
    constructor(private prisma: PrismaService) {}

    async findAll(query: {
        companyId?: string
        warehouseId?: string
        materialId?: string
        varianceType?: string
        page?: number
        limit?: number
    }) {
        const page = query.page ?? 1
        const limit = query.limit ?? 50
        const where: any = {}
        if (query.companyId) where.companyId = query.companyId
        if (query.warehouseId) where.warehouseId = query.warehouseId
        if (query.materialId) where.materialId = query.materialId
        if (query.varianceType) where.varianceType = query.varianceType

        const [data, total] = await Promise.all([
            this.prisma.mmPriceVariance.findMany({
                where,
                include: {
                    material: {
                        select: {
                            id: true,
                            materialCode: true,
                            materialName: true,
                        },
                    },
                    warehouse: { select: { id: true, code: true, name: true } },
                    valuationTxn: true,
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.mmPriceVariance.count({ where }),
        ])

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        }
    }

    async createInTransaction(
        tx: Prisma.TransactionClient,
        input: CreatePriceVarianceInput,
    ) {
        const varianceNumber = await this.generateNumber(tx)
        return tx.mmPriceVariance.create({
            data: {
                varianceNumber,
                companyId: input.companyId,
                materialId: input.materialId,
                warehouseId: input.warehouseId,
                valuationTxnId: input.valuationTxnId ?? null,
                inventoryTxnId: input.inventoryTxnId ?? null,
                varianceType: input.varianceType,
                poPrice: input.poPrice ?? null,
                standardCost: input.standardCost ?? null,
                invoicePrice: input.invoicePrice ?? null,
                landedUnitCost: input.landedUnitCost ?? null,
                actualUnitCost: input.actualUnitCost ?? null,
                varianceAmount: input.varianceAmount,
                status: input.status ?? 'POSTED',
                remarks: input.remarks ?? null,
            },
        })
    }

    private async generateNumber(tx: Prisma.TransactionClient) {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        const pfx = `PV-${today}-`
        const last = await tx.mmPriceVariance.findFirst({
            where: { varianceNumber: { startsWith: pfx } },
            orderBy: { varianceNumber: 'desc' },
        })
        let seq = 1
        if (last) {
            const n = parseInt(last.varianceNumber.replace(pfx, ''), 10)
            if (!isNaN(n)) seq = n + 1
        }
        return `${pfx}${String(seq).padStart(5, '0')}`
    }
}
