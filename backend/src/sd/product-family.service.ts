import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../prisma/prisma.service'
import { MaterialsService } from '../mm/materials/materials.service'
import {
    CreateProductFamilyDto,
    VariantInput,
} from './dto/create-product-family.dto'
import { AddVariantInput } from './dto/add-product-variants.dto'

const DIVISION_SKU_PREFIX: Record<string, string> = {
    DIV_RETAIL: 'RET',
    DIV_LPG: 'LPG',
    DIV_APPLIANCES: 'MCO',
}

/**
 * Unified product-family creation service.
 *
 * Creates the parent SD product, options, option values, variant combinations,
 * and one MM material per enabled variant — all inside a single Prisma
 * transaction. Rolling back on any failure leaves no partial records.
 */
@Injectable()
export class ProductFamilyService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly materialsService: MaterialsService,
    ) {}

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

                // 2b. Resolve material defaults from an existing linked material
                // when the caller sends placeholder values.
                if (dto.materialDefaults.materialTypeId === '__FROM_MATERIAL__') {
                    const sourceMaterialId =
                        dto.existingMaterialId ??
                        dto.variants
                            ?.find((v) => v.enabled && v.existingMaterialId)
                            ?.existingMaterialId
                    if (sourceMaterialId) {
                        const sourceMat = await (tx as any).mmMaterial.findUnique({
                            where: { id: sourceMaterialId },
                            select: {
                                materialTypeId: true,
                                materialCategoryId: true,
                                baseUomId: true,
                                salesUomId: true,
                                defaultWarehouseId: true,
                                standardCost: true,
                                safetyStock: true,
                                maximumStock: true,
                                reorderPoint: true,
                                batchManaged: true,
                                serialManaged: true,
                                expiryManaged: true,
                            },
                        })
                        if (sourceMat) {
                            dto.materialDefaults.materialTypeId = sourceMat.materialTypeId
                            dto.materialDefaults.materialCategoryId = sourceMat.materialCategoryId
                            dto.materialDefaults.baseUomId = sourceMat.baseUomId
                            if (sourceMat.salesUomId) dto.materialDefaults.salesUomId = sourceMat.salesUomId
                            if (sourceMat.defaultWarehouseId) dto.materialDefaults.defaultWarehouseId = sourceMat.defaultWarehouseId
                            dto.materialDefaults.standardCost = Number(sourceMat.standardCost ?? 0)
                            dto.materialDefaults.safetyStock = Number(sourceMat.safetyStock ?? 0)
                            dto.materialDefaults.maximumStock = Number(sourceMat.maximumStock ?? 0)
                            dto.materialDefaults.reorderPoint = Number(sourceMat.reorderPoint ?? 0)
                            dto.materialDefaults.batchManaged = sourceMat.batchManaged
                            dto.materialDefaults.serialManaged = sourceMat.serialManaged
                            dto.materialDefaults.expiryManaged = sourceMat.expiryManaged
                        }
                    }
                    // If still placeholder, try to find any material for this company
                    if (dto.materialDefaults.materialTypeId === '__FROM_MATERIAL__') {
                        const anyMat = await (tx as any).mmMaterial.findFirst({
                            where: { companyId: dto.materialDefaults.companyId },
                            select: { materialTypeId: true, materialCategoryId: true, baseUomId: true },
                        })
                        if (anyMat) {
                            dto.materialDefaults.materialTypeId = anyMat.materialTypeId
                            dto.materialDefaults.materialCategoryId = anyMat.materialCategoryId
                            dto.materialDefaults.baseUomId = anyMat.baseUomId
                        } else {
                            throw new BadRequestException(
                                'Cannot resolve material defaults: no Materials Management material found for this company. Create at least one material first.',
                            )
                        }
                    }
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
    //  addVariants — add new option values + delta combinations
    // ──────────────────────────────────────────────────────────────────────

    async addVariants(
        productId: string,
        newOptionValues: { optionName: string; values: string[] }[],
        newVariants: AddVariantInput[],
    ) {
        const product = await this.prisma.sdProduct.findUnique({
            where: { id: productId },
            include: {
                options: { include: { values: true } },
                variants: true,
            },
        })
        if (!product) throw new NotFoundException('Product not found')
        if (product.productConfig !== 'VARIABLE') {
            throw new BadRequestException('Cannot add variants to a simple product')
        }
        if (!newVariants?.length) {
            throw new BadRequestException(
                'At least one variant combination is required',
            )
        }

        const resultId = await this.prisma.$transaction(
            async (tx) => {
                // Add new option values to existing options
                for (const { optionName, values } of newOptionValues) {
                    const option = product.options.find(
                        (o) => o.name === optionName,
                    )
                    if (!option) {
                        throw new BadRequestException(
                            `Option "${optionName}" not found on product`,
                        )
                    }
                    const existingValues = new Set(
                        option.values.map((v) => v.value),
                    )
                    const maxSort = Math.max(
                        0,
                        ...option.values.map((v) => v.sortOrder),
                    )
                    let sortOrder = maxSort + 1
                    for (const value of values) {
                        if (existingValues.has(value)) continue
                        await tx.sdProductOptionValue.create({
                            data: {
                                optionId: option.id,
                                value,
                                sortOrder: sortOrder++,
                            },
                        })
                    }
                }

                // Reload options with new values for combination key generation
                const updatedProduct = await tx.sdProduct.findUniqueOrThrow({
                    where: { id: productId },
                    include: {
                        options: {
                            orderBy: { sortOrder: 'asc' },
                            include: {
                                values: { orderBy: { sortOrder: 'asc' } },
                            },
                        },
                        variants: true,
                        materialAssignments: {
                            where: { status: 'ACTIVE' },
                            take: 1,
                        },
                    },
                })

                const existingKeys = new Set(
                    updatedProduct.variants.map((v) => v.combinationKey),
                )

                // Validate the requested combinations against the product's
                // options (now including the newly added values).
                this.assertValidOptionCombination(
                    updatedProduct.options,
                    newVariants,
                )

                // Get material defaults from existing material assignment
                const matDefaults = await this.inferMaterialDefaults(
                    updatedProduct,
                    tx,
                )

                let sortOrder = Math.max(
                    0,
                    ...updatedProduct.variants.map((v) => v.sortOrder),
                ) + 1

                // Build a set of existing SKUs to avoid collisions
                const existingSkus = new Set(
                    updatedProduct.variants.map((v) => v.sku.toUpperCase()),
                )
                let skuCounter = updatedProduct.variants.length + 1

                // Duplicate-combination prevention: the request itself must not
                // repeat a combination (or SKU / barcode) — that is a client
                // bug and is rejected instead of silently ignored.
                this.assertNoDuplicatesInRequest(newVariants)

                for (const variantInput of newVariants) {
                    if (!variantInput.enabled) continue

                    const combinationKey = this.buildCombinationKey(
                        updatedProduct.options,
                        variantInput.optionValues,
                    )
                    if (existingKeys.has(combinationKey)) {
                        // Already exists — idempotent skip. Only the MISSING
                        // combinations are created; existing variants and their
                        // stock are never touched.
                        continue
                    }

                    const variantName = variantInput.optionValues.join(' / ')
                    let variantSku = variantInput.sku || ''
                    if (!variantSku) {
                        do {
                            variantSku = `${updatedProduct.sku}-V${String(skuCounter++).padStart(2, '0')}`
                        } while (existingSkus.has(variantSku.toUpperCase()))
                    }
                    existingSkus.add(variantSku.toUpperCase())

                    await this.createOneVariantWithMaterial(tx, {
                        productId,
                        product: updatedProduct,
                        variantName,
                        combinationKey,
                        sku: variantSku,
                        barcode: variantInput.barcode,
                        price: variantInput.price,
                        compareAtPrice: variantInput.compareAtPrice,
                        imageUrl: variantInput.imageUrl,
                        weight: variantInput.weight,
                        sortOrder: sortOrder++,
                        isDefault: false,
                        optionValues: variantInput.optionValues,
                        options: updatedProduct.options,
                        materialDefaults: matDefaults,
                        materialOverrides: variantInput.materialOverrides,
                        existingMaterialId: variantInput.existingMaterialId,
                        companyId: matDefaults.companyId,
                    })
                }

                return productId
            },
            { timeout: 60_000 },
        )

        return this.loadFullProduct(resultId)
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
        const variantSku = `${product.sku}-V01`

        // Create one hidden default variant
        const variant = await tx.sdProductVariant.create({
            data: {
                productId: product.id,
                variantName: 'Default',
                combinationKey: '__default__',
                sku: variantSku,
                isActive: true,
                isDefault: true,
                isPublished: true,
                isHidden: true,
                companyId: dto.materialDefaults.companyId,
                salesUomId: dto.salesUomId ?? dto.materialDefaults.salesUomId ?? null,
            },
        })

        // Create (or link) the material
        const material = await this.createOrLinkMaterial(tx, {
            variant,
            product,
            materialDefaults: dto.materialDefaults,
            materialOverrides: undefined,
            existingMaterialId: dto.existingMaterialId,
        })

        // Link material to the variant
        await tx.sdProductVariant.update({
            where: { id: variant.id },
            data: { materialId: material.id },
        })

        // Parent-level material assignment (SIMPLE only): the product has exactly
        // one hidden default variant, so this stays unambiguous for the legacy
        // `resolveMaterialForProduct` callers. VARIABLE products must not have
        // one — the variant owns its material.
        await tx.sdProductMaterialAssignment.create({
            data: {
                productId: product.id,
                materialId: material.id,
                companyId: dto.materialDefaults.companyId,
                divisionId: dto.divisionId,
                salesUomId: dto.salesUomId ?? dto.materialDefaults.salesUomId ?? null,
                materialUomId: dto.materialDefaults.baseUomId,
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
                    salesUomId: dto.salesUomId ?? dto.materialDefaults.salesUomId ?? null,
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

            // 8-9. Create or link MM material
            const material = await this.createOrLinkMaterial(tx, {
                variant,
                product,
                materialDefaults: dto.materialDefaults,
                materialOverrides: vi.materialOverrides,
                existingMaterialId: vi.existingMaterialId,
            })

            await tx.sdProductVariant.update({
                where: { id: variant.id },
                data: { materialId: material.id },
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
    //  Private: create or link a single material for a variant
    // ──────────────────────────────────────────────────────────────────────

    private async createOrLinkMaterial(
        tx: Prisma.TransactionClient,
        args: {
            variant: { id: string; sku: string; variantName: string; barcode?: string | null }
            product: { id: string; sku: string; name: string }
            materialDefaults: CreateProductFamilyDto['materialDefaults']
            materialOverrides?: VariantInput['materialOverrides']
            existingMaterialId?: string
        },
    ) {
        const { variant, product, materialDefaults, materialOverrides, existingMaterialId } = args

        if (existingMaterialId) {
            const existing = await (tx as any).mmMaterial.findUnique({
                where: { id: existingMaterialId },
            })
            if (!existing) {
                throw new BadRequestException(
                    `Material ${existingMaterialId} not found`,
                )
            }
            if (existing.companyId && existing.companyId !== materialDefaults.companyId) {
                throw new BadRequestException(
                    `Material ${existing.materialCode} belongs to a different company`,
                )
            }
            // Mark the existing material as linked
            await (tx as any).mmMaterial.update({
                where: { id: existingMaterialId },
                data: {
                    catalogVariantId: variant.id,
                    catalogSource: 'MANUALLY_LINKED',
                },
            })
            return existing
        }

        // Auto-create a new material
        const materialName = `${product.name} — ${variant.variantName}`
        const merged = {
            ...materialDefaults,
            ...(materialOverrides ?? {}),
        }

        const material = await this.materialsService.createWithClient(
            {
                materialName,
                description: `Auto-created from Product Catalog: ${product.name}, variant ${variant.variantName}`,
                sku: variant.sku,
                materialTypeId: materialDefaults.materialTypeId,
                materialCategoryId: materialDefaults.materialCategoryId,
                baseUomId: merged.baseUomId,
                salesUomId: merged.salesUomId,
                companyId: materialDefaults.companyId,
                defaultWarehouseId: merged.defaultWarehouseId,
                standardCost: merged.standardCost,
                safetyStock: merged.safetyStock,
                maximumStock: merged.maximumStock,
                reorderPoint: merged.reorderPoint,
                batchManaged: merged.batchManaged,
                serialManaged: merged.serialManaged,
                expiryManaged: merged.expiryManaged,
                sellable: true,
                inventoryManaged: true,
                purchasable: true,
                status: 'ACTIVE',
                catalogVariantId: variant.id,
                catalogSource: 'AUTO_CREATED',
            },
            tx,
        )

        return material
    }

    // ──────────────────────────────────────────────────────────────────────
    //  Private: helper for addVariants that creates one variant + material
    // ──────────────────────────────────────────────────────────────────────

    private async createOneVariantWithMaterial(
        tx: Prisma.TransactionClient,
        args: {
            productId: string
            product: { id: string; sku: string; name: string; price: Decimal }
            variantName: string
            combinationKey: string
            sku: string
            barcode?: string | null
            price?: number | null
            compareAtPrice?: number | null
            imageUrl?: string
            weight?: number
            sortOrder: number
            isDefault: boolean
            optionValues: string[]
            options: Array<{
                id: string
                name: string
                values: Array<{ id: string; value: string }>
            }>
            materialDefaults: {
                companyId: string
                materialTypeId: string
                materialCategoryId: string
                baseUomId: string
                salesUomId?: string
                defaultWarehouseId?: string
                standardCost?: number
                safetyStock?: number
                maximumStock?: number
                reorderPoint?: number
                batchManaged?: boolean
                serialManaged?: boolean
                expiryManaged?: boolean
            }
            materialOverrides?: VariantInput['materialOverrides']
            existingMaterialId?: string
            companyId: string
        },
    ) {
        const variant = await tx.sdProductVariant.create({
            data: {
                productId: args.productId,
                variantName: args.variantName,
                combinationKey: args.combinationKey,
                sku: args.sku,
                barcode: args.barcode ?? null,
                price: args.price != null ? new Decimal(args.price) : null,
                compareAtPrice:
                    args.compareAtPrice != null
                        ? new Decimal(args.compareAtPrice)
                        : null,
                imageUrl: args.imageUrl ?? '',
                weight: args.weight != null ? new Decimal(args.weight) : null,
                isActive: true,
                isDefault: args.isDefault,
                isPublished: true,
                isHidden: false,
                sortOrder: args.sortOrder,
                companyId: args.companyId,
            },
        })

        // Link option values
        for (let i = 0; i < args.options.length; i++) {
            const opt = args.options[i]
            const valueName = args.optionValues[i]
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

        const material = await this.createOrLinkMaterial(tx, {
            variant,
            product: args.product,
            materialDefaults: args.materialDefaults,
            materialOverrides: args.materialOverrides,
            existingMaterialId: args.existingMaterialId,
        })

        await tx.sdProductVariant.update({
            where: { id: variant.id },
            data: { materialId: material.id },
        })

        // No parent-level material assignment here either — the new variant
        // owns its material (the parent is VARIABLE).

        return variant
    }

    // ──────────────────────────────────────────────────────────────────────
    //  Helpers
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Reject a request that repeats the same combination, SKU or barcode.
     * Repeating an EXISTING combination is an idempotent skip; repeating one
     * inside the request is a client bug and is surfaced as a conflict.
     */
    private assertNoDuplicatesInRequest(variants: AddVariantInput[]) {
        const combinations = new Set<string>()
        const skus = new Set<string>()
        const barcodes = new Set<string>()

        for (const variant of variants) {
            if (!variant.enabled) continue

            const combination = variant.optionValues
                .map((value) => value.trim().toLowerCase())
                .join('|')
            if (combinations.has(combination)) {
                throw new ConflictException(
                    `Duplicate combination in request: ${variant.optionValues.join(' / ')}`,
                )
            }
            combinations.add(combination)

            if (variant.sku?.trim()) {
                const sku = variant.sku.trim().toUpperCase()
                if (skus.has(sku)) {
                    throw new ConflictException(
                        `Duplicate variant SKU in request: ${variant.sku}`,
                    )
                }
                skus.add(sku)
            }

            if (variant.barcode?.trim()) {
                const barcode = variant.barcode.trim().toLowerCase()
                if (barcodes.has(barcode)) {
                    throw new ConflictException(
                        `Duplicate variant barcode in request: ${variant.barcode}`,
                    )
                }
                barcodes.add(barcode)
            }
        }
    }

    /**
     * Every requested variant must select exactly one existing value per
     * product option — a variant without its option values would break the
     * storefront's combination lookup.
     */
    private assertValidOptionCombination(
        options: Array<{ name: string; values: Array<{ value: string }> }>,
        variants: AddVariantInput[],
    ) {
        for (const variant of variants) {
            if (!variant.enabled) continue
            if (variant.optionValues.length !== options.length) {
                throw new BadRequestException(
                    `Combination "${variant.optionValues.join(' / ')}" must select one value for each of the ${options.length} option(s): ${options.map((o) => o.name).join(', ')}`,
                )
            }
            options.forEach((option, index) => {
                const value = variant.optionValues[index]?.trim()
                if (!value) {
                    throw new BadRequestException(
                        `Combination "${variant.optionValues.join(' / ')}" is missing a value for option "${option.name}"`,
                    )
                }
                const known = option.values.some(
                    (optionValue) =>
                        optionValue.value.toLowerCase() === value.toLowerCase(),
                )
                if (!known) {
                    throw new BadRequestException(
                        `Value "${value}" is not an available value for option "${option.name}"`,
                    )
                }
            })
        }
    }

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
        const cat = await (tx as any).mmMaterialCategory.findUnique({
            where: { id: categoryId },
            select: { name: true },
        })
        return cat?.name ?? null
    }

    private async inferMaterialDefaults(
        product: any,
        tx: Prisma.TransactionClient,
    ) {
        const assignment = product.materialAssignments?.[0]
        if (assignment) {
            const mat = await (tx as any).mmMaterial.findUnique({
                where: { id: assignment.materialId },
            })
            if (mat) {
                return this.materialDefaultsFromMaterial(
                    mat,
                    assignment.companyId,
                )
            }
        }

        // VARIABLE products have no parent-level assignment (the variant owns
        // its material) — infer the defaults from an existing sibling variant
        // so newly added combinations get consistent material defaults.
        const sibling = product.variants?.find(
            (v: { materialId?: string | null }) => v.materialId,
        )
        if (sibling) {
            const mat = await (tx as any).mmMaterial.findUnique({
                where: { id: sibling.materialId },
            })
            if (mat) {
                const ownerCompanyId =
                    sibling.companyId ??
                    product.materialAssignments?.[0]?.companyId ??
                    mat.companyId
                if (!ownerCompanyId) {
                    throw new BadRequestException(
                        'Cannot infer the company for the new material — link an existing material or set the material defaults explicitly.',
                    )
                }
                return this.materialDefaultsFromMaterial(mat, ownerCompanyId)
            }
        }

        throw new BadRequestException(
            'Cannot infer material defaults from this product — no linked material found on the product or its variants',
        )
    }

    /** Normalise an MM material into the material-defaults shape. */
    private materialDefaultsFromMaterial(
        mat: {
            companyId?: string | null
            materialTypeId: string
            materialCategoryId: string
            baseUomId: string
            salesUomId?: string | null
            defaultWarehouseId?: string | null
            standardCost?: unknown
            safetyStock?: unknown
            maximumStock?: unknown
            reorderPoint?: unknown
            batchManaged?: boolean | null
            serialManaged?: boolean | null
            expiryManaged?: boolean | null
        },
        companyId: string,
    ) {
        return {
            companyId,
            materialTypeId: mat.materialTypeId,
            materialCategoryId: mat.materialCategoryId,
            baseUomId: mat.baseUomId,
            salesUomId: mat.salesUomId ?? undefined,
            defaultWarehouseId: mat.defaultWarehouseId ?? undefined,
            standardCost: Number(mat.standardCost ?? 0),
            safetyStock: Number(mat.safetyStock ?? 0),
            maximumStock: Number(mat.maximumStock ?? 0),
            reorderPoint: Number(mat.reorderPoint ?? 0),
            batchManaged: mat.batchManaged ?? false,
            serialManaged: mat.serialManaged ?? false,
            expiryManaged: mat.expiryManaged ?? false,
        }
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
