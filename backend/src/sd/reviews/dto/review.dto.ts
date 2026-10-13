import {
    IsArray,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Max,
    Min,
} from 'class-validator'
import { Type } from 'class-transformer'

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
