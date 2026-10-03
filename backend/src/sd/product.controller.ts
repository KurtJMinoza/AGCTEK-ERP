import { BadRequestException, Controller, Get, Param, Patch, Query, Req } from '@nestjs/common'
import { plainToInstance, type ClassConstructor } from 'class-transformer'
import { validate } from 'class-validator'
import type { FastifyRequest } from 'fastify'
import {
    ListProductsQueryDto,
    PRODUCT_GALLERY_MAX,
    UpdateProductDto,
} from './dto/product.dto'
import { ProductService } from './product.service'

/**
 * Reads a product payload sent either as JSON or as multipart/form-data with a
 * `data` field (JSON of the text fields), an optional `image` file and optional
 * `gallery` files. Validated here because the global ValidationPipe does not see
 * multipart bodies.
 */
async function readProductPayload<T extends object>(
    req: FastifyRequest,
    dtoClass: ClassConstructor<T>,
): Promise<{ dto: T; image: Buffer | null; gallery: Buffer[] }> {
    let raw: unknown = req.body ?? {}
    let image: Buffer | null = null
    const gallery: Buffer[] = []

    if (req.isMultipart()) {
        raw = {}
        for await (const part of req.parts()) {
            if (part.type === 'file') {
                if (part.fieldname === 'image' && !image) image = await part.toBuffer()
                else if (part.fieldname === 'gallery') {
                    if (gallery.length >= PRODUCT_GALLERY_MAX) {
                        throw new BadRequestException(
                            `A product can have at most ${PRODUCT_GALLERY_MAX} gallery photos`,
                        )
                    }
                    gallery.push(await part.toBuffer())
                } else await part.toBuffer()
            } else if (part.fieldname === 'data') {
                try {
                    raw = JSON.parse(String(part.value))
                } catch {
                    throw new BadRequestException('data must be valid JSON')
                }
            }
        }
    }

    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new BadRequestException('Product payload must be an object')
    }
    const dto = plainToInstance(dtoClass, raw)
    const errors = await validate(dto, { whitelist: true })
    if (errors.length > 0) {
        throw new BadRequestException(
            errors.flatMap((error) => Object.values(error.constraints ?? {})),
        )
    }
    return { dto, image, gallery }
}

/**
 * SD maintains sales data (price, badge, photo, visibility, …) on existing
 * products only; there are deliberately no create or delete endpoints.
 */
@Controller('sd/products')
export class ProductController {
    constructor(private products: ProductService) {}

    @Get()
    list(@Query() query: ListProductsQueryDto) {
        return this.products.list(query)
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.products.findOne(id)
    }

    /** JSON, or multipart with `data` (JSON) + optional `image` and `gallery` files. */
    @Patch(':id')
    async update(@Param('id') id: string, @Req() req: FastifyRequest) {
        const { dto, image, gallery } = await readProductPayload(req, UpdateProductDto)
        return this.products.update(id, dto, image, gallery)
    }
}
