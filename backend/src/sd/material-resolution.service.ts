import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { SD_MM_ERROR, SdMmIntegrationException } from './sd-integration.errors'

export type ResolveMaterialInput = {
    productId: string
    companyId: string
    channel?: string
    divisionId?: string | null
    effectiveDate?: Date
}

export type ResolvedMaterialAssignment = {
    assignmentId: string
    productId: string
    materialId: string
    materialCode: string
    materialName: string
    materialStatus: string
    baseUomId: string
    salesUomId: string | null
    materialUomId: string | null
    inventoryRelevant: boolean
    atpRelevant: boolean
    reservationRelevant: boolean
    productType: string
}

@Injectable()
export class MaterialResolutionService {
    constructor(private prisma: PrismaService) {}

    async resolveMaterialForProduct(
        input: ResolveMaterialInput,
    ): Promise<ResolvedMaterialAssignment> {
        const effective = input.effectiveDate ?? new Date()
        const product = await this.prisma.sdProduct.findUnique({
            where: { id: input.productId },
        })
        if (!product) {
            throw new SdMmIntegrationException(
                SD_MM_ERROR.PRODUCT_NOT_FOUND,
                `Product ${input.productId} not found`,
            )
        }

        if (product.productType === 'SERVICE') {
            throw new SdMmIntegrationException(
                SD_MM_ERROR.NON_INVENTORY_PRODUCT,
                'Service products do not require material mapping',
            )
        }

        if (product.productType === 'NON_STOCK_ITEM') {
            throw new SdMmIntegrationException(
                SD_MM_ERROR.NON_INVENTORY_PRODUCT,
                'Non-stock products use procurement/demand paths outside warehouse ATP',
            )
        }

        const candidates = await this.prisma.sdProductMaterialAssignment.findMany({
            where: {
                productId: input.productId,
                companyId: input.companyId,
                status: 'ACTIVE',
                effectiveFrom: { lte: effective },
                OR: [{ effectiveTo: null }, { effectiveTo: { gte: effective } }],
            },
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
            },
            orderBy: { effectiveFrom: 'desc' },
        })

        const attrs =
            product.attributes && typeof product.attributes === 'object'
                ? (product.attributes as Record<string, unknown>)
                : null
        const primaryMaterialId =
            typeof attrs?.primaryMaterialId === 'string'
                ? attrs.primaryMaterialId
                : null

        const divisionMatch = (c: (typeof candidates)[number]) =>
            !c.divisionId || !input.divisionId || c.divisionId === input.divisionId

        const assignment =
            (primaryMaterialId
                ? candidates.find(
                      (c) => c.materialId === primaryMaterialId && divisionMatch(c),
                  )
                : null) ??
            candidates.find(divisionMatch) ??
            null

        if (!assignment) {
            throw new SdMmIntegrationException(
                SD_MM_ERROR.PRODUCT_MATERIAL_MAPPING_MISSING,
                `No active product–material assignment for product ${product.sku} and company`,
            )
        }

        if (assignment.status !== 'ACTIVE') {
            throw new SdMmIntegrationException(
                SD_MM_ERROR.PRODUCT_MATERIAL_MAPPING_INACTIVE,
                'Product–material assignment is inactive',
            )
        }

        const mat = assignment.material
        if (mat.status === 'BLOCKED') {
            throw new SdMmIntegrationException(
                SD_MM_ERROR.MATERIAL_BLOCKED,
                `Material ${mat.materialCode} is blocked`,
            )
        }
        if (mat.status !== 'ACTIVE' && mat.status !== 'DRAFT') {
            throw new SdMmIntegrationException(
                SD_MM_ERROR.MATERIAL_INACTIVE,
                `Material ${mat.materialCode} is not active`,
            )
        }

        return {
            assignmentId: assignment.id,
            productId: product.id,
            materialId: mat.id,
            materialCode: mat.materialCode,
            materialName: mat.materialName,
            materialStatus: mat.status,
            baseUomId: mat.baseUomId,
            salesUomId: assignment.salesUomId ?? product.salesUomId,
            materialUomId: assignment.materialUomId,
            inventoryRelevant: assignment.inventoryRelevant,
            atpRelevant: assignment.atpRelevant,
            reservationRelevant: assignment.reservationRelevant,
            productType: product.productType,
        }
    }

    async findProductByDivisionSku(divisionId: string, sku: string) {
        return this.prisma.sdProduct.findUnique({
            where: { divisionId_sku: { divisionId, sku } },
        })
    }
}
