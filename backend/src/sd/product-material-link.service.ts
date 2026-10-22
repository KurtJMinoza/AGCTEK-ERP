import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

/** The MM material fields the Product Catalog reads (never writes). */
export const LINKABLE_MATERIAL_SELECT = {
    id: true,
    materialCode: true,
    materialName: true,
    sku: true,
    status: true,
    sellable: true,
    companyId: true,
    baseUomId: true,
    defaultWarehouseId: true,
    deletedAt: true,
} satisfies Prisma.MmMaterialSelect

export type LinkableMaterial = Prisma.MmMaterialGetPayload<{
    select: typeof LINKABLE_MATERIAL_SELECT
}>

/**
 * Material Master link rules for Product Catalog variants.
 *
 * A variant may only point at an EXISTING Material Master item that is:
 *  - in the same company
 *  - active
 *  - sellable
 *  - stocked with a Stock Keeping Unit
 *  - not already backing another active variant
 *
 * This service never creates, updates or deletes a material.
 */
@Injectable()
export class ProductMaterialLinkService {
    constructor(private readonly prisma: PrismaService) {}

    /**
     * Validate that a material may back a variant.
     * Throws NotFound / BadRequest with a message the catalog can show.
     */
    async assertLinkable(
        tx: Prisma.TransactionClient,
        materialId: string,
        companyId: string | null,
    ): Promise<LinkableMaterial> {
        const material = await tx.mmMaterial.findFirst({
            where: { id: materialId },
            select: LINKABLE_MATERIAL_SELECT,
        })
        if (!material || material.deletedAt) {
            throw new NotFoundException(
                'Variant was not added because the selected material no longer exists.',
            )
        }
        if (companyId && material.companyId && material.companyId !== companyId) {
            throw new BadRequestException(
                'The selected material belongs to another company.',
            )
        }
        if (material.status !== 'ACTIVE') {
            throw new BadRequestException(
                'The selected material is not active. Activate it in Materials Management first.',
            )
        }
        if (!material.sellable) {
            throw new BadRequestException(
                'The selected material is not sellable. Mark it sellable in Materials Management first.',
            )
        }
        if (!material.sku?.trim()) {
            throw new BadRequestException(
                'The selected material has no Stock Keeping Unit. Add one in Materials Management first.',
            )
        }
        return material
    }

    /**
     * A material may back only one active variant. `excludeVariantIds` lists
     * the variants of the product being edited — they are about to be
     * replaced, so they do not count as "another variant".
     */
    async assertNotLinked(
        tx: Prisma.TransactionClient,
        materialId: string,
        excludeVariantIds: string[] = [],
    ) {
        const linked = await tx.sdProductVariant.findFirst({
            where: {
                materialId,
                isActive: true,
                ...(excludeVariantIds.length
                    ? { id: { notIn: excludeVariantIds } }
                    : {}),
            },
            select: {
                id: true,
                product: { select: { name: true, sku: true } },
            },
        })
        if (linked) {
            throw new ConflictException(
                `This material is already linked to another variant${
                    linked.product ? ` (${linked.product.name})` : ''
                }.`,
            )
        }
    }

    /**
     * The variant's scannable barcode.
     *
     * A barcode is unique across variants (POS / scanner look it up by
     * barcode). When the caller does not give one, the material's primary
     * barcode is used — the same code the item carries in Materials
     * Management.
     */
    async resolveVariantBarcode(
        tx: Prisma.TransactionClient,
        materialId: string,
        requested?: string | null,
        excludeVariantIds: string[] = [],
    ) {
        const wanted = requested?.trim() || null

        if (!wanted) {
            const material = await tx.mmMaterial.findUnique({
                where: { id: materialId },
                select: {
                    barcodes: {
                        where: { isPrimary: true },
                        select: { barcodeValue: true },
                        take: 1,
                    },
                },
            })
            const inherited =
                material?.barcodes?.[0]?.barcodeValue?.trim() || null
            if (!inherited) return null
            const clash = await tx.sdProductVariant.findFirst({
                where: {
                    barcode: inherited,
                    ...(excludeVariantIds.length
                        ? { id: { notIn: excludeVariantIds } }
                        : {}),
                },
                select: { id: true },
            })
            if (clash) {
                throw new ConflictException(
                    `The barcode "${inherited}" is already used by another variant.`,
                )
            }
            return inherited
        }

        const clash = await tx.sdProductVariant.findFirst({
            where: {
                barcode: wanted,
                ...(excludeVariantIds.length
                    ? { id: { notIn: excludeVariantIds } }
                    : {}),
            },
            select: { id: true },
        })
        if (clash) {
            throw new ConflictException(
                `The barcode "${wanted}" is already used by another variant.`,
            )
        }
        return wanted
    }

    /** Record the catalog origin of a manually linked material. */
    async markManuallyLinked(
        tx: Prisma.TransactionClient,
        materialId: string,
        variantId: string,
    ) {
        await tx.mmMaterial.update({
            where: { id: materialId },
            data: {
                catalogVariantId: variantId,
                catalogSource: 'MANUALLY_LINKED',
            },
        })
    }

    /**
     * The variant's sellable SKU is the material's Stock Keeping Unit. It is
     * READ from Materials Management, never generated.
     */
    async resolveVariantSku(
        tx: Prisma.TransactionClient,
        materialSku: string,
        excludeVariantIds: string[] = [],
    ) {
        const sku = materialSku.trim()
        const conflict = await tx.sdProductVariant.findFirst({
            where: {
                sku,
                ...(excludeVariantIds.length
                    ? { id: { notIn: excludeVariantIds } }
                    : {}),
            },
            select: { id: true },
        })
        if (!conflict) return sku
        throw new ConflictException(
            `The Stock Keeping Unit "${sku}" is already used by another variant. Archive that variant or give this material a different SKU.`,
        )
    }
}
