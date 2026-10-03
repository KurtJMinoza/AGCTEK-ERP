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

@Controller('sd/products')
export class ProductController {
    constructor(private products: ProductService) {}

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

    @Get('images/:key')
    getImage(@Param('key') key: string, @Res() res: FastifyReply) {
        const { stream, mimeType } = this.products.getImage(key)
        res.header('Content-Type', mimeType)
        res.header('Cache-Control', 'public, max-age=31536000, immutable')
        res.header('X-Content-Type-Options', 'nosniff')
        return res.send(stream)
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
