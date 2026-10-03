import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateProductMaterialAssignmentDto } from './dto/product-material-assignment.dto'

@Injectable()
export class ProductMaterialAssignmentService {
    constructor(private prisma: PrismaService) {}

    listForProduct(productId: string) {
        return this.prisma.sdProductMaterialAssignment.findMany({
            where: { productId },
            include: {
                material: {
                    select: {
                        id: true,
                        materialCode: true,
                        materialName: true,
                        status: true,
                        baseUomId: true,
                    },
                },
                salesUom: true,
                materialUom: true,
                company: { select: { id: true, code: true, name: true } },
            },
            orderBy: { effectiveFrom: 'desc' },
        })
    }

    listForMaterial(materialId: string) {
        return this.prisma.sdProductMaterialAssignment.findMany({
            where: { materialId, status: 'ACTIVE' },
            include: {
                product: {
                    select: {
                        id: true,
                        sku: true,
                        name: true,
                        divisionId: true,
                        isActive: true,
                    },
                },
            },
            orderBy: { updatedAt: 'desc' },
        })
    }

    async create(dto: CreateProductMaterialAssignmentDto) {
        await this.prisma.sdProduct.findUniqueOrThrow({
            where: { id: dto.productId },
        })
        await this.prisma.mmMaterial.findUniqueOrThrow({
            where: { id: dto.materialId },
        })
        return this.prisma.sdProductMaterialAssignment.create({
            data: {
                productId: dto.productId,
                materialId: dto.materialId,
                companyId: dto.companyId,
                divisionId: dto.divisionId ?? null,
                salesUomId: dto.salesUomId ?? null,
                materialUomId: dto.materialUomId ?? null,
                fulfillmentType: dto.fulfillmentType ?? 'WAREHOUSE',
                inventoryRelevant: dto.inventoryRelevant ?? true,
                atpRelevant: dto.atpRelevant ?? true,
                reservationRelevant: dto.reservationRelevant ?? true,
                effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined,
                effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
                status: dto.status ?? 'ACTIVE',
            },
            include: { material: true, product: true },
        })
    }

    async deactivate(id: string) {
        const row = await this.prisma.sdProductMaterialAssignment.findUnique({
            where: { id },
        })
        if (!row) throw new NotFoundException('Product material assignment not found')
        return this.prisma.sdProductMaterialAssignment.update({
            where: { id },
            data: { status: 'INACTIVE', effectiveTo: new Date() },
        })
    }
}
