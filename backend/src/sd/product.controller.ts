import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Query,
    Req,
    Res,
} from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import {
    CreateProductDto,
    ListProductsQueryDto,
    UpdateProductDto,
} from './dto/product.dto'
import { ProductService } from './product.service'
import { CommercialAvailabilityService } from './commercial-availability.service'

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
    async uploadImage(@Req() req: FastifyRequest) {
        let buffer: Buffer | null = null
        for await (const part of req.parts()) {
            if (part.type === 'file' && !buffer) buffer = await part.toBuffer()
        }
        return this.products.uploadImage(buffer)
    }

    @Get('suggested-sku')
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

    @Get('images/:key')
    getImage(@Param('key') key: string, @Res() res: FastifyReply) {
        const { stream, mimeType } = this.products.getImage(key)
        res.header('Content-Type', mimeType)
        res.header('Cache-Control', 'public, max-age=31536000, immutable')
        res.header('X-Content-Type-Options', 'nosniff')
        return res.send(stream)
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

    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
        return this.products.update(id, dto)
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.products.remove(id)
    }
}
