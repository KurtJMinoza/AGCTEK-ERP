import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Put,
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
import { UpdateProductOptionsVariantsDto } from './dto/product-option-variants.dto'
import { ProductService } from './product.service'
import { ProductOptionVariantsService } from './product-option-variants.service'
import { CommercialAvailabilityService } from './commercial-availability.service'
import { PRODUCT_VIDEO_MAX_BYTES } from './product-image-storage'

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
        private optionVariants: ProductOptionVariantsService,
    ) {}

    @Get()
    list(@Query() query: ListProductsQueryDto) {
        return this.products.list(query)
    }

    /** Multipart upload (field `file`); returns `{ imageUrl }` to save on the product. */
    @Post('images')
    async uploadImage(@Req() req: FastifyRequest) {
        let buffer: Buffer | null = null
        for await (const part of req.parts()) {
            if (part.type === 'file' && !buffer) buffer = await part.toBuffer()
        }
        return this.products.uploadImage(buffer)
    }

    /** Multipart upload (field `file`); returns `{ videoUrl }` for `attributes.videos`. */
    @Post('videos')
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
    suggestedSku(@Query('divisionId') divisionId: string) {
        return this.products.suggestSku(divisionId)
    }

    /** Options + variants of a product (admin editor + storefront detail). */
    @Get(':id/options-variants')
    optionsVariants(@Param('id') id: string) {
        return this.optionVariants.getForProduct(id)
    }

    /** Replace the full options + variants set (variant generator output). */
    @Put(':id/options-variants')
    updateOptionsVariants(
        @Param('id') id: string,
        @Body() dto: UpdateProductOptionsVariantsDto,
    ) {
        return this.optionVariants.updateOptionsAndVariants(id, dto)
    }

    /** POS / scanner: barcode → the exact variant (plus parent product). */
    @Get('variants/barcode/:barcode')
    variantByBarcode(@Param('barcode') barcode: string) {
        return this.optionVariants.findVariantByBarcode(barcode)
    }

    /** Per-variant MM availability (selected variant is the stock item). */
    @Get('variants/:variantId/availability')
    variantAvailability(
        @Param('variantId') variantId: string,
        @Query('companyId') companyId?: string,
        @Query('branchId') branchId?: string,
    ) {
        return this.optionVariants.variantAvailability(
            variantId,
            companyId,
            branchId,
        )
    }

    /** Batch per-variant availability for a product page. */
    @Get(':id/variants/availability')
    productVariantsAvailability(
        @Param('id') id: string,
        @Query('companyId') companyId?: string,
        @Query('branchId') branchId?: string,
    ) {
        return this.optionVariants.listAvailabilityForProduct(
            id,
            companyId,
            branchId,
        )
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
    create(@Body() dto: CreateProductDto) {
        return this.products.create(dto)
    }

    /** JSON, or multipart with `data` (JSON) + optional `image` and `gallery` files. */
    @Patch(':id')
    async update(@Param('id') id: string, @Req() req: FastifyRequest) {
        const { dto, image, gallery } = await readProductPayload(
            req,
            UpdateProductDto,
        )
        return this.products.update(id, dto, image, gallery)
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.products.remove(id)
    }
}
