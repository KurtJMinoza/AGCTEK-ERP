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
    PRODUCT_GALLERY_MAX,
    UpdateProductDto,
} from './dto/product.dto'
import { CommercialAvailabilityService } from './commercial-availability.service'
import {
    PRODUCT_IMAGE_MAX_BYTES,
    PRODUCT_VIDEO_MAX,
    PRODUCT_VIDEO_MAX_BYTES,
    deleteProductImageByUrl,
    isProductVideoUrl,
    saveProductImage,
    saveProductVideo,
} from './product-image-storage'

const DIVISION_SKU_PREFIX: Record<string, string> = {
    DIV_RETAIL: 'RET',
    DIV_LPG: 'LPG',
    DIV_APPLIANCES: 'MCO',
}

/** Category for products without an MM material (non-stock / service). */
const DEFAULT_PRODUCT_CATEGORY = 'General'

/** Active MM links, used to resolve the product category from Material Master. */
const WITH_MATERIAL_CATEGORY = {
    materialAssignments: {
        where: { status: 'ACTIVE' },
        orderBy: { effectiveFrom: 'asc' },
        select: {
            materialId: true,
            material: {
                select: { materialCategory: { select: { name: true } } },
            },
        },
    },
} satisfies Prisma.SdProductInclude

type ProductWithMaterialCategory = Prisma.SdProductGetPayload<{
    include: typeof WITH_MATERIAL_CATEGORY
}>

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

        const assignments =
            await this.prisma.sdProductMaterialAssignment.findMany({
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
            ...new Set(
                assignments.map((row) => row.materialId).filter(Boolean),
            ),
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

        if (sellableAvailable === Number.POSITIVE_INFINITY)
            sellableAvailable = 0
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

    async list(query: ListProductsQueryDto) {
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
                          {
                              category: {
                                  contains: search,
                                  mode: 'insensitive',
                              },
                          },
                      ],
                  }
                : {}),
        }
        const rows = await this.prisma.sdProduct.findMany({
            where,
            include: WITH_MATERIAL_CATEGORY,
            orderBy: [
                { divisionId: 'asc' },
                { sortOrder: 'asc' },
                { name: 'asc' },
            ],
        })
        return rows.map((row) => this.withMaterialCategory(row))
    }

    async findOne(id: string) {
        const row = await this.prisma.sdProduct.findUnique({
            where: { id },
            include: WITH_MATERIAL_CATEGORY,
        })
        if (!row) throw new NotFoundException('Product not found')
        return this.withMaterialCategory(row)
    }

    /**
     * Material Master owns the category: stock items show the primary linked
     * material's MM category; the stored column is only a fallback/search copy.
     */
    private withMaterialCategory({
        materialAssignments,
        ...product
    }: ProductWithMaterialCategory) {
        const primaryId = this.asObject(product.attributes)?.primaryMaterialId
        const primary =
            materialAssignments.find((row) => row.materialId === primaryId) ??
            materialAssignments[0]
        const category = primary?.material.materialCategory?.name
        return category ? { ...product, category } : product
    }

    private async materialCategoryName(materialId: string | undefined) {
        if (!materialId) return null
        const material = await this.prisma.mmMaterial.findUnique({
            where: { id: materialId },
            select: { materialCategory: { select: { name: true } } },
        })
        return material?.materialCategory?.name ?? null
    }

    async create(dto: CreateProductDto) {
        this.assertOriginalPrice(dto.price, dto.originalPrice)
        const productType = dto.productType ?? 'STOCK_ITEM'
        const sku =
            dto.autoGenerateSku || !dto.sku?.trim()
                ? await this.generateNextProductSku(dto.divisionId)
                : dto.sku.trim()
        const materialLinks = await this.resolveMaterialLinksForCreate(
            dto,
            productType,
        )
        const primaryMaterialId = materialLinks[0]?.materialId
        const category =
            (await this.materialCategoryName(primaryMaterialId)) ??
            (dto.category?.trim() || DEFAULT_PRODUCT_CATEGORY)
        this.assertVideos(dto.attributes)
        const attributes = this.mergeProductAttributes(
            dto.attributes,
            dto.imageGallery,
            {
                primaryMaterialId,
                materialLinkMode:
                    dto.materialLinkMode ??
                    (materialLinks.length > 1 ? 'multiple' : 'single'),
            },
        )

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
                        category,
                        imageUrl: dto.imageUrl ?? '',
                        badge: dto.badge ?? null,
                        isActive: dto.isActive ?? true,
                        sortOrder: dto.sortOrder ?? 0,
                        productType,
                        ...(materialLinks[0]?.salesUomId
                            ? {
                                  salesUom: {
                                      connect: {
                                          id: materialLinks[0].salesUomId,
                                      },
                                  },
                              }
                            : dto.salesUomId
                              ? {
                                    salesUom: {
                                        connect: { id: dto.salesUomId },
                                    },
                                }
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

    async update(
        id: string,
        dto: UpdateProductDto,
        image?: Buffer | null,
        gallery: Buffer[] = [],
    ) {
        const current = await this.findOne(id)
        const { updatedBy: _updatedBy, ...changes } = dto
        if (
            !image &&
            gallery.length === 0 &&
            Object.values(changes).every((value) => value === undefined)
        ) {
            throw new BadRequestException('No changes supplied')
        }

        const galleryChange =
            dto.galleryImages !== undefined || gallery.length > 0
        if (!galleryChange) {
            return this.withUploadedImage(image, dto, () =>
                this.applyUpdate(current, dto),
            )
        }

        const currentImages = this.galleryOf(current.attributes)
        const kept = dto.galleryImages ?? currentImages
        const unknown = kept.find((url) => !currentImages.includes(url))
        if (unknown !== undefined) {
            throw new BadRequestException(`Unknown gallery image: ${unknown}`)
        }
        if (new Set(kept).size !== kept.length) {
            throw new BadRequestException('Gallery images must not repeat')
        }
        if (kept.length + gallery.length > PRODUCT_GALLERY_MAX) {
            throw new BadRequestException(
                `A product can have at most ${PRODUCT_GALLERY_MAX} gallery photos`,
            )
        }

        const added: string[] = []
        try {
            for (const buffer of gallery) added.push(saveProductImage(buffer))
        } catch (error) {
            added.forEach(deleteProductImageByUrl)
            throw new BadRequestException(
                error instanceof Error
                    ? error.message
                    : 'Invalid gallery image',
            )
        }

        const baseAttributes =
            dto.attributes !== undefined
                ? dto.attributes
                : this.asObject(current.attributes)
        dto.attributes = {
            ...(baseAttributes ?? {}),
            images: [...kept, ...added],
        }

        let updated: Awaited<ReturnType<ProductService['applyUpdate']>>
        try {
            updated = await this.withUploadedImage(image, dto, () =>
                this.applyUpdate(current, dto),
            )
        } catch (error) {
            added.forEach(deleteProductImageByUrl)
            throw error
        }
        currentImages
            .filter((url) => !kept.includes(url) && url !== updated.imageUrl)
            .forEach(deleteProductImageByUrl)
        return updated
    }

    private asObject(
        value: Prisma.JsonValue | null,
    ): Record<string, unknown> | null {
        return value !== null &&
            typeof value === 'object' &&
            !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : null
    }

    /** Gallery photo URLs kept in `attributes.images`. */
    private galleryOf(attributes: Prisma.JsonValue | null): string[] {
        const images = this.asObject(attributes)?.images
        return Array.isArray(images)
            ? images.filter((url): url is string => typeof url === 'string')
            : []
    }

    private async applyUpdate(
        current: Awaited<ReturnType<ProductService['findOne']>>,
        dto: UpdateProductDto,
    ) {
        const { id } = current
        const { updatedBy } = dto
        this.assertOriginalPrice(
            dto.price ?? Number(current.price),
            dto.originalPrice === undefined
                ? current.originalPrice === null
                    ? null
                    : Number(current.originalPrice)
                : dto.originalPrice,
        )

        const data: Prisma.SdProductUpdateInput = { updatedBy }
        if (dto.name !== undefined) data.name = dto.name
        if (dto.description !== undefined) data.description = dto.description
        if (dto.price !== undefined) data.price = new Decimal(dto.price)
        if (dto.originalPrice !== undefined) {
            data.originalPrice =
                dto.originalPrice === null
                    ? null
                    : new Decimal(dto.originalPrice)
        }
        if ((dto.productType ?? current.productType) === 'STOCK_ITEM') {
            data.category = current.category
        } else if (dto.category !== undefined) {
            data.category = dto.category
        }
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
            this.assertVideos(dto.attributes)
            const baseAttrs =
                dto.attributes ??
                (current.attributes && typeof current.attributes === 'object'
                    ? (current.attributes as Record<string, unknown>)
                    : {})
            data.attributes = this.toJson(
                this.mergeProductAttributes(baseAttrs, dto.imageGallery),
            )
        }

        await this.prisma.sdProduct.update({ where: { id }, data })
        const updated = await this.findOne(id)
        if (updated.imageUrl !== current.imageUrl) {
            deleteProductImageByUrl(current.imageUrl)
        }
        const keptVideos = this.videosOf(updated.attributes)
        this.videosOf(current.attributes)
            .filter((url) => !keptVideos.includes(url))
            .forEach(deleteProductImageByUrl)
        return updated
    }

    private videosOf(attributes: Prisma.JsonValue | null): string[] {
        const videos = this.asObject(attributes)?.videos
        return Array.isArray(videos) ? videos.filter(isProductVideoUrl) : []
    }

    /** `attributes.videos` may only list files uploaded through `uploadVideo`. */
    private assertVideos(
        attributes: Record<string, unknown> | null | undefined,
    ) {
        const videos = attributes?.videos
        if (videos === undefined) return
        if (!Array.isArray(videos) || !videos.every(isProductVideoUrl)) {
            throw new BadRequestException(
                'attributes.videos must list uploaded product videos',
            )
        }
        if (new Set(videos).size !== videos.length) {
            throw new BadRequestException('Product videos must not repeat')
        }
        if (videos.length > PRODUCT_VIDEO_MAX) {
            throw new BadRequestException(
                `A product can have at most ${PRODUCT_VIDEO_MAX} videos`,
            )
        }
    }

    /**
     * Saves `image` (if any) to public/uploads/products, sets `dto.imageUrl` to its
     * public URL, then runs the write; the new file is removed if the write fails.
     */
    private async withUploadedImage<T>(
        image: Buffer | null | undefined,
        dto: { imageUrl?: string },
        write: () => Promise<T>,
    ): Promise<T> {
        if (!image) return write()
        let imageUrl: string
        try {
            imageUrl = saveProductImage(image)
        } catch (error) {
            throw new BadRequestException(
                error instanceof Error ? error.message : 'Invalid image',
            )
        }
        dto.imageUrl = imageUrl
        try {
            return await write()
        } catch (error) {
            deleteProductImageByUrl(imageUrl)
            throw error
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

    /** Hard delete; past orders keep their own SKU/description/price snapshot. */
    async remove(id: string) {
        const current = await this.findOne(id)
        await this.prisma.sdProduct.delete({ where: { id } })
        deleteProductImageByUrl(current.imageUrl)
        this.galleryOf(current.attributes).forEach(deleteProductImageByUrl)
        this.videosOf(current.attributes).forEach(deleteProductImageByUrl)
        return { id, deleted: true }
    }

    /** Stores an uploaded product video and returns the URL to list in `attributes.videos`. */
    uploadVideo(buffer: Buffer | null) {
        if (!buffer?.length) throw new BadRequestException('No video uploaded')
        if (buffer.length > PRODUCT_VIDEO_MAX_BYTES) {
            throw new BadRequestException('Video exceeds the 50 MB limit')
        }
        try {
            return { videoUrl: saveProductVideo(buffer) }
        } catch (error) {
            throw new BadRequestException(
                error instanceof Error ? error.message : 'Invalid video',
            )
        }
    }

    /** Stores an uploaded product photo and returns the `imageUrl` to save on the product. */
    uploadImage(buffer: Buffer | null) {
        if (!buffer?.length) throw new BadRequestException('No image uploaded')
        if (buffer.length > PRODUCT_IMAGE_MAX_BYTES) {
            throw new BadRequestException('Image exceeds the 5 MB limit')
        }
        try {
            return { imageUrl: saveProductImage(buffer) }
        } catch (error) {
            throw new BadRequestException(
                error instanceof Error ? error.message : 'Invalid image',
            )
        }
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
        const materialIds = [
            ...new Set(rawIds.map((id) => id.trim()).filter(Boolean)),
        ]

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
            throw new BadRequestException(
                'Single-material mode allows only one MM material',
            )
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
                throw new BadRequestException(
                    `MM material not found: ${materialId}`,
                )
            }
            if (material.status !== 'ACTIVE') {
                throw new BadRequestException(
                    'Only ACTIVE MM materials can be linked to SD products',
                )
            }
            const salesUomId =
                links.length === 0
                    ? (dto.salesUomId ??
                      material.salesUomId ??
                      material.baseUomId)
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
        if (imageGallery === undefined && !mmMeta)
            return attributes ?? undefined
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

    private mapUniqueViolation(
        error: unknown,
        divisionId: string,
        sku: string,
    ) {
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
