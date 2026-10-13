import {
    Body,
    Controller,
    Get,
    Headers,
    Param,
    Post,
    Query,
} from '@nestjs/common'
import { ReviewService } from './review.service'
import { CreateProductReviewDto, ListReviewsQueryDto } from './dto/review.dto'

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
}
