import { BadRequestException, NotFoundException } from '@nestjs/common'

export type MaterialUsabilityFlags = {
    forInventory?: boolean
    forPurchase?: boolean
}

/**
 * Shared gate for using a material on transactional documents / inventory posts.
 */
export function assertMaterialUsable(
    material: {
        id: string
        status: string
        deletedAt?: Date | null
        inventoryManaged?: boolean
        purchasable?: boolean
    } | null | undefined,
    flags: MaterialUsabilityFlags = {},
) {
    if (!material || material.deletedAt) {
        throw new NotFoundException('Material not found')
    }
    if (material.status === 'BLOCKED') {
        throw new BadRequestException('Material is BLOCKED and cannot be used')
    }
    if (material.status === 'INACTIVE') {
        throw new BadRequestException('Inactive materials cannot be used in new transactions')
    }
    if (material.status === 'DRAFT') {
        throw new BadRequestException('Draft materials cannot be used in transactions')
    }
    if (material.status !== 'ACTIVE') {
        throw new BadRequestException('Material is not ACTIVE')
    }
    if (flags.forInventory && material.inventoryManaged === false) {
        throw new BadRequestException('Material is not inventory-managed')
    }
    if (flags.forPurchase && material.purchasable === false) {
        throw new BadRequestException('Material is not purchasable')
    }
    return material
}

export async function assertActivateReady(prisma: {
    mmMaterialType: { findFirst: Function }
    mmMaterialCategory: { findFirst: Function }
    mmUom: { findFirst: Function }
}, material: {
    materialTypeId: string
    materialCategoryId: string
    baseUomId: string
    materialName?: string
}) {
    if (!material.materialName?.trim()) {
        throw new BadRequestException('Material name is required to activate')
    }
    if (!material.materialTypeId || !material.materialCategoryId || !material.baseUomId) {
        throw new BadRequestException('Type, category, and base UOM are required to activate')
    }
    const [type, category, uom] = await Promise.all([
        prisma.mmMaterialType.findFirst({
            where: { id: material.materialTypeId, deletedAt: null, isActive: true },
        }),
        prisma.mmMaterialCategory.findFirst({
            where: { id: material.materialCategoryId, deletedAt: null, isActive: true },
        }),
        prisma.mmUom.findFirst({
            where: { id: material.baseUomId, deletedAt: null, isActive: true },
        }),
    ])
    if (!type) throw new BadRequestException('Material type is missing or inactive')
    if (!category) throw new BadRequestException('Material category is missing or inactive')
    if (!uom) throw new BadRequestException('Base UOM is missing or inactive')
}
