import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../prisma/prisma.service'
import { ProductOptionVariantsService } from './product-option-variants.service'
import { CommercialAvailabilityService } from './commercial-availability.service'
import { InventoryAvailabilityService } from '../mm/inventory/inventory-availability.service'
import type { CompanyMaterialTotals } from '../mm/inventory/inventory-availability.service'
import {
    ProductMaterialLinkService,
    type LinkableMaterial,
} from './product-material-link.service'
import { AddVariantDto, UpdateVariantDto } from './dto/product-variant.dto'
import {
    humanCombination,
    materialCombinationKey,
    optionCombinationKey,
} from './product-combination-key'

/** Combination key used when a product has no customer-selectable options. */
export { DEFAULT_COMBINATION_KEY } from './product-combination-key'

/**
 * Add / Edit a child Product Variant.
 *
 * The variant LINKS an existing Material Master item — this service never
 * creates a material, a material SKU, an opening stock record or a stock
 * balance. The parent product is never cloned or created here either: a
 * variant is always a child of an existing parent product.
 */
@Injectable()
export class ProductVariantService {
    private readonly logger = new Logger(ProductVariantService.name)

    constructor(
        private readonly prisma: PrismaService,
        private readonly optionVariants: ProductOptionVariantsService,
        private readonly materialLink: ProductMaterialLinkService,
        private readonly availability: CommercialAvailabilityService,
        private readonly inventoryAtp: InventoryAvailabilityService,
    ) {}

    // ──────────────────────────────────────────────────────────────────────
    //  Add variant
    // ──────────────────────────────────────────────────────────────────────

    async addVariant(productId: string, dto: AddVariantDto) {
        const parent = await this.prisma.sdProduct.findUnique({
            where: { id: productId },
            include: {
                materialAssignments: {
                    where: { status: 'ACTIVE' },
                    select: { companyId: true },
                    take: 1,
                },
                options: {
                    orderBy: { sortOrder: 'asc' },
                    include: { values: { orderBy: { sortOrder: 'asc' } } },
                },
                variants: {
                    select: {
                        id: true,
                        isActive: true,
                        isDefault: true,
                        isHidden: true,
                        companyId: true,
                        sortOrder: true,
                    },
                },
            },
        })
        if (!parent) {
            throw new NotFoundException(
                'The product was not found. It may have been deleted — refresh the Product Catalog.',
            )
        }

        // Idempotency: a double submit returns the existing result.
        if (dto.idempotencyKey) {
            const existing = await this.findByIdempotencyKey(
                parent.id,
                dto.idempotencyKey,
            )
            if (existing) {
                return this.optionVariants.getForProduct(parent.id)
            }
        }

        const companyId = await this.resolveCompanyId(parent)

        const result = await this.prisma.$transaction(
            async (tx) => {
                const material = await this.assertLinkableMaterial(
                    tx,
                    dto.materialId,
                    companyId,
                )

                const combinationKey = await this.buildCombinationKey(
                    tx,
                    parent.id,
                    dto.optionValues ?? [],
                    material.id,
                )

                // The combination must not already exist. A product WITHOUT
                // options has no combination to clash on — there the material
                // is the discriminator and `assertMaterialNotLinked` below
                // reports the clash with a message the user can act on.
                if (parent.options.length > 0) {
                    const duplicate = await tx.sdProductVariant.findFirst({
                        where: { productId: parent.id, combinationKey },
                        select: { id: true, sku: true },
                    })
                    if (duplicate) {
                        throw new ConflictException(
                            `${this.humanCombination(dto.optionValues)} already exists for this product.`,
                        )
                    }
                }

                // The material may only back one active variant.
                await this.assertMaterialNotLinked(tx, material.id, null)

                const variantName =
                    dto.variantName?.trim() ||
                    (dto.optionValues ?? []).join(' / ') ||
                    material.materialName
                const sku = await this.resolveVariantSku(tx, material.sku)
                const barcode = await this.materialLink.resolveVariantBarcode(
                    tx,
                    material.id,
                    dto.barcode,
                )

                const variant = await tx.sdProductVariant.create({
                    data: {
                        productId: parent.id,
                        variantName,
                        combinationKey,
                        sku,
                        barcode,
                        price:
                            dto.price === null || dto.price === undefined
                                ? null
                                : new Decimal(dto.price),
                        imageUrl: dto.imageUrl?.trim() ?? '',
                        weight: dto.weight ?? null,
                        isActive: true,
                        isDefault: false,
                        isPublished: dto.isPublished ?? true,
                        isHidden: false,
                        sortOrder: this.nextSortOrder(parent.variants),
                        materialId: material.id,
                        companyId: material.companyId ?? companyId,
                        salesUomId: material.baseUomId,
                        materialUomId: material.baseUomId,
                        idempotencyKey: dto.idempotencyKey ?? null,
                    },
                })

                // Link the selected option values (one per product option).
                await this.linkOptionValues(
                    tx,
                    parent.id,
                    variant.id,
                    dto.optionValues ?? [],
                )

                // Record the catalog origin so the audit report can tell
                // manually linked materials from the ones the old bug
                // auto-created.
                await this.materialLink.markManuallyLinked(
                    tx,
                    material.id,
                    variant.id,
                )

                // The first variant becomes the default when none exists.
                const hasDefault = parent.variants.some((v) => v.isDefault)
                const makeDefault = dto.isDefault ?? !hasDefault
                if (makeDefault) {
                    await tx.sdProductVariant.updateMany({
                        where: { productId: parent.id, isDefault: true },
                        data: { isDefault: false },
                    })
                    await tx.sdProductVariant.update({
                        where: { id: variant.id },
                        data: { isDefault: true },
                    })
                }

                // A product with a selectable variant is a VARIABLE product.
                await tx.sdProduct.update({
                    where: { id: parent.id },
                    data: {
                        productConfig: 'VARIABLE',
                        ...(hasDefault
                            ? {}
                            : { defaultVariantId: variant.id }),
                    },
                })

                // The hidden default variant of a SIMPLE product becomes a
                // normal, visible choice: the product now sells more than one
                // item, so the original must stay on the storefront.
                const hiddenDefault = parent.variants.find(
                    (v) => v.isHidden && v.isActive,
                )
                if (hiddenDefault) {
                    await tx.sdProductVariant.update({
                        where: { id: hiddenDefault.id },
                        data: { isHidden: false },
                    })
                }

                // Remember the idempotency key on the variant row so a retry
                // returns the same variant instead of creating a second one.

                return variant
            },
            { timeout: 30_000 },
        )

        this.logger.log(
            `Variant "${result.variantName}" (${result.sku}) added to product ${parent.id} with existing material ${result.materialId}`,
        )

        return this.optionVariants.getForProduct(parent.id)
    }

    // ──────────────────────────────────────────────────────────────────────
    //  Edit variant
    // ──────────────────────────────────────────────────────────────────────

    async updateVariant(
        productId: string,
        variantId: string,
        dto: UpdateVariantDto,
    ) {
        const variant = await this.prisma.sdProductVariant.findFirst({
            where: { id: variantId, productId },
            include: {
                product: {
                    include: {
                        materialAssignments: {
                            where: { status: 'ACTIVE' },
                            select: { companyId: true },
                            take: 1,
                        },
                        variants: {
                            select: { companyId: true },
                        },
                        options: {
                            orderBy: { sortOrder: 'asc' },
                            include: {
                                values: { orderBy: { sortOrder: 'asc' } },
                            },
                        },
                    },
                },
            },
        })
        if (!variant) {
            throw new NotFoundException(
                'The variant was not found on this product. It may have been deleted — refresh the Product Catalog.',
            )
        }

        const companyId = await this.resolveCompanyId(variant.product)

        await this.prisma.$transaction(
            async (tx) => {
                const data: Prisma.SdProductVariantUncheckedUpdateInput = {}

                if (dto.materialId && dto.materialId !== variant.materialId) {
                    const material = await this.assertLinkableMaterial(
                        tx,
                        dto.materialId,
                        companyId,
                    )
                    await this.assertMaterialNotLinked(tx, material.id, variant.id)
                    data.materialId = material.id
                    data.companyId = material.companyId ?? companyId
                    data.salesUomId = material.baseUomId
                    data.materialUomId = material.baseUomId
                    // The sellable SKU follows the material; the old material
                    // and its stock are left untouched.
                    const sku = await this.resolveVariantSku(
                        tx,
                        material.sku,
                        variant.id,
                    )
                    data.sku = sku
                    // A product without options keys its variants by material,
                    // so the key follows the new material.
                    if (variant.product.options.length === 0) {
                        data.combinationKey = materialCombinationKey(material.id)
                    }
                }

                if (dto.optionValues) {
                    const combinationKey = await this.buildCombinationKey(
                        tx,
                        productId,
                        dto.optionValues,
                    )
                    const duplicate = await tx.sdProductVariant.findFirst({
                        where: { productId, combinationKey, id: { not: variantId } },
                        select: { id: true },
                    })
                    if (duplicate) {
                        throw new ConflictException(
                            `${this.humanCombination(dto.optionValues)} already exists for this product.`,
                        )
                    }
                    data.combinationKey = combinationKey
                    await this.linkOptionValues(
                        tx,
                        productId,
                        variantId,
                        dto.optionValues,
                    )
                }

                if (dto.variantName !== undefined) {
                    data.variantName = dto.variantName.trim()
                }
                if (dto.barcode !== undefined) {
                    const barcodeMaterialId =
                        dto.materialId ?? variant.materialId
                    data.barcode = barcodeMaterialId
                        ? await this.materialLink.resolveVariantBarcode(
                              tx,
                              barcodeMaterialId,
                              dto.barcode,
                              [variant.id],
                          )
                        : dto.barcode?.trim() || null
                }
                if (dto.weight !== undefined) {
                    data.weight = dto.weight
                }
                if (dto.price !== undefined) {
                    data.price =
                        dto.price === null ? null : new Decimal(dto.price)
                }
                if (dto.imageUrl !== undefined) {
                    data.imageUrl = dto.imageUrl.trim()
                }
                if (dto.isActive !== undefined) {
                    data.isActive = dto.isActive
                }
                if (dto.isPublished !== undefined) {
                    data.isPublished = dto.isPublished
                }
                if (dto.sortOrder !== undefined) {
                    data.sortOrder = dto.sortOrder
                }
                if (dto.isDefault) {
                    await tx.sdProductVariant.updateMany({
                        where: { productId, isDefault: true },
                        data: { isDefault: false },
                    })
                    data.isDefault = true
                }

                if (Object.keys(data).length > 0) {
                    await tx.sdProductVariant.update({
                        where: { id: variantId },
                        data,
                    })
                }
            },
            { timeout: 30_000 },
        )

        return this.optionVariants.getForProduct(productId)
    }

    // ──────────────────────────────────────────────────────────────────────
    //  Linkable materials (for the Product Catalog selector)
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Materials that may back a variant of the given product.
     *
     * The list is filtered with exactly the same rules the write path
     * enforces: same company, active, sellable, stocked with a SKU, and not
     * already backing another active variant. Stock is READ from Materials
     * Management — the Product Catalog never owns it.
     */
    async listLinkableMaterials(
        productId: string | null,
        companyId?: string,
        search?: string,
    ) {
        const product = productId
            ? await this.prisma.sdProduct.findUnique({
                  where: { id: productId },
                  include: {
                      materialAssignments: {
                          where: { status: 'ACTIVE' },
                          select: { companyId: true },
                          take: 1,
                      },
                      variants: { select: { companyId: true } },
                  },
              })
            : null
        if (productId && !product) {
            throw new NotFoundException('The product was not found.')
        }
        const ownerCompanyId =
            companyId?.trim() ||
            product?.materialAssignments?.[0]?.companyId ||
            product?.variants?.find((v) => v.companyId)?.companyId ||
            null

        const materials = await this.prisma.mmMaterial.findMany({
            where: {
                deletedAt: null,
                status: 'ACTIVE',
                sellable: true,
                ...(ownerCompanyId ? { companyId: ownerCompanyId } : {}),
                ...(search?.trim()
                    ? {
                          OR: [
                              {
                                  materialCode: {
                                      contains: search.trim(),
                                      mode: 'insensitive' as const,
                                  },
                              },
                              {
                                  materialName: {
                                      contains: search.trim(),
                                      mode: 'insensitive' as const,
                                  },
                              },
                              {
                                  sku: {
                                      contains: search.trim(),
                                      mode: 'insensitive' as const,
                                  },
                              },
                              {
                                  barcodes: {
                                      some: {
                                          barcodeValue: {
                                              contains: search.trim(),
                                              mode: 'insensitive' as const,
                                          },
                                      },
                                  },
                              },
                          ],
                      }
                    : {}),
            },
            select: {
                id: true,
                materialCode: true,
                materialName: true,
                sku: true,
                status: true,
                sellable: true,
                companyId: true,
                baseUomId: true,
                baseUom: { select: { code: true, name: true } },
                defaultWarehouseId: true,
                defaultWarehouse: { select: { name: true, code: true } },
                company: { select: { id: true, name: true, code: true } },
                barcodes: {
                    select: { barcodeValue: true, isPrimary: true },
                    take: 3,
                },
            },
            orderBy: { materialCode: 'asc' },
            take: 200,
        })

        // Exclude materials that already back another active variant.
        const linked = await this.prisma.sdProductVariant.findMany({
            where: { materialId: { in: materials.map((m) => m.id) } },
            select: { materialId: true, isActive: true, productId: true },
        })
        const linkedElsewhere = new Set(
            linked
                .filter((v) => v.isActive && v.productId !== productId)
                .map((v) => v.materialId),
        )
        return Promise.all(
            materials
                .filter((material) => !linkedElsewhere.has(material.id))
                .map(async (material) => {
                    // Stock is read from the MM ledger — the Product Catalog
                    // never owns or copies it.
                    const ledger = ownerCompanyId
                        ? await this.availability.getCompanyMaterialLedger(
                              material.id,
                              ownerCompanyId,
                          )
                        : { onHandQty: 0, reservedQty: 0, availableQty: 0 }
                    return {
                        id: material.id,
                        materialCode: material.materialCode,
                        materialName: material.materialName,
                        sku: material.sku,
                        barcode:
                            material.barcodes.find((b) => b.isPrimary)
                                ?.barcodeValue ??
                            material.barcodes[0]?.barcodeValue ??
                            null,
                        status: material.status,
                        sellable: material.sellable,
                        companyId: material.companyId,
                        companyName: material.company?.name ?? null,
                        uomCode: material.baseUom?.code ?? null,
                        uomName: material.baseUom?.name ?? null,
                        warehouseId: material.defaultWarehouseId,
                        warehouseName: material.defaultWarehouse?.name ?? null,
                        onHandQty: Math.max(0, Number(ledger.onHandQty ?? 0)),
                        reservedQty: Math.max(0, Number(ledger.reservedQty ?? 0)),
                        availableQty: Math.max(
                            0,
                            Number(ledger.availableQty ?? 0),
                        ),
                    }
                }),
        )
    }

    // ──────────────────────────────────────────────────────────────────────
    //  Catalog summary: variants + availability across variants
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Per-product variant count and the availability summed across the
     * product's variants.
     *
     * The Product Catalog list shows ONE parent product with "N Variants"
     * and the combined availability. Stock is read from Materials Management
     * (one ledger query for the whole page).
     */
    async catalogVariantsSummary(params: {
        divisionId?: string
        companyId?: string
    }) {
        const products = await this.prisma.sdProduct.findMany({
            where: {
                ...(params.divisionId ? { divisionId: params.divisionId } : {}),
                ...(params.companyId
                    ? {
                          variants: {
                              some: { companyId: params.companyId },
                          },
                      }
                    : {}),
            },
            select: {
                id: true,
                sku: true,
                name: true,
                productConfig: true,
                variants: {
                    where: { isActive: true },
                    select: {
                        id: true,
                        materialId: true,
                        companyId: true,
                    },
                },
            },
        })

        // Company scope for the ledger read: the first company that owns a
        // variant of each product.
        const companyByProduct = new Map<string, string>()
        for (const product of products) {
            const owner =
                product.variants.find((variant) => variant.companyId)
                    ?.companyId ?? params.companyId
            if (owner) companyByProduct.set(product.id, owner)
        }
        const companyIds = [...new Set(companyByProduct.values())]

        // One ledger read per company, for all of that company's materials.
        const totals = new Map<string, CompanyMaterialTotals>()
        for (const companyId of companyIds) {
            const companyMaterials = products
                .filter((product) => companyByProduct.get(product.id) === companyId)
                .flatMap((product) =>
                    product.variants
                        .map((variant) => variant.materialId)
                        .filter((id): id is string => !!id),
                )
            const companyTotals =
                await this.inventoryAtp.getPickableMaterialTotalsBatch(
                    companyId,
                    companyMaterials,
                )
            for (const [materialId, value] of companyTotals) {
                totals.set(materialId, value)
            }
        }

        return products.map((product) => {
            const onHand = product.variants.reduce(
                (sum, variant) =>
                    sum +
                    (variant.materialId
                        ? (totals.get(variant.materialId)?.onHandQty ?? 0)
                        : 0),
                0,
            )
            const reserved = product.variants.reduce(
                (sum, variant) =>
                    sum +
                    (variant.materialId
                        ? (totals.get(variant.materialId)?.reservedQty ?? 0)
                        : 0),
                0,
            )
            const available = product.variants.reduce(
                (sum, variant) =>
                    sum +
                    (variant.materialId
                        ? (totals.get(variant.materialId)?.availableQty ?? 0)
                        : 0),
                0,
            )
            return {
                productId: product.id,
                sku: product.sku,
                name: product.name,
                productConfig: product.productConfig,
                variantCount: product.variants.length,
                onHandQty: onHand,
                reservedQty: reserved,
                availableQty: available,
            }
        })
    }

    // ──────────────────────────────────────────────────────────────────────
    //  Helpers
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Validate that a material may back a variant:
     * exists, same company, active, sellable, has a Stock Keeping Unit.
     */
    private async assertLinkableMaterial(
        tx: Prisma.TransactionClient,
        materialId: string,
        companyId: string | null,
    ): Promise<LinkableMaterial> {
        return this.materialLink.assertLinkable(tx, materialId, companyId)
    }

    /** A material may back only one active variant. */
    private async assertMaterialNotLinked(
        tx: Prisma.TransactionClient,
        materialId: string,
        excludeVariantId: string | null,
    ) {
        return this.materialLink.assertNotLinked(
            tx,
            materialId,
            excludeVariantId ? [excludeVariantId] : [],
        )
    }

    /**
     * Normalized combination key, e.g. "color:black|size:medium". The option
     * order follows the product's option sort order.
     *
     * A product WITHOUT options has no combination to key on, so the variant
     * is keyed by the material it links — a material may back only one active
     * variant, so the key stays unique per product.
     */
    private async buildCombinationKey(
        tx: Prisma.TransactionClient,
        productId: string,
        optionValues: string[],
        materialId?: string | null,
    ) {
        const options = await tx.sdProductOption.findMany({
            where: { productId },
            orderBy: { sortOrder: 'asc' },
            include: { values: { orderBy: { sortOrder: 'asc' } } },
        })
        if (options.length === 0) {
            return materialCombinationKey(materialId)
        }

        if (optionValues.length !== options.length) {
            throw new BadRequestException(
                `Select one value for each option (${options
                    .map((o) => o.name)
                    .join(', ')}).`,
            )
        }

        const parts: string[] = []
        for (const [index, option] of options.entries()) {
            const value = (optionValues[index] ?? '').trim()
            if (!value) {
                throw new BadRequestException(
                    `Select a value for option "${option.name}".`,
                )
            }
            const known = option.values.some(
                (optionValue) =>
                    optionValue.value.toLowerCase() === value.toLowerCase(),
            )
            if (!known) {
                throw new BadRequestException(
                    `"${value}" is not an available value for option "${option.name}".`,
                )
            }
            parts.push(
                `${option.name.trim().toLowerCase()}:${value.toLowerCase()}`,
            )
        }
        return optionCombinationKey(options, optionValues)
    }

    /** Link the selected option values to the variant. */
    private async linkOptionValues(
        tx: Prisma.TransactionClient,
        productId: string,
        variantId: string,
        optionValues: string[],
    ) {
        const options = await tx.sdProductOption.findMany({
            where: { productId },
            orderBy: { sortOrder: 'asc' },
            include: { values: { orderBy: { sortOrder: 'asc' } } },
        })
        if (options.length === 0) return

        await tx.sdProductVariantOptionValue.deleteMany({
            where: { variantId },
        })

        for (const [index, option] of options.entries()) {
            const value = (optionValues[index] ?? '').trim()
            const optionValue = option.values.find(
                (candidate) =>
                    candidate.value.toLowerCase() === value.toLowerCase(),
            )
            if (!optionValue) continue
            await tx.sdProductVariantOptionValue.create({
                data: { variantId, optionValueId: optionValue.id },
            })
        }
    }

    /**
     * The variant's sellable SKU comes from the material's Stock Keeping Unit.
     * Nothing is generated for the material — the material keeps its own SKU.
     */
    private async resolveVariantSku(
        tx: Prisma.TransactionClient,
        materialSku: string | null,
        excludeVariantId?: string,
    ) {
        return this.materialLink.resolveVariantSku(
            tx,
            materialSku ?? '',
            excludeVariantId ? [excludeVariantId] : [],
        )
    }

    /** Company that owns the product's stock. */
    private async resolveCompanyId(product: {
        materialAssignments?: Array<{ companyId: string }>
        variants?: Array<{ companyId?: string | null }>
    }): Promise<string | null> {
        const assignment = product.materialAssignments?.[0]
        if (assignment) return assignment.companyId
        const variant = product.variants?.find((v) => v.companyId)
        return variant?.companyId ?? null
    }
    private nextSortOrder(variants: Array<{ sortOrder?: number | null }>) {
        return (
            Math.max(0, ...variants.map((v) => v.sortOrder ?? 0)) + 1
        )
    }

    private humanCombination(optionValues: string[]) {
        return humanCombination(optionValues)
    }

    /** Idempotency lookup: the key is stored on the variant row. */
    private async findByIdempotencyKey(
        productId: string,
        idempotencyKey: string,
    ) {
        return this.prisma.sdProductVariant.findFirst({
            where: { productId, idempotencyKey },
            select: { id: true },
        })
    }
}
