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
import {
    PRODUCT_IMAGE_MAX_BYTES,
    PRODUCT_IMAGE_URL_PREFIX,
    deleteProductImageByUrl,
    readProductImage,
    saveProductImage,
} from './product-image-storage'

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

    async create(dto: CreateProductDto) {
        this.assertOriginalPrice(dto.price, dto.originalPrice)
        try {
            return await this.prisma.sdProduct.create({
                data: {
                    divisionId: dto.divisionId,
                    sku: dto.sku,
                    name: dto.name,
                    description: dto.description ?? '',
                    price: new Decimal(dto.price),
                    originalPrice:
                        dto.originalPrice == null ? null : new Decimal(dto.originalPrice),
                    category: dto.category,
                    imageUrl: dto.imageUrl ?? '',
                    badge: dto.badge ?? null,
                    isActive: dto.isActive ?? true,
                    sortOrder: dto.sortOrder ?? 0,
                    attributes: this.toJson(dto.attributes),
                    createdBy: dto.createdBy,
                    updatedBy: dto.createdBy,
                },
            })
        } catch (error) {
            throw this.mapUniqueViolation(error, dto.divisionId, dto.sku)
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
        if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder
        if (dto.attributes !== undefined) data.attributes = this.toJson(dto.attributes)

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
