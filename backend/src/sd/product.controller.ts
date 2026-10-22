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
    UpdateProductStatusDto,
} from './dto/product.dto'
import { UpdateProductOptionsVariantsDto } from './dto/product-option-variants.dto'
import { ProductService } from './product.service'
import { ProductOptionVariantsService } from './product-option-variants.service'
import { CommercialAvailabilityService } from './commercial-availability.service'
import { ProductFamilyService } from './product-family.service'
import { ProductVariantService } from './product-variant.service'
import { CreateProductFamilyDto } from './dto/create-product-family.dto'
import {
    AddVariantDto,
    UpdateVariantDto,
} from './dto/product-variant.dto'
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
        private optionVariants: ProductOptionVariantsService,
        private productFamily: ProductFamilyService,
        private productVariant: ProductVariantService,
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

    /** Options + variants of a product (admin editor + storefront detail). */
    @Get(':id/options-variants')
    optionsVariants(@Param('id') id: string) {
        return this.optionVariants.getForProduct(id)
    }

    /** Replace the full options + variants set (variant generator output). */
    @Put(':id/options-variants')
    @RequirePermission('sd.product-catalog', 'update')
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
    @RequirePermission('sd.product-catalog', 'read')
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
    @RequirePermission('sd.product-catalog', 'read')
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
        @Query('variantId') variantId?: string,
    ) {
        return this.products.getStorefrontAvailability(
            divisionId,
            sku,
            this.availabilityService,
            variantId,
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

    /**
     * Unified product-family creation: parent product + options + variants,
     * each variant linking an EXISTING MM material — all in one atomic
     * transaction. No Material Master record is ever created here.
     */
    @Post('family')
    @RequirePermission('sd.product-catalog', 'create')
    createFamily(@Body() dto: CreateProductFamilyDto) {
        return this.productFamily.createProductFamily(dto)
    }

    /**
     * Per-product variant count and the availability summed across the
     * product's variants — the Product Catalog list shows one parent product
     * with "N Variants" and the combined availability.
     */
    @Get('variants-summary')
    @RequirePermission('sd.product-catalog', 'read')
    variantsSummary(
        @Query('divisionId') divisionId?: string,
        @Query('companyId') companyId?: string,
    ) {
        return this.productVariant.catalogVariantsSummary({
            divisionId,
            companyId,
        })
    }

    /**
     * Materials that may back a variant — same company, active, sellable,
     * stocked with a SKU and not already linked to another active variant.
     * Stock is read from Materials Management.
     *
     * `productId` is optional: the creation wizard uses it to scope the list
     * to the product being created (which has no id yet).
     */
    @Get('linkable-materials')
    @RequirePermission('sd.product-catalog', 'read')
    linkableMaterials(
        @Query('productId') productId?: string,
        @Query('companyId') companyId?: string,
        @Query('search') search?: string,
    ) {
        return this.productVariant.listLinkableMaterials(
            productId ?? null,
            companyId,
            search,
        )
    }

    /**
     * Add ONE child variant to an existing product.
     *
     * The variant links an existing Material Master item — the request never
     * carries a material payload, an opening stock or a material SKU. No
     * second parent product is created and no material is created.
     */
    @Post(':id/variants')
    @RequirePermission('sd.product-catalog', 'update')
    addVariant(
        @Param('id') id: string,
        @Body() dto: AddVariantDto,
    ) {
        return this.productVariant.addVariant(id, dto)
    }

    /**
     * Edit a child variant (option values, name, price, image, active /
     * published state, or the linked material). Relinking never creates or
     * deletes a material.
     */
    @Patch(':id/variants/:variantId')
    @RequirePermission('sd.product-catalog', 'update')
    updateVariant(
        @Param('id') id: string,
        @Param('variantId') variantId: string,
        @Body() dto: UpdateVariantDto,
    ) {
        return this.productVariant.updateVariant(id, variantId, dto)
    }

    /** Archive a variant (hide from shop, preserve history). */
    @Patch('variants/:variantId/archive')
    @RequirePermission('sd.product-catalog', 'update')
    archiveVariant(@Param('variantId') variantId: string) {
        return this.productFamily.archiveVariant(variantId)
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

    /**
     * Lifecycle transition: Deactivate (INACTIVE) / Archive (ARCHIVED) /
     * Reactivate (ACTIVE). Archived and inactive products stay in the admin
     * catalog but are hidden from storefront, POS and new-order product search.
     */
    @Patch(':id/status')
    @RequirePermission('sd.product-catalog', 'update')
    setStatus(
        @Param('id') id: string,
        @Body() dto: UpdateProductStatusDto,
    ) {
        return this.products.setStatus(id, dto.status, dto.updatedBy)
    }

    @Delete(':id')
    @RequirePermission('sd.product-catalog', 'delete')
    remove(@Param('id') id: string) {
        return this.products.remove(id)
    }
}
