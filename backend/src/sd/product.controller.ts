import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Query,
    Req,
} from '@nestjs/common'
import { plainToInstance, type ClassConstructor } from 'class-transformer'
import { validate } from 'class-validator'
import type { FastifyRequest } from 'fastify'
import {
    CreateProductDto,
    ListProductsQueryDto,
    PRODUCT_GALLERY_MAX,
    UpdateProductDto,
} from './dto/product.dto'
import { ProductService } from './product.service'
import { CommercialAvailabilityService } from './commercial-availability.service'
import { PRODUCT_VIDEO_MAX_BYTES } from './product-image-storage'
import { RequirePermission } from '../permissions/permission.guard'

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
                if (part.fieldname === 'image' && !image)
                    image = await part.toBuffer()
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

@Controller('sd/products')
export class ProductController {
    constructor(
        private products: ProductService,
        private availabilityService: CommercialAvailabilityService,
    ) {}

    @Get()
    list(@Query() query: ListProductsQueryDto) {
        return this.products.list(query)
    }

    /** Multipart upload (field `file`); returns `{ imageUrl }` to save on the product. */
    @Post('images')
    @RequirePermission('sd.product-catalog', 'create')
    async uploadImage(@Req() req: FastifyRequest) {
        let buffer: Buffer | null = null
        for await (const part of req.parts()) {
            if (part.type === 'file' && !buffer) buffer = await part.toBuffer()
        }
        return this.products.uploadImage(buffer)
    }

    /** Multipart upload (field `file`); returns `{ videoUrl }` for `attributes.videos`. */
    @Post('videos')
    @RequirePermission('sd.product-catalog', 'create')
    async uploadVideo(@Req() req: FastifyRequest) {
        let buffer: Buffer | null = null
        for await (const part of req.parts({
            limits: { fileSize: PRODUCT_VIDEO_MAX_BYTES, files: 1 },
        })) {
            if (part.type === 'file' && !buffer) buffer = await part.toBuffer()
        }
        return this.products.uploadVideo(buffer)
    }

    @Get('suggested-sku')
    @RequirePermission('sd.product-catalog', 'read')
    suggestedSku(@Query('divisionId') divisionId: string) {
        return this.products.suggestSku(divisionId)
    }

    @Get('storefront/availability')
    storefrontAvailability(
        @Query('divisionId') divisionId: string,
        @Query('sku') sku: string,
    ) {
        return this.products.getStorefrontAvailability(
            divisionId,
            sku,
            this.availabilityService,
        )
    }

    @Get(':id/availability')
    @RequirePermission(['sd.product-catalog', 'sd.pos', 'sd.sales-orders'], 'read')
    availability(
        @Param('id') id: string,
        @Query('companyId') companyId: string,
        @Query('branchId') branchId?: string,
        @Query('divisionId') divisionId?: string,
        @Query('channel') channel?: string,
        @Query('quantity') quantity?: string,
    ) {
        return this.availabilityService.getForProduct({
            productId: id,
            companyId,
            branchId,
            divisionId,
            channel,
            quantity: quantity ? Number(quantity) : undefined,
        })
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.products.findOne(id)
    }

    @Post()
    @RequirePermission('sd.product-catalog', 'create')
    create(@Body() dto: CreateProductDto) {
        return this.products.create(dto)
    }

    /** JSON, or multipart with `data` (JSON) + optional `image` and `gallery` files. */
    @Patch(':id')
    @RequirePermission('sd.product-catalog', 'update')
    async update(@Param('id') id: string, @Req() req: FastifyRequest) {
        const { dto, image, gallery } = await readProductPayload(
            req,
            UpdateProductDto,
        )
        return this.products.update(id, dto, image, gallery)
    }

    @Delete(':id')
    @RequirePermission('sd.product-catalog', 'delete')
    remove(@Param('id') id: string) {
        return this.products.remove(id)
    }
}
