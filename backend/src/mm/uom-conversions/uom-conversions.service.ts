import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'

@Injectable()
export class UomConversionsService {
    constructor(private prisma: PrismaService) {}

    async findAll(materialId?: string) {
        const where: any = { deletedAt: null }
        if (materialId) {
            where.OR = [{ materialId }, { materialId: null }]
        }
        return this.prisma.mmUomConversion.findMany({
            where,
            include: { fromUom: true, toUom: true, material: true },
            orderBy: { createdAt: 'desc' },
        })
    }

    async findOne(id: string) {
        const conv = await this.prisma.mmUomConversion.findFirst({
            where: { id, deletedAt: null },
            include: { fromUom: true, toUom: true },
        })
        if (!conv) throw new NotFoundException('UOM conversion not found')
        return conv
    }

    async create(data: { fromUomId: string; toUomId: string; factor: number; materialId?: string }) {
        this.assertValidFactor(data.factor)
        if (data.fromUomId === data.toUomId) {
            throw new BadRequestException('From and To UOM must differ')
        }
        return this.prisma.mmUomConversion.create({
            data: {
                fromUomId: data.fromUomId,
                toUomId: data.toUomId,
                factor: data.factor,
                materialId: data.materialId ?? null,
            },
            include: { fromUom: true, toUom: true, material: true },
        })
    }

    async update(id: string, data: Partial<{ fromUomId: string; toUomId: string; factor: number; materialId: string | null }>) {
        await this.findOne(id)
        if (data.factor !== undefined) this.assertValidFactor(data.factor)
        const fromId = data.fromUomId
        const toId = data.toUomId
        if (fromId && toId && fromId === toId) {
            throw new BadRequestException('From and To UOM must differ')
        }
        return this.prisma.mmUomConversion.update({
            where: { id },
            data: data as any,
            include: { fromUom: true, toUom: true, material: true },
        })
    }

    async softDelete(id: string) {
        await this.findOne(id)
        return this.prisma.mmUomConversion.update({
            where: { id },
            data: { deletedAt: new Date() },
        })
    }

    /**
     * Convert quantity from one UOM to another.
     * Prefers material-scoped conversion, then global. Supports inverse factors.
     */
    async convertQuantity(args: {
        materialId?: string | null
        fromUomId: string
        toUomId: string
        quantity: number | string | Decimal
    }): Promise<Decimal> {
        const qty = new Decimal(args.quantity)
        if (args.fromUomId === args.toUomId) return qty

        const factor = await this.resolveFactor(args.materialId, args.fromUomId, args.toUomId)
        if (factor == null) {
            throw new BadRequestException(
                `No UOM conversion found from ${args.fromUomId} to ${args.toUomId}`,
            )
        }
        return qty.mul(factor)
    }

    async toBaseUom(materialId: string, fromUomId: string, quantity: number | string | Decimal) {
        const material = await this.prisma.mmMaterial.findFirst({
            where: { id: materialId, deletedAt: null },
            select: { baseUomId: true },
        })
        if (!material) throw new NotFoundException('Material not found')
        const baseQty = await this.convertQuantity({
            materialId,
            fromUomId,
            toUomId: material.baseUomId,
            quantity,
        })
        return { quantity: baseQty, baseUomId: material.baseUomId }
    }

    private assertValidFactor(factor: number) {
        if (!(factor > 0) || Number.isNaN(factor)) {
            throw new BadRequestException('Conversion factor must be a positive number')
        }
    }

    private async resolveFactor(
        materialId: string | null | undefined,
        fromUomId: string,
        toUomId: string,
    ): Promise<Decimal | null> {
        // Prefer material-scoped, then global
        const scopes: Array<string | null> = materialId ? [materialId, null] : [null]
        for (const scope of scopes) {
            const forward = await this.prisma.mmUomConversion.findFirst({
                where: {
                    deletedAt: null,
                    fromUomId,
                    toUomId,
                    materialId: scope,
                },
            })
            if (forward) return new Decimal(forward.factor)

            const inverse = await this.prisma.mmUomConversion.findFirst({
                where: {
                    deletedAt: null,
                    fromUomId: toUomId,
                    toUomId: fromUomId,
                    materialId: scope,
                },
            })
            if (inverse) {
                const f = new Decimal(inverse.factor)
                if (f.isZero()) continue
                return new Decimal(1).div(f)
            }
        }
        return null
    }
}
