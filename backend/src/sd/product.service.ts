import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../prisma/prisma.service'
import {
    CreateProductDto,
    ListProductsQueryDto,
    UpdateProductDto,
} from './dto/product.dto'
import { CommercialAvailabilityService } from './commercial-availability.service'
import {
    PRODUCT_IMAGE_MAX_BYTES,
    PRODUCT_IMAGE_URL_PREFIX,
    deleteProductImageByUrl,
    readProductImage,
    saveProductImage,
} from './product-image-storage'

const DIVISION_SKU_PREFIX: Record<string, string> = {
    DIV_RETAIL: 'RET',
    DIV_LPG: 'LPG',
    DIV_APPLIANCES: 'MCO',
}

@Injectable()
export class ProductService {
    constructor(private prisma: PrismaService) {}

    async suggestSku(divisionId: string) {
        const sku = await this.generateNextProductSku(divisionId)
        return { divisionId, sku }
    }

    async getStorefrontAvailability(
        divisionId: string,
        sku: string,
        availability: CommercialAvailabilityService,
    ) {
        const normalized = sku.trim().toUpperCase()
        const product = await this.prisma.sdProduct.findUnique({
            where: { divisionId_sku: { divisionId, sku: normalized } },
            select: { id: true, productType: true, isActive: true },
        })
        if (!product || !product.isActive) {
            return {
                sku: normalized,
                availableQuantity: 0,
                reservedQuantity: 0,
                physicalStock: 0,
                state: 'OUT_OF_STOCK' as const,
            }
        }

        if (product.productType !== 'STOCK_ITEM') {
            return {
                sku: normalized,
                availableQuantity: 999_999,
                reservedQuantity: 0,
                physicalStock: 999_999,
                state: 'NON_INVENTORY' as const,
            }
        }

        const assignments = await this.prisma.sdProductMaterialAssignment.findMany({
            where: {
                productId: product.id,
                status: 'ACTIVE',
                OR: [{ divisionId: null }, { divisionId }],
            },
            orderBy: { effectiveFrom: 'desc' },
        })
        if (!assignments.length) {
            return {
                sku: normalized,
                availableQuantity: 0,
                reservedQuantity: 0,
                physicalStock: 0,
                ledgerAvailable: 0,
                state: 'NOT_MAPPED' as const,
            }
        }

        const companyId = assignments[0].companyId
        const materialIds = [
            ...new Set(assignments.map((row) => row.materialId).filter(Boolean)),
        ]

        let sellableAvailable = Number.POSITIVE_INFINITY
        let ledgerOnHand = 0
        let ledgerAvailable = 0
        let ledgerReserved = 0

        for (const materialId of materialIds) {
            const ledger = await availability.getCompanyMaterialLedger(
                materialId,
                companyId,
            )
            sellableAvailable = Math.min(sellableAvailable, ledger.availableQty)
            ledgerOnHand += ledger.onHandQty
            ledgerAvailable += ledger.availableQty
            ledgerReserved += ledger.reservedQty
        }

        if (sellableAvailable === Number.POSITIVE_INFINITY) sellableAvailable = 0
        /** MM Available (on hand − reserved); kits use minimum across materials. */
        const available = Math.max(0, Math.floor(sellableAvailable))
        const state =
            available <= 0
                ? ('OUT_OF_STOCK' as const)
                : available < 10
                  ? ('LOW_STOCK' as const)
                  : ('IN_STOCK' as const)

        return {
            sku: normalized,
            availableQuantity: available,
            reservedQuantity: Math.max(0, Math.floor(ledgerReserved)),
            physicalStock: Math.max(0, Math.floor(ledgerOnHand)),
            ledgerAvailable: Math.max(0, Math.floor(ledgerAvailable)),
            state,
        }
    }

    list(query: ListProductsQueryDto) {
        const search = query.search?.trim()
        const where: Prisma.SdProductWhereInput = {
            ...(query.divisionId ? { divisionId: query.divisionId } : {}),
            ...(query.activeOnly === 'true' ? { isActive: true } : {}),
            ...(query.sku ? { sku: query.sku } : {}),
            ...(search
                ? {
                      OR: [
                          { name: { contains: search, mode: 'insensitive' } },
                          { sku: { contains: search, mode: 'insensitive' } },
                          { category: { contains: search, mode: 'insensitive' } },
                      ],
                  }
                : {}),
        }
        return this.prisma.sdProduct.findMany({
            where,
            orderBy: [{ divisionId: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
        })
    }

    async findOne(id: string) {
        const row = await this.prisma.sdProduct.findUnique({ where: { id } })
        if (!row) throw new NotFoundException('Product not found')
        return row
    }

    async create(dto: CreateProductDto) {
        this.assertOriginalPrice(dto.price, dto.originalPrice)
        const productType = dto.productType ?? 'STOCK_ITEM'
        const sku =
            dto.autoGenerateSku || !dto.sku?.trim()
                ? await this.generateNextProductSku(dto.divisionId)
                : dto.sku.trim()
        const materialLinks = await this.resolveMaterialLinksForCreate(dto, productType)
        const primaryMaterialId = materialLinks[0]?.materialId
        const attributes = this.mergeProductAttributes(dto.attributes, dto.imageGallery, {
            primaryMaterialId,
            materialLinkMode:
                dto.materialLinkMode ??
                (materialLinks.length > 1 ? 'multiple' : 'single'),
        })

        try {
            return await this.prisma.$transaction(async (tx) => {
                const product = await tx.sdProduct.create({
                    data: {
                        divisionId: dto.divisionId,
                        sku,
                        name: dto.name,
                        description: dto.description ?? '',
                        price: new Decimal(dto.price),
                        originalPrice:
                            dto.originalPrice == null
                                ? null
                                : new Decimal(dto.originalPrice),
                        category: dto.category,
                        imageUrl: dto.imageUrl ?? '',
                        badge: dto.badge ?? null,
                        isActive: dto.isActive ?? true,
                        sortOrder: dto.sortOrder ?? 0,
                        productType,
                        ...(materialLinks[0]?.salesUomId
                            ? { salesUom: { connect: { id: materialLinks[0].salesUomId } } }
                            : dto.salesUomId
                              ? { salesUom: { connect: { id: dto.salesUomId } } }
                              : {}),
                        attributes: this.toJson(attributes),
                        createdBy: dto.createdBy,
                        updatedBy: dto.createdBy,
                    },
                })

                for (const link of materialLinks) {
                    await tx.sdProductMaterialAssignment.create({
                        data: {
                            productId: product.id,
                            materialId: link.materialId,
                            companyId: link.companyId,
                            divisionId: dto.divisionId,
                            salesUomId: link.salesUomId,
                            materialUomId: link.materialUomId,
                            fulfillmentType: 'WAREHOUSE',
                            inventoryRelevant: true,
                            atpRelevant: true,
                            reservationRelevant: true,
                            status: 'ACTIVE',
                        },
                    })
                }

                return product
            })
        } catch (error) {
            throw this.mapUniqueViolation(error, dto.divisionId, sku)
        }
    }

    async update(id: string, dto: UpdateProductDto) {
        const current = await this.findOne(id)
        const { updatedBy, ...changes } = dto
        if (Object.values(changes).every((value) => value === undefined)) {
            throw new BadRequestException('No changes supplied')
        }
        this.assertOriginalPrice(
            dto.price ?? Number(current.price),
            dto.originalPrice === undefined
                ? current.originalPrice === null
                    ? null
                    : Number(current.originalPrice)
                : dto.originalPrice,
        )

        const data: Prisma.SdProductUpdateInput = { updatedBy }
        if (dto.divisionId !== undefined) data.divisionId = dto.divisionId
        if (dto.sku !== undefined) data.sku = dto.sku
        if (dto.name !== undefined) data.name = dto.name
        if (dto.description !== undefined) data.description = dto.description
        if (dto.price !== undefined) data.price = new Decimal(dto.price)
        if (dto.originalPrice !== undefined) {
            data.originalPrice =
                dto.originalPrice === null ? null : new Decimal(dto.originalPrice)
        }
        if (dto.category !== undefined) data.category = dto.category
        if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl
        if (dto.badge !== undefined) data.badge = dto.badge
        if (dto.isActive !== undefined) data.isActive = dto.isActive
        if (dto.productType !== undefined) data.productType = dto.productType
        if (dto.salesUomId !== undefined) {
            data.salesUom = dto.salesUomId
                ? { connect: { id: dto.salesUomId } }
                : { disconnect: true }
        }
        if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder
        if (dto.attributes !== undefined || dto.imageGallery !== undefined) {
            const baseAttrs =
                dto.attributes ??
                (current.attributes && typeof current.attributes === 'object'
                    ? (current.attributes as Record<string, unknown>)
                    : {})
            data.attributes = this.toJson(
                this.mergeProductAttributes(baseAttrs, dto.imageGallery),
            )
        }

        try {
            const updated = await this.prisma.sdProduct.update({ where: { id }, data })
            if (updated.imageUrl !== current.imageUrl) {
                deleteProductImageByUrl(current.imageUrl)
            }
            return updated
        } catch (error) {
            throw this.mapUniqueViolation(
                error,
                dto.divisionId ?? current.divisionId,
                dto.sku ?? current.sku,
            )
        }
    }

    /** Hard delete; past orders keep their own SKU/description/price snapshot. */
    async remove(id: string) {
        const current = await this.findOne(id)
        await this.prisma.sdProduct.delete({ where: { id } })
        deleteProductImageByUrl(current.imageUrl)
        return { id, deleted: true }
    }

    /** Stores an uploaded product photo and returns the `imageUrl` to save on the product. */
    uploadImage(buffer: Buffer | null) {
        if (!buffer?.length) throw new BadRequestException('No image uploaded')
        if (buffer.length > PRODUCT_IMAGE_MAX_BYTES) {
            throw new BadRequestException('Image exceeds the 5 MB limit')
        }
        try {
            return { imageUrl: PRODUCT_IMAGE_URL_PREFIX + saveProductImage(buffer) }
        } catch (error) {
            throw new BadRequestException(
                error instanceof Error ? error.message : 'Invalid image',
            )
        }
    }

    getImage(key: string) {
        try {
            return readProductImage(key)
        } catch {
            throw new NotFoundException('Image not found')
        }
    }

    /**
     * Authoritative selling prices for a division, keyed by SKU. Only active
     * products are sellable.
     */
    async activePriceMap(divisionId: string, skus: string[]) {
        const rows = await this.prisma.sdProduct.findMany({
            where: { divisionId, isActive: true, sku: { in: skus } },
            select: { sku: true, price: true },
        })
        return new Map(rows.map((row) => [row.sku, new Decimal(row.price)]))
    }

    private async resolveMaterialLinksForCreate(
        dto: CreateProductDto,
        productType: string,
    ): Promise<
        Array<{
            materialId: string
            companyId: string
            salesUomId: string
            materialUomId: string
        }>
    > {
        const needsMaterial = productType === 'STOCK_ITEM'
        const rawIds = [
            ...(dto.materialIds ?? []),
            ...(dto.materialId?.trim() ? [dto.materialId.trim()] : []),
        ]
        const materialIds = [...new Set(rawIds.map((id) => id.trim()).filter(Boolean))]

        if (!needsMaterial) {
            if (materialIds.length || dto.companyId?.trim()) {
                throw new BadRequestException(
                    'materialId and companyId apply only to STOCK_ITEM products',
                )
            }
            return []
        }

        if (!materialIds.length || !dto.companyId?.trim()) {
            throw new BadRequestException(
                'Stock products must link at least one MM material (materialIds and companyId)',
            )
        }

        if (dto.materialLinkMode === 'single' && materialIds.length > 1) {
            throw new BadRequestException('Single-material mode allows only one MM material')
        }

        await this.prisma.company.findUniqueOrThrow({
            where: { id: dto.companyId.trim() },
        })

        const links: Array<{
            materialId: string
            companyId: string
            salesUomId: string
            materialUomId: string
        }> = []

        for (const materialId of materialIds) {
            const material = await this.prisma.mmMaterial.findUnique({
                where: { id: materialId },
                select: {
                    id: true,
                    status: true,
                    baseUomId: true,
                    salesUomId: true,
                },
            })
            if (!material) {
                throw new BadRequestException(`MM material not found: ${materialId}`)
            }
            if (material.status !== 'ACTIVE') {
                throw new BadRequestException(
                    'Only ACTIVE MM materials can be linked to SD products',
                )
            }
            const salesUomId =
                links.length === 0
                    ? (dto.salesUomId ?? material.salesUomId ?? material.baseUomId)
                    : (material.salesUomId ?? material.baseUomId)
            links.push({
                materialId: material.id,
                companyId: dto.companyId.trim(),
                salesUomId,
                materialUomId: material.baseUomId,
            })
        }

        return links
    }

    private assertOriginalPrice(price: number, originalPrice?: number | null) {
        if (originalPrice != null && originalPrice <= price) {
            throw new BadRequestException(
                'originalPrice must be higher than price (leave it empty when there is no discount)',
            )
        }
    }

    private async generateNextProductSku(divisionId: string): Promise<string> {
        const prefix = DIVISION_SKU_PREFIX[divisionId] ?? 'PRD'
        const pattern = `${prefix}-PRD-`
        const rows = await this.prisma.sdProduct.findMany({
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

    private mergeProductAttributes(
        attributes: Record<string, unknown> | null | undefined,
        imageGallery?: string[],
        mmMeta?: {
            primaryMaterialId?: string
            materialLinkMode?: 'single' | 'multiple'
        },
    ): Record<string, unknown> | null | undefined {
        if (imageGallery === undefined && !mmMeta) return attributes ?? undefined
        const next = { ...(attributes ?? {}) }
        if (imageGallery !== undefined) {
            const cleaned = imageGallery
                .map((url) => url.trim())
                .filter((url) => url.length > 0)
            if (cleaned.length) next.gallery = cleaned
            else delete next.gallery
        }
        if (mmMeta?.primaryMaterialId) {
            next.primaryMaterialId = mmMeta.primaryMaterialId
        }
        if (mmMeta?.materialLinkMode) {
            next.materialLinkMode = mmMeta.materialLinkMode
        }
        return next
    }

    private toJson(value: Record<string, unknown> | null | undefined) {
        if (value === undefined) return undefined
        return value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue)
    }

    private mapUniqueViolation(error: unknown, divisionId: string, sku: string) {
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
        ) {
            return new ConflictException(
                `SKU ${sku} already exists in ${divisionId}`,
            )
        }
        return error
    }
}
