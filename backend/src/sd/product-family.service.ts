import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../prisma/prisma.service'
import { CreateProductFamilyDto } from './dto/create-product-family.dto'
import { DEFAULT_COMBINATION_KEY } from './product-combination-key'

const DIVISION_SKU_PREFIX: Record<string, string> = {
    DIV_RETAIL: 'RET',
    DIV_LPG: 'LPG',
    DIV_APPLIANCES: 'MCO',
}

/**
 * Unified product-family creation service.
 *
 * Creates the parent SD product, its options, option values and variant
 * combinations — all inside a single Prisma transaction. Rolling back on any
 * failure leaves no partial records.
 *
 * Every variant LINKS an EXISTING Material Master item. This service never
 * creates a material, a material SKU, an opening stock row or a stock balance:
 * materials are created manually under Materials Management.
 */
@Injectable()
export class ProductFamilyService {
    constructor(private readonly prisma: PrismaService) {}

    // ──────────────────────────────────────────────────────────────────────
    //  createProductFamily — one atomic transaction
    // ──────────────────────────────────────────────────────────────────────

    async createProductFamily(dto: CreateProductFamilyDto) {
        // 1. Idempotency guard (outside transaction for fast reject)
        if (dto.idempotencyKey) {
            const existing = await this.prisma.sdProduct.findUnique({
                where: { idempotencyKey: dto.idempotencyKey },
                select: { id: true, sku: true },
            })
            if (existing) {
                return this.loadFullProduct(existing.id)
            }
        }

        this.validateDto(dto)

        const createdProductId = await this.prisma.$transaction(
            async (tx) => {
                // 2. Validate company
                const company = await tx.company.findUnique({
                    where: { id: dto.materialDefaults.companyId },
                })
                if (!company) {
                    throw new BadRequestException(
                        `Company ${dto.materialDefaults.companyId} not found`,
                    )
                }

                // 3. Create parent product
                const productSku =
                    dto.sku?.trim() ||
                    (await this.generateNextProductSku(dto.divisionId, tx))

                const category =
                    dto.category?.trim() ||
                    (await this.materialCategoryName(
                        dto.materialDefaults.materialCategoryId,
                        tx,
                    )) ||
                    'General'

                const product = await tx.sdProduct.create({
                    data: {
                        divisionId: dto.divisionId,
                        sku: productSku,
                        name: dto.name,
                        description: dto.description ?? '',
                        price: new Decimal(dto.price),
                        originalPrice: dto.originalPrice != null
                            ? new Decimal(dto.originalPrice)
                            : null,
                        category,
                        imageUrl: dto.imageUrl ?? '',
                        badge: dto.badge ?? null,
                        productType: 'STOCK_ITEM',
                        productConfig: dto.productConfig,
                        salesUomId: dto.salesUomId ?? null,
                        idempotencyKey: dto.idempotencyKey ?? null,
                        status: 'ACTIVE',
                        isActive: true,
                    },
                })

                if (dto.productConfig === 'SIMPLE') {
                    await this.createSimpleVariant(tx, product, dto)
                } else {
                    await this.createVariableVariants(tx, product, dto)
                }

                return product.id
            },
            { timeout: 60_000 },
        )

        return this.loadFullProduct(createdProductId)
    }

    // ──────────────────────────────────────────────────────────────────────
    //  archiveVariant
    // ──────────────────────────────────────────────────────────────────────

    async archiveVariant(variantId: string) {
        const variant = await this.prisma.sdProductVariant.findUnique({
            where: { id: variantId },
        })
        if (!variant) throw new NotFoundException('Variant not found')

        return this.prisma.sdProductVariant.update({
            where: { id: variantId },
            data: {
                isActive: false,
                isPublished: false,
            },
        })
    }

    // ──────────────────────────────────────────────────────────────────────
    //  Private: simple product creation
    // ──────────────────────────────────────────────────────────────────────

    private async createSimpleVariant(
        tx: Prisma.TransactionClient,
        product: { id: string; sku: string; name: string; price: Decimal },
        dto: CreateProductFamilyDto,
    ) {
        // One hidden default variant linked to an EXISTING material.
        const variant = await tx.sdProductVariant.create({
            data: {
                productId: product.id,
                variantName: 'Default',
                combinationKey: DEFAULT_COMBINATION_KEY,
                sku: `${product.sku}-V01`,
                isActive: true,
                isDefault: true,
                isPublished: true,
                isHidden: true,
                companyId: dto.materialDefaults.companyId,
                salesUomId: dto.salesUomId ?? null,
            },
        })

        // Link the EXISTING material (never create one).
        const material = await this.resolveExistingMaterial(tx, {
            variant,
            companyId: dto.materialDefaults.companyId,
            existingMaterialId: dto.existingMaterialId,
        })

        // The variant's sellable SKU is the material's Stock Keeping Unit.
        await tx.sdProductVariant.update({
            where: { id: variant.id },
            data: {
                materialId: material.id,
                sku: material.sku!,
                salesUomId: material.baseUomId,
                materialUomId: material.baseUomId,
            },
        })

        // Parent-level material assignment (SIMPLE only): the product has exactly
        // one hidden default variant, so this stays unambiguous for the legacy
        // `resolveMaterialForProduct` callers. VARIABLE products must not have
        // one — the variant owns its material.
        await tx.sdProductMaterialAssignment.create({
            data: {
                productId: product.id,
                materialId: material.id,
                companyId: material.companyId ?? dto.materialDefaults.companyId,
                divisionId: dto.divisionId,
                salesUomId: material.baseUomId,
                materialUomId: material.baseUomId,
                fulfillmentType: 'WAREHOUSE',
                inventoryRelevant: true,
                atpRelevant: true,
                reservationRelevant: true,
                status: 'ACTIVE',
            },
        })

        // Set default variant on the product
        await tx.sdProduct.update({
            where: { id: product.id },
            data: { defaultVariantId: variant.id },
        })
    }

    // ──────────────────────────────────────────────────────────────────────
    //  Private: variable product creation
    // ──────────────────────────────────────────────────────────────────────

    private async createVariableVariants(
        tx: Prisma.TransactionClient,
        product: { id: string; sku: string; name: string; price: Decimal },
        dto: CreateProductFamilyDto,
    ) {
        const options = dto.options ?? []
        const variants = dto.variants ?? []

        if (options.length === 0) {
            throw new BadRequestException(
                'Variable products require at least one option',
            )
        }

        // 4-5. Create options + option values
        const createdOptions: Array<{
            id: string
            name: string
            values: Array<{ id: string; value: string }>
        }> = []

        for (let i = 0; i < options.length; i++) {
            const optInput = options[i]
            const option = await tx.sdProductOption.create({
                data: {
                    productId: product.id,
                    name: optInput.name,
                    sortOrder: optInput.sortOrder ?? i,
                    isRequired: optInput.isRequired ?? true,
                    displayStyle: optInput.displayStyle ?? 'BUTTON',
                },
            })
            const createdValues: Array<{ id: string; value: string }> = []
            for (let j = 0; j < optInput.values.length; j++) {
                const valInput = optInput.values[j]
                const value = await tx.sdProductOptionValue.create({
                    data: {
                        optionId: option.id,
                        value: valInput.value,
                        sortOrder: valInput.sortOrder ?? j,
                        swatchColor: valInput.swatchColor ?? null,
                        imageUrl: valInput.imageUrl ?? '',
                    },
                })
                createdValues.push({ id: value.id, value: value.value })
            }
            createdOptions.push({
                id: option.id,
                name: option.name,
                values: createdValues,
            })
        }

        // 6-7. Create variant rows with materials
        const enabledVariants = variants.filter((v) => v.enabled)
        if (enabledVariants.length === 0) {
            throw new BadRequestException(
                'At least one enabled variant combination is required',
            )
        }

        let defaultVariantId: string | null = null

        for (let i = 0; i < enabledVariants.length; i++) {
            const vi = enabledVariants[i]
            const combinationKey = this.buildCombinationKeyFromOptions(
                createdOptions,
                vi.optionValues,
            )
            const variantName = vi.optionValues.join(' / ')
            const variantSku =
                vi.sku ||
                `${product.sku}-V${String(i + 1).padStart(2, '0')}`

            const variant = await tx.sdProductVariant.create({
                data: {
                    productId: product.id,
                    variantName,
                    combinationKey,
                    sku: variantSku,
                    barcode: vi.barcode ?? null,
                    price: vi.price != null ? new Decimal(vi.price) : null,
                    compareAtPrice:
                        vi.compareAtPrice != null
                            ? new Decimal(vi.compareAtPrice)
                            : null,
                    imageUrl: vi.imageUrl ?? '',
                    weight: vi.weight != null ? new Decimal(vi.weight) : null,
                    isActive: true,
                    isDefault: i === 0,
                    isPublished: true,
                    isHidden: false,
                    sortOrder: i,
                    companyId: dto.materialDefaults.companyId,
                    salesUomId: dto.salesUomId ?? null,
                },
            })

            // Link option values to the variant
            for (let optIdx = 0; optIdx < createdOptions.length; optIdx++) {
                const opt = createdOptions[optIdx]
                const valueName = vi.optionValues[optIdx]
                const optValue = opt.values.find((v) => v.value === valueName)
                if (optValue) {
                    await tx.sdProductVariantOptionValue.create({
                        data: {
                            variantId: variant.id,
                            optionValueId: optValue.id,
                        },
                    })
                }
            }

            // Link the EXISTING MM material (never create one).
            const material = await this.resolveExistingMaterial(tx, {
                variant,
                companyId: dto.materialDefaults.companyId,
                existingMaterialId: vi.existingMaterialId,
            })

            await tx.sdProductVariant.update({
                where: { id: variant.id },
                data: {
                    materialId: material.id,
                    salesUomId: material.baseUomId,
                    materialUomId: material.baseUomId,
                },
            })

            // NOTE: no parent-level material assignment for VARIABLE products.
            // The variant owns its material; the parent must never hold stock
            // (one parent assignment per variant made `resolveMaterialForProduct`
            // pick an arbitrary material, so a variant line could be reserved
            // against another variant's stock).

            if (i === 0) defaultVariantId = variant.id
        }

        // 12. Set the default variant
        if (defaultVariantId) {
            await tx.sdProduct.update({
                where: { id: product.id },
                data: { defaultVariantId },
            })
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    //  Private: resolve the EXISTING material a variant links to
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Resolve the EXISTING Material Master item a variant links to.
     *
     * The Product Catalog NEVER creates a Material Master record, a material
     * SKU, an opening stock row or a stock balance. Materials are created
     * manually under Materials Management and linked to a variant here.
     */
    private async resolveExistingMaterial(
        tx: Prisma.TransactionClient,
        args: {
            variant: { id: string }
            companyId: string
            existingMaterialId?: string
        },
    ) {
        const { variant, companyId, existingMaterialId } = args

        if (!existingMaterialId) {
            throw new BadRequestException(
                'Select an existing Material Master item. Materials are created in Materials Management and linked to a variant.',
            )
        }

        const material = await tx.mmMaterial.findFirst({
            where: { id: existingMaterialId },
            select: {
                id: true,
                materialCode: true,
                materialName: true,
                sku: true,
                status: true,
                sellable: true,
                companyId: true,
                baseUomId: true,
                deletedAt: true,
            },
        })
        if (!material || material.deletedAt) {
            throw new NotFoundException(
                'Variant was not added because the selected material no longer exists.',
            )
        }
        if (material.companyId && material.companyId !== companyId) {
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

        // A material may back only one active variant.
        const linked = await tx.sdProductVariant.findFirst({
            where: {
                materialId: material.id,
                isActive: true,
                id: { not: variant.id },
            },
            select: { id: true },
        })
        if (linked) {
            throw new ConflictException(
                'This material is already linked to another variant.',
            )
        }

        // Record the catalog origin so the audit report can tell manually
        // linked materials from the ones the old bug auto-created.
        await tx.mmMaterial.update({
            where: { id: material.id },
            data: {
                catalogVariantId: variant.id,
                catalogSource: 'MANUALLY_LINKED',
            },
        })

        return material
    }

    // ──────────────────────────────────────────────────────────────────────
    //  Helpers
    // ──────────────────────────────────────────────────────────────────────



    private validateDto(dto: CreateProductFamilyDto) {
        if (dto.productConfig === 'VARIABLE') {
            if (!dto.options?.length) {
                throw new BadRequestException(
                    'Variable products require at least one option',
                )
            }
            if (!dto.variants?.length) {
                throw new BadRequestException(
                    'Variable products require at least one variant combination',
                )
            }
            if (!dto.variants.some((v) => v.enabled)) {
                throw new BadRequestException(
                    'At least one variant must be enabled',
                )
            }
            // Check for duplicate combination keys — a conflict (the same
            // combination was requested twice), not a malformed request.
            const keys = new Set<string>()
            for (const v of dto.variants.filter((x) => x.enabled)) {
                const key = v.optionValues.map((s) => s.toLowerCase().trim()).join('|')
                if (keys.has(key)) {
                    throw new ConflictException(
                        `Duplicate combination: ${v.optionValues.join(' / ')}`,
                    )
                }
                keys.add(key)
            }
            // Check for duplicate SKUs
            const skus = new Set<string>()
            for (const v of dto.variants.filter((x) => x.enabled && x.sku)) {
                const sku = v.sku!.toLowerCase().trim()
                if (skus.has(sku)) {
                    throw new ConflictException(
                        `Duplicate variant SKU: ${v.sku}`,
                    )
                }
                skus.add(sku)
            }
            // Check for duplicate barcodes
            const barcodes = new Set<string>()
            for (const v of dto.variants.filter((x) => x.enabled && x.barcode)) {
                const barcode = v.barcode!.toLowerCase().trim()
                if (barcodes.has(barcode)) {
                    throw new ConflictException(
                        `Duplicate variant barcode: ${v.barcode}`,
                    )
                }
                barcodes.add(barcode)
            }
        }
    }

    private buildCombinationKeyFromOptions(
        options: Array<{
            name: string
            values: Array<{ id: string; value: string }>
        }>,
        valueNames: string[],
    ): string {
        return options
            .map((opt, i) => {
                const name = opt.name.toLowerCase().trim()
                const value = (valueNames[i] ?? '').toLowerCase().trim()
                return `${name}:${value}`
            })
            .join('|')
    }

    private buildCombinationKey(
        options: Array<{
            id: string
            name: string
            values: Array<{ id: string; value: string }>
        }>,
        valueNames: string[],
    ): string {
        return options
            .map((opt, i) => {
                const name = opt.name.toLowerCase().trim()
                const value = (valueNames[i] ?? '').toLowerCase().trim()
                return `${name}:${value}`
            })
            .join('|')
    }

    private async generateNextProductSku(
        divisionId: string,
        tx: Prisma.TransactionClient,
    ): Promise<string> {
        const prefix = DIVISION_SKU_PREFIX[divisionId] ?? 'PRD'
        const pattern = `${prefix}-PRD-`
        const rows = await tx.sdProduct.findMany({
            where: { divisionId, sku: { startsWith: pattern } },
            select: { sku: true },
        })
        let max = 0
        for (const row of rows) {
            const tail = row.sku.slice(pattern.length)
            const n = parseInt(tail, 10)
            if (!Number.isNaN(n) && n > max) max = n
        }
        return `${pattern}${String(max + 1).padStart(6, '0')}`
    }

    private async materialCategoryName(
        categoryId: string | undefined,
        tx: Prisma.TransactionClient,
    ): Promise<string | null> {
        if (!categoryId) return null
        const cat = await tx.mmMaterialCategory.findUnique({
            where: { id: categoryId },
            select: { name: true },
        })
        return cat?.name ?? null
    }


    private async loadFullProduct(productId: string) {
        return this.prisma.sdProduct.findUniqueOrThrow({
            where: { id: productId },
            include: {
                options: {
                    orderBy: { sortOrder: 'asc' },
                    include: {
                        values: { orderBy: { sortOrder: 'asc' } },
                    },
                },
                variants: {
                    orderBy: { sortOrder: 'asc' },
                    include: {
                        optionValues: {
                            include: { optionValue: true },
                        },
                        material: {
                            select: {
                                id: true,
                                materialCode: true,
                                materialName: true,
                                sku: true,
                            },
                        },
                    },
                },
                materialAssignments: {
                    where: { status: 'ACTIVE' },
                    include: {
                        material: {
                            select: {
                                id: true,
                                materialCode: true,
                                materialName: true,
                                sku: true,
                            },
                        },
                        company: {
                            select: {
                                id: true,
                                name: true,
                                code: true,
                            },
                        },
                    },
                },
            },
        })
    }
}
