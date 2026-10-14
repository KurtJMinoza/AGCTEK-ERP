import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Headers,
    Param,
    Post,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { ReviewService } from './review.service'
import {
    CreateProductReviewDto,
    CreateShopperReviewDto,
    ListReviewsQueryDto,
} from './dto/review.dto'
import {
    CurrentRetailClientId,
    RetailClientAuthGuard,
} from '../../retail/retail-client.guard'
import {
    PRODUCT_IMAGE_MAX_BYTES,
    saveProductImage,
} from '../product-image-storage'

@Controller('reviews')
export class ReviewController {
    constructor(private readonly reviewService: ReviewService) {}

    @Get('eligibility')
    async checkEligibility(
        @Query('productId') productId: string,
        @Headers('x-user-id') headerUserId?: string,
        @Query('userId') queryUserId?: string,
    ) {
        const userId = headerUserId || queryUserId
        if (!userId || !productId) {
            return { eligible: false }
        }
        const eligible = await this.reviewService.checkEligibility(productId, userId)
        return { eligible }
    }

    @Post()
    async create(
        @Body() dto: CreateProductReviewDto,
        @Headers('x-user-id') headerUserId?: string,
    ) {
        return this.reviewService.create(dto, headerUserId)
    }

    @Get()
    async findAll(@Query() query: ListReviewsQueryDto) {
        return this.reviewService.findAll(query)
    }

    @Get('stats/:productId')
    async getStats(@Param('productId') productId: string) {
        return this.reviewService.getStats(productId)
    }

    /** The signed-in shopper's own reviews (My Orders "Reviewed" state). */
    @Get('retail/mine')
    @UseGuards(RetailClientAuthGuard)
    listMine(@CurrentRetailClientId() clientId: string) {
        return this.reviewService.listForShopper(clientId)
    }

    /** Shopper reviews one line of their own delivered order. */
    @Post('retail')
    @UseGuards(RetailClientAuthGuard)
    createForShopper(
        @CurrentRetailClientId() clientId: string,
        @Body() dto: CreateShopperReviewDto,
    ) {
        return this.reviewService.createForShopper(clientId, dto)
    }

    /** Multipart photo upload (field `file`) for a shopper review; returns `{ imageUrl }`. */
    @Post('retail/photos')
    @UseGuards(RetailClientAuthGuard)
    async uploadShopperPhoto(@Req() req: FastifyRequest) {
        let buffer: Buffer | null = null
        for await (const part of req.parts({
            limits: { fileSize: PRODUCT_IMAGE_MAX_BYTES, files: 1 },
        })) {
            if (part.type === 'file' && !buffer) buffer = await part.toBuffer()
        }
        if (!buffer) throw new BadRequestException('No image file provided')
        try {
            return { imageUrl: saveProductImage(buffer) }
        } catch (error) {
            throw new BadRequestException(
                error instanceof Error ? error.message : 'Invalid image',
            )
        }
    }
}
