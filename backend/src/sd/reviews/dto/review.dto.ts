import {
    ArrayMaxSize,
    IsArray,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
} from 'class-validator'
import { Type } from 'class-transformer'

export const SHOPPER_REVIEW_MAX_PHOTOS = 5

/** Review from a signed-in storefront shopper for one line of a delivered order. */
export class CreateShopperReviewDto {
    @IsString()
    @IsNotEmpty()
    salesOrderId!: string

    @IsString()
    @IsNotEmpty()
    salesOrderLineId!: string

    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(5)
    rating!: number

    @IsString()
    @IsNotEmpty()
    @MaxLength(2000)
    comment!: string

    /** Only photos uploaded through `POST /reviews/retail/photos`. */
    @IsArray()
    @ArrayMaxSize(SHOPPER_REVIEW_MAX_PHOTOS)
    @Matches(/^\/uploads\/products\/[0-9a-f-]{36}\.(png|jpg|webp|gif)$/, {
        each: true,
        message: 'Review photos must be uploaded through the review photo upload',
    })
    @IsOptional()
    imageUrls?: string[]
}

export class CreateProductReviewDto {
    @IsString()
    @IsNotEmpty()
    productId!: string

    @IsString()
    @IsOptional()
    userId?: string

    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(5)
    rating!: number

    @IsString()
    @IsNotEmpty()
    comment!: string

    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    imageUrls?: string[]
}

export class ListReviewsQueryDto {
    @IsString()
    @IsOptional()
    productId?: string

    @Type(() => Number)
    @IsInt()
    @IsOptional()
    limit?: number
}
