import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'

const PRICE_INCLUDES = {
    supplier: { select: { id: true, supplierCode: true, supplierName: true } },
    material: { select: { id: true, materialCode: true, materialName: true } },
    currency: { select: { id: true, code: true, name: true, symbol: true } },
}

export type CreateSupplierPriceInput = {
    supplierId: string
    materialId: string
    supplierMaterialId?: string
    unitPrice: number
    currencyId?: string
    minimumQuantity?: number
    effectiveFrom?: string
    effectiveTo?: string | null
}

@Injectable()
export class SupplierPricingService {
    constructor(private prisma: PrismaService) {}

    async findAll(query: { supplierId?: string; materialId?: string }) {
        const where: any = { deletedAt: null }
        if (query.supplierId) where.supplierId = query.supplierId
        if (query.materialId) where.materialId = query.materialId
        return this.prisma.mmSupplierPrice.findMany({
            where,
            include: PRICE_INCLUDES,
            orderBy: [{ effectiveFrom: 'desc' }, { minimumQuantity: 'desc' }],
        })
    }

    async findOne(id: string) {
        const row = await this.prisma.mmSupplierPrice.findFirst({
            where: { id, deletedAt: null },
            include: PRICE_INCLUDES,
        })
        if (!row) throw new NotFoundException('Supplier price not found')
        return row
    }

    async create(data: CreateSupplierPriceInput) {
        this.assertValid(data)
        const effectiveFrom = data.effectiveFrom ? new Date(data.effectiveFrom) : new Date()
        const effectiveTo = data.effectiveTo ? new Date(data.effectiveTo) : null
        const minimumQuantity = new Decimal(data.minimumQuantity ?? 0)

        await this.assertNoOverlap({
            supplierId: data.supplierId,
            materialId: data.materialId,
            minimumQuantity,
            effectiveFrom,
            effectiveTo,
        })

        let supplierMaterialId = data.supplierMaterialId ?? null
        if (!supplierMaterialId) {
            const link = await this.prisma.mmSupplierMaterial.findUnique({
                where: {
                    supplierId_materialId: {
                        supplierId: data.supplierId,
                        materialId: data.materialId,
                    },
                },
            })
            supplierMaterialId = link?.id ?? null
        }

        const created = await this.prisma.mmSupplierPrice.create({
            data: {
                supplierId: data.supplierId,
                materialId: data.materialId,
                supplierMaterialId,
                unitPrice: data.unitPrice,
                currencyId: data.currencyId ?? null,
                minimumQuantity,
                effectiveFrom,
                effectiveTo,
            },
            include: PRICE_INCLUDES,
        })

        await this.syncCurrentMaterialPrice(data.supplierId, data.materialId)
        return created
    }

    async update(id: string, data: Partial<CreateSupplierPriceInput>) {
        const existing = await this.findOne(id)
        const unitPrice = data.unitPrice ?? Number(existing.unitPrice)
        const minimumQuantity = new Decimal(
            data.minimumQuantity !== undefined
                ? data.minimumQuantity
                : existing.minimumQuantity,
        )
        const effectiveFrom = data.effectiveFrom
            ? new Date(data.effectiveFrom)
            : existing.effectiveFrom
        const effectiveTo =
            data.effectiveTo === undefined
                ? existing.effectiveTo
                : data.effectiveTo
                  ? new Date(data.effectiveTo)
                  : null

        this.assertValid({
            unitPrice,
            minimumQuantity: Number(minimumQuantity),
            effectiveFrom: effectiveFrom.toISOString(),
            effectiveTo: effectiveTo?.toISOString() ?? null,
        })

        await this.assertNoOverlap({
            supplierId: existing.supplierId,
            materialId: existing.materialId,
            minimumQuantity,
            effectiveFrom,
            effectiveTo,
            excludeId: id,
        })

        const updated = await this.prisma.mmSupplierPrice.update({
            where: { id },
            data: {
                unitPrice,
                currencyId:
                    data.currencyId !== undefined ? data.currencyId || null : undefined,
                minimumQuantity,
                effectiveFrom,
                effectiveTo,
            },
            include: PRICE_INCLUDES,
        })

        await this.syncCurrentMaterialPrice(existing.supplierId, existing.materialId)
        return updated
    }

    async softDelete(id: string) {
        const existing = await this.findOne(id)
        const result = await this.prisma.mmSupplierPrice.update({
            where: { id },
            data: { deletedAt: new Date() },
        })
        await this.syncCurrentMaterialPrice(existing.supplierId, existing.materialId)
        return result
    }

    /**
     * Resolve unit price for a supplier/material at a quantity and date.
     * Prefers highest minimumQuantity that qualifies, then latest effectiveFrom.
     */
    async resolvePrice(args: {
        supplierId: string
        materialId: string
        quantity?: number
        asOf?: string | Date
    }) {
        const qty = new Decimal(args.quantity ?? 0)
        const asOf = args.asOf ? new Date(args.asOf) : new Date()

        const bands = await this.prisma.mmSupplierPrice.findMany({
            where: {
                deletedAt: null,
                supplierId: args.supplierId,
                materialId: args.materialId,
                minimumQuantity: { lte: qty },
                effectiveFrom: { lte: asOf },
                OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }],
            },
            include: PRICE_INCLUDES,
            orderBy: [{ minimumQuantity: 'desc' }, { effectiveFrom: 'desc' }],
        })

        if (!bands.length) {
            throw new BadRequestException(
                'No effective supplier price found for this material/quantity/date',
            )
        }
        return bands[0]
    }

    private assertValid(data: {
        unitPrice?: number
        minimumQuantity?: number
        effectiveFrom?: string
        effectiveTo?: string | null
    }) {
        if (data.unitPrice !== undefined && (!(data.unitPrice >= 0) || Number.isNaN(data.unitPrice))) {
            throw new BadRequestException('Unit price must be a non-negative number')
        }
        if (
            data.minimumQuantity !== undefined &&
            (!(data.minimumQuantity >= 0) || Number.isNaN(data.minimumQuantity))
        ) {
            throw new BadRequestException('Minimum quantity must be a non-negative number')
        }
        if (data.effectiveFrom && data.effectiveTo) {
            const from = new Date(data.effectiveFrom)
            const to = new Date(data.effectiveTo)
            if (from.getTime() > to.getTime()) {
                throw new BadRequestException('effectiveFrom must be on or before effectiveTo')
            }
        }
    }

    private async assertNoOverlap(args: {
        supplierId: string
        materialId: string
        minimumQuantity: Decimal
        effectiveFrom: Date
        effectiveTo: Date | null
        excludeId?: string
    }) {
        const existing = await this.prisma.mmSupplierPrice.findMany({
            where: {
                deletedAt: null,
                supplierId: args.supplierId,
                materialId: args.materialId,
                minimumQuantity: args.minimumQuantity,
                ...(args.excludeId ? { id: { not: args.excludeId } } : {}),
            },
        })

        const newFrom = args.effectiveFrom.getTime()
        const newTo = args.effectiveTo ? args.effectiveTo.getTime() : Number.POSITIVE_INFINITY

        for (const row of existing) {
            const from = row.effectiveFrom.getTime()
            const to = row.effectiveTo ? row.effectiveTo.getTime() : Number.POSITIVE_INFINITY
            const overlaps = newFrom <= to && from <= newTo
            if (overlaps) {
                throw new BadRequestException(
                    'Overlapping price band exists for the same supplier, material, and minimum quantity',
                )
            }
        }
    }

    /** Sync denormalized current price on supplier-material for default (min qty) open band. */
    private async syncCurrentMaterialPrice(supplierId: string, materialId: string) {
        const link = await this.prisma.mmSupplierMaterial.findUnique({
            where: { supplierId_materialId: { supplierId, materialId } },
        })
        if (!link) return

        try {
            const current = await this.resolvePrice({
                supplierId,
                materialId,
                quantity: 0,
                asOf: new Date(),
            })
            await this.prisma.mmSupplierMaterial.update({
                where: { id: link.id },
                data: {
                    unitPrice: current.unitPrice,
                    currencyId: current.currencyId,
                },
            })
        } catch {
            // no open band — leave existing unitPrice
        }
    }
}
