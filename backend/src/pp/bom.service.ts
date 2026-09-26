import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../prisma/prisma.service'
import { CreateBomDto } from './dto/production-order.dto'

export type ExplodedComponent = {
    materialId: string
    quantity: Decimal
    uomId: string
}

@Injectable()
export class BomService {
    constructor(private prisma: PrismaService) {}

    async create(dto: CreateBomDto) {
        const bomNumber = await this.nextBomNumber()
        return this.prisma.ppBillOfMaterial.create({
            data: {
                bomNumber,
                companyId: dto.companyId,
                plantId: dto.plantId ?? null,
                parentMaterialId: dto.parentMaterialId,
                baseQuantity: new Decimal(dto.baseQuantity ?? 1),
                yieldFactor: new Decimal(dto.yieldFactor ?? 1),
                status: 'ACTIVE',
                components: {
                    create: (dto.components ?? []).map((c, idx) => ({
                        lineNumber: idx + 1,
                        componentMaterialId: c.componentMaterialId,
                        quantityPer: new Decimal(c.quantityPer),
                        uomId: c.uomId,
                        scrapFactor: new Decimal(c.scrapFactor ?? 0),
                        status: 'ACTIVE',
                    })),
                },
            },
            include: { components: { include: { componentMaterial: true } } },
        })
    }

    async findActiveBom(args: {
        companyId: string
        parentMaterialId: string
        plantId?: string | null
    }) {
        const bom = await this.prisma.ppBillOfMaterial.findFirst({
            where: {
                companyId: args.companyId,
                parentMaterialId: args.parentMaterialId,
                status: 'ACTIVE',
                ...(args.plantId ? { plantId: args.plantId } : {}),
            },
            include: { components: { where: { status: 'ACTIVE' } } },
            orderBy: { createdAt: 'desc' },
        })
        if (!bom) {
            throw new NotFoundException(
                `No active BOM for material ${args.parentMaterialId}`,
            )
        }
        return bom
    }

    async explodeRequirements(args: {
        companyId: string
        parentMaterialId: string
        orderQuantity: number
        plantId?: string | null
    }): Promise<ExplodedComponent[]> {
        const bom = await this.findActiveBom(args)
        const orderQty = new Decimal(args.orderQuantity)
        const baseQty = new Decimal(bom.baseQuantity)
        const yieldFactor = new Decimal(bom.yieldFactor).lte(0)
            ? new Decimal(1)
            : new Decimal(bom.yieldFactor)

        return bom.components.map((c) => {
            const scrap = new Decimal(1).plus(c.scrapFactor ?? 0)
            const qty = orderQty
                .div(baseQty)
                .div(yieldFactor)
                .mul(c.quantityPer)
                .mul(scrap)
            return {
                materialId: c.componentMaterialId,
                quantity: qty,
                uomId: c.uomId,
            }
        })
    }

    private async nextBomNumber() {
        const count = await this.prisma.ppBillOfMaterial.count()
        return `BOM-${String(count + 1).padStart(6, '0')}`
    }
}
