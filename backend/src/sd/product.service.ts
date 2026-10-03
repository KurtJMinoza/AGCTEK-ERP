import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../prisma/prisma.service'
import {
    ListProductsQueryDto,
    PRODUCT_GALLERY_MAX,
    UpdateProductDto,
} from './dto/product.dto'
import { deleteProductImageByUrl, saveProductImage } from './product-image-storage'

@Injectable()
export class ProductService {
    constructor(private prisma: PrismaService) {}

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

        const galleryChange = dto.galleryImages !== undefined || gallery.length > 0
        if (!galleryChange) {
            return this.withUploadedImage(image, dto, () => this.applyUpdate(current, dto))
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
                error instanceof Error ? error.message : 'Invalid gallery image',
            )
        }

        const baseAttributes =
            dto.attributes !== undefined ? dto.attributes : this.asObject(current.attributes)
        dto.attributes = { ...(baseAttributes ?? {}), images: [...kept, ...added] }

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

    private asObject(value: Prisma.JsonValue | null): Record<string, unknown> | null {
        return value !== null && typeof value === 'object' && !Array.isArray(value)
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
                dto.originalPrice === null ? null : new Decimal(dto.originalPrice)
        }
        if (dto.category !== undefined) data.category = dto.category
        if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl
        if (dto.badge !== undefined) data.badge = dto.badge
        if (dto.isActive !== undefined) data.isActive = dto.isActive
        if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder
        if (dto.attributes !== undefined) data.attributes = this.toJson(dto.attributes)

        const updated = await this.prisma.sdProduct.update({ where: { id }, data })
        if (updated.imageUrl !== current.imageUrl) {
            deleteProductImageByUrl(current.imageUrl)
        }
        return updated
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

    private assertOriginalPrice(price: number, originalPrice?: number | null) {
        if (originalPrice != null && originalPrice <= price) {
            throw new BadRequestException(
                'originalPrice must be higher than price (leave it empty when there is no discount)',
            )
        }
    }

    private toJson(value: Record<string, unknown> | null | undefined) {
        if (value === undefined) return undefined
        return value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue)
    }
}
