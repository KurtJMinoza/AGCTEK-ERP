import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../prisma/prisma.service'
import { CommercialAvailabilityService } from './commercial-availability.service'
import { MaterialResolutionService } from './material-resolution.service'
import {
    UpdateProductOptionsVariantsDto,
    VariantInputDto,
    VariantImageMode,
    ProductOptionInputDto,
} from './dto/product-option-variants.dto'

const MAX_OPTIONS = 10
const MAX_VARIANTS = 500

/** Storefront image mode from product attributes (defaults to replace). */
const variantImageModeOf = (attributes: unknown): VariantImageMode => {
    if (
        attributes &&
        typeof attributes === 'object' &&
        !Array.isArray(attributes)
    ) {
        const mode = (attributes as Record<string, unknown>).variantImageMode
        if (mode === 'keep') return 'keep'
    }
    return 'replace'
}

/** JSON-friendly shape of one option group with its values. */
export type ProductOptionsPayload = {
    id: string
    name: string
    sortOrder: number
    isRequired: boolean
    displayStyle: string
    values: Array<{
        id: string
        value: string
        sortOrder: number
        swatchColor: string | null
        imageUrl: string
    }>
}

/** JSON-friendly shape of one variant with its option assignments. */
export type ProductVariantPayload = {
    id: string
    productId: string
    variantName: string
    sku: string
    barcode: string | null
    price: number | null
    compareAtPrice: number | null
    cost: number | null
    imageUrl: string
    weight: number | null
    isActive: boolean
    isDefault: boolean
    sortOrder: number
    materialId: string | null
    companyId: string | null
    salesUomId: string | null
    materialUomId: string | null
    optionValues: Array<{
        optionId: string
        optionValueId: string
        value: string
    }>
    createdAt: Date
    updatedAt: Date
}

export type OptionsVariantsPayload = {
    hasVariants: boolean
    /** Storefront: variant image replaces the main product photo. */
    variantImageMode: VariantImageMode
    options: ProductOptionsPayload[]
    variants: ProductVariantPayload[]
}

/**
 * Product options & variants (generic: Size, Color, Bottle Size, Flavor, Pack…).
 * A product may have zero variants (simple product) or many. The variant is the
 * sellable stock item; the parent product is display / grouping only.
 */
@Injectable()
export class ProductOptionVariantsService {
    constructor(
        private prisma: PrismaService,
        private availability: CommercialAvailabilityService,
        private materialResolution: MaterialResolutionService,
    ) {}

    /** The product must exist (404 otherwise). */
    private async requireProduct(productId: string) {
        const product = await this.prisma.sdProduct.findUnique({
            where: { id: productId },
            select: { id: true, attributes: true },
        })
        if (!product) {
            throw new NotFoundException('Product not found')
        }
        return product
    }

    async getForProduct(productId: string): Promise<OptionsVariantsPayload> {
        const product = await this.requireProduct(productId)
        const [options, variants] = await Promise.all([
            this.prisma.sdProductOption.findMany({
                where: { productId },
                orderBy: { sortOrder: 'asc' },
                include: {
                    values: { orderBy: { sortOrder: 'asc' } },
                },
            }),
            this.prisma.sdProductVariant.findMany({
                where: { productId },
                orderBy: [
                    { sortOrder: 'asc' },
                    { variantName: 'asc' },
                    { createdAt: 'asc' },
                ],
                include: {
                    optionValues: {
                        include: {
                            optionValue: { include: { option: true } },
                        },
                    },
                },
            }),
        ])

        return {
            hasVariants: variants.length > 0,
            variantImageMode: variantImageModeOf(product.attributes),
            options: options.map((option) => ({
                id: option.id,
                name: option.name,
                sortOrder: option.sortOrder,
                isRequired: option.isRequired,
                displayStyle: option.displayStyle,
                values: option.values.map((value) => ({
                    id: value.id,
                    value: value.value,
                    sortOrder: value.sortOrder,
                    swatchColor: value.swatchColor,
                    imageUrl: value.imageUrl,
                })),
            })),
            variants: variants.map((variant) => ({
                ...variant,
                price:
                    variant.price === null ? null : Number(variant.price),
                compareAtPrice:
                    variant.compareAtPrice === null
                        ? null
                        : Number(variant.compareAtPrice),
                cost: variant.cost === null ? null : Number(variant.cost),
                weight:
                    variant.weight === null ? null : Number(variant.weight),
                optionValues: variant.optionValues.map((link) => ({
                    optionId: link.optionValue.option.id,
                    optionValueId: link.optionValueId,
                    value: link.optionValue.value,
                })),
            })),
        }
    }

    async hasVariants(productId: string): Promise<boolean> {
        const count = await this.prisma.sdProductVariant.count({
            where: { productId },
        })
        return count > 0
    }

    /**
     * Replace the full options + variants set of a product in one transaction.
     * Validation: option names unique, values unique per option, variant
     * combinations unique, SKU globally unique, barcode unique when present,
     * referenced MM materials / companies exist.
     */
    async updateOptionsAndVariants(
        productId: string,
        dto: UpdateProductOptionsVariantsDto,
    ): Promise<OptionsVariantsPayload> {
        const product = await this.requireProduct(productId)

        this.validateStructure(dto)

        // One default per product: the first variant becomes the default
        // when none is explicitly marked.
        const explicitDefaultIndex = dto.variants.findIndex(
            (variant) => variant.isDefault,
        )
        const defaultIndex =
            explicitDefaultIndex >= 0 ? explicitDefaultIndex : 0

        await this.assertUniqueness(dto, productId)
        await this.assertReferences(dto)

        await this.prisma.$transaction(async (tx) => {
            const existing = await tx.sdProductVariant.findMany({
                where: { productId },
                select: { id: true },
            })
            if (existing.length > 0) {
                await tx.sdProductVariantOptionValue.deleteMany({
                    where: { variantId: { in: existing.map((v) => v.id) } },
                })
                await tx.sdProductVariant.deleteMany({ where: { productId } })
            }
            await tx.sdProductOptionValue.deleteMany({
                where: { option: { productId } },
            })
            await tx.sdProductOption.deleteMany({ where: { productId } })

            if (dto.variantImageMode) {
                const attributes =
                    product.attributes &&
                    typeof product.attributes === 'object' &&
                    !Array.isArray(product.attributes)
                        ? (product.attributes as Record<string, unknown>)
                        : {}
                await tx.sdProduct.update({
                    where: { id: productId },
                    data: {
                        attributes: {
                            ...attributes,
                            variantImageMode: dto.variantImageMode,
                        },
                    },
                })
            }

            if (dto.options.length === 0) return

            const valueIdByKey = new Map<string, string>()
            for (const [oi, option] of dto.options.entries()) {
                const optionRow = await tx.sdProductOption.create({
                    data: {
                        productId,
                        name: option.name.trim(),
                        sortOrder: option.sortOrder ?? oi,
                        isRequired: option.isRequired ?? true,
                        displayStyle: option.displayStyle ?? 'BUTTON',
                    },
                })
                for (const [vi, value] of option.values.entries()) {
                    const valueRow = await tx.sdProductOptionValue.create({
                        data: {
                            optionId: optionRow.id,
                            value: value.value.trim(),
                            sortOrder: value.sortOrder ?? vi,
                            swatchColor: value.swatchColor?.trim() || null,
                            imageUrl: value.imageUrl?.trim() ?? '',
                        },
                    })
                    valueIdByKey.set(
                        `${optionRow.name}::${valueRow.value}`,
                        valueRow.id,
                    )
                }
            }

            for (const [variantIndex, variant] of dto.variants.entries()) {
                const variantRow = await tx.sdProductVariant.create({
                    data: {
                        productId,
                        variantName: variant.variantName.trim(),
                        sku: variant.sku.trim(),
                        barcode: variant.barcode?.trim() || null,
                        price:
                            variant.price === null ||
                            variant.price === undefined
                                ? null
                                : new Decimal(variant.price),
                        compareAtPrice:
                            variant.compareAtPrice === null ||
                            variant.compareAtPrice === undefined
                                ? null
                                : new Decimal(variant.compareAtPrice),
                        cost:
                            variant.cost === null ||
                            variant.cost === undefined
                                ? null
                                : new Decimal(variant.cost),
                        imageUrl: variant.imageUrl?.trim() ?? '',
                        weight:
                            variant.weight === null ||
                            variant.weight === undefined
                                ? null
                                : new Decimal(variant.weight),
                        isActive: variant.isActive ?? true,
                        isDefault: variantIndex === defaultIndex,
                        sortOrder: variant.sortOrder ?? variantIndex,
                        materialId: variant.materialId?.trim() || null,
                        companyId: variant.companyId?.trim() || null,
                        salesUomId: variant.salesUomId?.trim() || null,
                        materialUomId: variant.materialUomId?.trim() || null,
                    },
                })
                for (const [oi, option] of dto.options.entries()) {
                    const valueStr = variant.optionValues[oi]?.trim()
                    if (!valueStr) {
                        throw new BadRequestException(
                            `Variant ${variant.sku} is missing a value for option "${option.name}"`,
                        )
                    }
                    const optionValueId = valueIdByKey.get(
                        `${option.name.trim()}::${valueStr}`,
                    )
                    if (!optionValueId) {
                        throw new BadRequestException(
                            `Variant ${variant.sku} references unknown value "${valueStr}" for option "${option.name}"`,
                        )
                    }
                    await tx.sdProductVariantOptionValue.create({
                        data: {
                            variantId: variantRow.id,
                            optionValueId,
                        },
                    })
                }
            }
        })

        return this.getForProduct(productId)
    }

    private validateStructure(dto: UpdateProductOptionsVariantsDto) {
        if (dto.variants.filter((variant) => variant.isDefault).length > 1) {
            throw new BadRequestException('Only one variant can be the default')
        }
        if (dto.options.length > MAX_OPTIONS) {
            throw new BadRequestException(
                `A product can have at most ${MAX_OPTIONS} option groups`,
            )
        }
        if (dto.variants.length > MAX_VARIANTS) {
            throw new BadRequestException(
                `A product can have at most ${MAX_VARIANTS} variants`,
            )
        }
        const optionNames = new Set<string>()
        for (const option of dto.options) {
            const name = option.name.trim()
            if (!name) {
                throw new BadRequestException('Option name is required')
            }
            if (optionNames.has(name)) {
                throw new BadRequestException(
                    `Duplicate option group "${name}"`,
                )
            }
            optionNames.add(name)
            const values = new Set<string>()
            for (const value of option.values) {
                const trimmed = value.value.trim()
                if (!trimmed) {
                    throw new BadRequestException(
                        `Option "${name}" has an empty value`,
                    )
                }
                if (values.has(trimmed)) {
                    throw new BadRequestException(
                        `Option "${name}" has duplicate value "${trimmed}"`,
                    )
                }
                values.add(trimmed)
            }
        }

        const combos = new Set<string>()
        for (const variant of dto.variants) {
            if (variant.optionValues.length !== dto.options.length) {
                throw new BadRequestException(
                    `Variant ${variant.sku} must pick one value per option`,
                )
            }
            const comboKey = dto.options
                .map((option, i) => `${option.name.trim()}::${variant.optionValues[i]?.trim()}`)
                .join('|')
            if (combos.has(comboKey)) {
                throw new ConflictException(
                    `Duplicate variant combination: ${variant.optionValues.join(' / ')}`,
                )
            }
            combos.add(comboKey)
        }
    }

    private async assertUniqueness(
        dto: UpdateProductOptionsVariantsDto,
        productId: string,
    ) {
        const skus = new Set<string>()
        const barcodes = new Set<string>()

        for (const variant of dto.variants) {
            const sku = variant.sku.trim()
            const barcode = variant.barcode?.trim() || null

            if (skus.has(sku)) {
                throw new ConflictException(`Duplicate variant SKU "${sku}"`)
            }
            skus.add(sku)

            const existingSku = await this.prisma.sdProductVariant.findFirst({
                where: { sku, productId: { not: productId } },
                select: { id: true },
            })
            if (existingSku) {
                throw new ConflictException(`Variant SKU "${sku}" is already used`)
            }

            if (barcode) {
                if (barcodes.has(barcode)) {
                    throw new ConflictException(
                        `Duplicate variant barcode "${barcode}"`,
                    )
                }
                barcodes.add(barcode)
                const existingBarcode =
                    await this.prisma.sdProductVariant.findUnique({
                        where: { barcode },
                        select: { id: true },
                    })
                if (existingBarcode) {
                    throw new ConflictException(
                        `Variant barcode "${barcode}" is already used`,
                    )
                }
            }
        }
    }

    private async assertReferences(dto: UpdateProductOptionsVariantsDto) {
        for (const variant of dto.variants) {
            if (variant.materialId) {
                const material = await this.prisma.mmMaterial.findUnique({
                    where: { id: variant.materialId },
                    select: { id: true },
                })
                if (!material) {
                    throw new BadRequestException(
                        `Variant ${variant.sku}: unknown MM material`,
                    )
                }
            }
            if (variant.companyId) {
                const company = await this.prisma.company.findUnique({
                    where: { id: variant.companyId },
                    select: { id: true },
                })
                if (!company) {
                    throw new BadRequestException(
                        `Variant ${variant.sku}: unknown company`,
                    )
                }
            }
        }
    }

    /** Exact variant for a set of option value ids (all required options selected). */
    async resolveVariantByOptionValueIds(
        productId: string,
        optionValueIds: string[],
    ) {
        if (!optionValueIds.length) return null
        const variants = await this.prisma.sdProductVariant.findMany({
            where: { productId },
            include: {
                optionValues: {
                    include: { optionValue: { include: { option: true } } },
                },
                material: { select: { id: true, materialCode: true, materialName: true } },
                company: { select: { id: true, code: true, name: true } },
            },
        })
        return (
            variants.find(
                (variant) =>
                    variant.optionValues.length === optionValueIds.length &&
                    optionValueIds.every((id) =>
                        variant.optionValues.some(
                            (link) => link.optionValueId === id,
                        ),
                    ),
            ) ?? null
        )
    }

    findVariantById(id: string) {
        return this.prisma.sdProductVariant.findUnique({
            where: { id },
            include: {
                product: { select: { id: true, divisionId: true, sku: true, name: true } },
                material: { select: { id: true, materialCode: true, materialName: true, baseUomId: true } },
                company: { select: { id: true, code: true, name: true } },
                optionValues: {
                    include: { optionValue: { include: { option: true } } },
                },
            },
        })
    }

    /** POS / scanner lookup — barcode identifies the exact variant. */
    async findVariantByBarcode(barcode: string) {
        const value = barcode.trim()
        if (!value) {
            throw new BadRequestException('Barcode is required')
        }
        const variant = await this.prisma.sdProductVariant.findUnique({
            where: { barcode: value },
            include: {
                product: { select: { id: true, divisionId: true, sku: true, name: true } },
                material: { select: { id: true, materialCode: true, materialName: true, baseUomId: true } },
                optionValues: {
                    include: { optionValue: { include: { option: true } } },
                },
            },
        })
        if (!variant) {
            throw new NotFoundException(
                `No variant matches barcode "${value}"`,
            )
        }
        return variant
    }

    /**
     * Per-variant stock from MM (the variant's linked material is the stock
     * authority; the parent product never decreases if variants exist).
     */
    async variantAvailability(
        variantId: string,
        companyId?: string,
        branchId?: string,
    ) {
        const variant = await this.findVariantById(variantId)
        if (!variant) {
            throw new NotFoundException('Variant not found')
        }
        const company = companyId?.trim() || variant.companyId || null
        // Unlinked variants inherit the parent product's MM assignment.
        let materialId = variant.materialId ?? null
        if (!materialId && company) {
            try {
                const resolved =
                    await this.materialResolution.resolveMaterialForProduct({
                        productId: variant.productId,
                        companyId: company,
                        divisionId: variant.product?.divisionId ?? null,
                        channel: 'ECOMMERCE',
                    })
                materialId = resolved.materialId
            } catch {
                materialId = null
            }
        }
        if (!company || !materialId) {
            return {
                variantId,
                materialId,
                companyId: company,
                availableQuantity: 0,
                reservedQuantity: 0,
                physicalStock: 0,
                state: variant.isActive ? 'NOT_MAPPED' : 'INACTIVE',
            }
        }
        const availability = await this.availability.getForLinkedMaterial({
            materialId,
            companyId: company,
            divisionId: variant.product?.divisionId ?? null,
            branchId: branchId ?? null,
            channel: 'ECOMMERCE',
        })
        return {
            variantId,
            materialId,
            companyId: company,
            availableQuantity: availability.availableBaseQty,
            reservedQuantity: 0,
            physicalStock: availability.availableBaseQty,
            state: availability.state as
                | 'IN_STOCK'
                | 'LOW_STOCK'
                | 'OUT_OF_STOCK'
                | 'NOT_MAPPED'
                | 'INACTIVE',
        }
    }

    async listAvailabilityForProduct(
        productId: string,
        companyId?: string,
        branchId?: string,
    ) {
        await this.requireProduct(productId)
        const variants = await this.prisma.sdProductVariant.findMany({
            where: { productId },
            select: { id: true },
        })
        return Promise.all(
            variants.map((variant) =>
                this.variantAvailability(variant.id, companyId, branchId),
            ),
        )
    }

    /** Kind marker used by callers that need the variant's type family. */
    static variantOptionValueCount(
        variant: { optionValues: unknown[] } | null,
    ) {
        return variant?.optionValues?.length ?? 0
    }
}

export type { VariantInputDto, ProductOptionInputDto }