import {
    IsBoolean,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsObject,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
    ValidateIf,
} from 'class-validator'
import { Transform } from 'class-transformer'
import { RETAIL_SALES_DIVISIONS } from './sales-order.dto'

const MAX_PRICE = 999_999_999.99

/** Empty, a site path (`/img/...`) or an absolute http(s) URL — what next/image can render. */
const IMAGE_URL = /^$|^\/(?!\/)|^https?:\/\//
const IMAGE_URL_MESSAGE =
    'imageUrl must be empty, a site path starting with / or an http(s) URL'

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value

const upperTrim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value

const emptyToNull = ({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? null : value

export class ListProductsQueryDto {
    @IsOptional()
    @IsIn(RETAIL_SALES_DIVISIONS)
    divisionId?: string

    /** `true` (storefronts) hides inactive products. Plain string: implicit conversion turns "false" into true. */
    @IsOptional()
    @IsIn(['true', 'false'])
    activeOnly?: 'true' | 'false'

    @IsOptional()
    @Transform(upperTrim)
    @IsString()
    @MaxLength(64)
    sku?: string

    /** Matches name, SKU or category (case-insensitive). */
    @IsOptional()
    @IsString()
    @MaxLength(100)
    search?: string
}

export class CreateProductDto {
    @IsIn(RETAIL_SALES_DIVISIONS)
    divisionId!: string

    @IsOptional()
    @IsBoolean()
    autoGenerateSku?: boolean

    @ValidateIf((dto: CreateProductDto) => !dto.autoGenerateSku)
    @Transform(upperTrim)
    @IsString()
    @Matches(/^[A-Z0-9][A-Z0-9._-]*$/, {
        message: 'sku may only contain letters, digits, dot, dash and underscore',
    })
    @MaxLength(64)
    sku?: string

    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    name!: string

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(2000)
    description?: string

    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(MAX_PRICE)
    price!: number

    @IsOptional()
    @ValidateIf((_, value) => value !== null)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(MAX_PRICE)
    originalPrice?: number | null

    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(80)
    category!: string

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(1000)
    @Matches(IMAGE_URL, { message: IMAGE_URL_MESSAGE })
    imageUrl?: string

    @IsOptional()
    @Transform(emptyToNull)
    @ValidateIf((_, value) => value !== null)
    @IsString()
    @MaxLength(60)
    badge?: string | null

    @IsOptional()
    @IsBoolean()
    isActive?: boolean

    @IsOptional()
    @IsIn(['STOCK_ITEM', 'NON_STOCK_ITEM', 'SERVICE'])
    productType?: string

    @IsOptional()
    @IsString()
    salesUomId?: string

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(100_000)
    sortOrder?: number

    /** Division-specific storefront content; stored as-is. */
    @IsOptional()
    @ValidateIf((_, value) => value !== null)
    @IsObject()
    attributes?: Record<string, unknown> | null

    /** Extra product photos (cover is `imageUrl`); persisted under attributes.gallery. */
    @IsOptional()
    @IsString({ each: true })
    imageGallery?: string[]

    @IsOptional()
    @IsString()
    createdBy?: string

    /** MM material for fulfillment (required when productType is STOCK_ITEM). */
    @IsOptional()
    @IsString()
    materialId?: string

    @IsOptional()
    @IsString({ each: true })
    materialIds?: string[]

    @IsOptional()
    @IsIn(['single', 'multiple'])
    materialLinkMode?: 'single' | 'multiple'

    /** Company scope for the product–material assignment. */
    @IsOptional()
    @IsString()
    companyId?: string
}

export class UpdateProductDto {
    @IsOptional()
    @IsIn(RETAIL_SALES_DIVISIONS)
    divisionId?: string

    @IsOptional()
    @Transform(upperTrim)
    @IsString()
    @Matches(/^[A-Z0-9][A-Z0-9._-]*$/, {
        message: 'sku may only contain letters, digits, dot, dash and underscore',
    })
    @MaxLength(64)
    sku?: string

    @IsOptional()
    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    name?: string

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(2000)
    description?: string

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(MAX_PRICE)
    price?: number

    @IsOptional()
    @ValidateIf((_, value) => value !== null)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(MAX_PRICE)
    originalPrice?: number | null

    @IsOptional()
    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(80)
    category?: string

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(1000)
    @Matches(IMAGE_URL, { message: IMAGE_URL_MESSAGE })
    imageUrl?: string

    @IsOptional()
    @Transform(emptyToNull)
    @ValidateIf((_, value) => value !== null)
    @IsString()
    @MaxLength(60)
    badge?: string | null

    @IsOptional()
    @IsBoolean()
    isActive?: boolean

    @IsOptional()
    @IsIn(['STOCK_ITEM', 'NON_STOCK_ITEM', 'SERVICE'])
    productType?: string

    @IsOptional()
    @IsString()
    salesUomId?: string

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(100_000)
    sortOrder?: number

    @IsOptional()
    @ValidateIf((_, value) => value !== null)
    @IsObject()
    attributes?: Record<string, unknown> | null

    @IsOptional()
    @IsString({ each: true })
    imageGallery?: string[]

    @IsOptional()
    @IsString()
    updatedBy?: string
}
