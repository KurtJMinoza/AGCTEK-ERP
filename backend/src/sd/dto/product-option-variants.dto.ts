import { Type } from 'class-transformer'
import {
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
    ValidateIf,
    ValidateNested,
} from 'class-validator'

const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._-]*$/
const SKU_MESSAGE =
    'sku may only contain letters, digits, dot, dash and underscore'

/** Storefront option control style. */
export const OPTION_DISPLAY_STYLES = [
    'BUTTON',
    'DROPDOWN',
    'SWATCH',
    'IMAGE',
    'TILE',
] as const
export type OptionDisplayStyle = (typeof OPTION_DISPLAY_STYLES)[number]

/** Whether a selected variant image replaces the main product photo. */
export const VARIANT_IMAGE_MODES = ['replace', 'keep'] as const
export type VariantImageMode = (typeof VARIANT_IMAGE_MODES)[number]

export class ProductOptionValueInputDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    value!: string

    @IsOptional()
    @IsInt()
    @Min(0)
    sortOrder?: number

    /** SWATCH style color (hex, e.g. #111827). */
    @IsOptional()
    @IsString()
    @MaxLength(32)
    swatchColor?: string

    /** IMAGE style value picture. */
    @IsOptional()
    @IsString()
    @MaxLength(1000)
    imageUrl?: string
}

export class ProductOptionInputDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(80)
    name!: string

    @IsOptional()
    @IsBoolean()
    isRequired?: boolean

    /** Storefront control style (defaults to BUTTON). */
    @IsOptional()
    @IsIn(OPTION_DISPLAY_STYLES)
    displayStyle?: OptionDisplayStyle

    @IsOptional()
    @IsInt()
    @Min(0)
    sortOrder?: number

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => ProductOptionValueInputDto)
    values!: ProductOptionValueInputDto[]
}

export class VariantInputDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    variantName!: string

    @IsString()
    @IsNotEmpty()
    @MaxLength(64)
    @Matches(SKU_PATTERN, { message: SKU_MESSAGE })
    sku!: string

    @IsOptional()
    @IsString()
    @MaxLength(128)
    barcode?: string

    /** Sellable price override; null/omitted → inherit the parent product price. */
    @IsOptional()
    @ValidateIf((_, value) => value !== null)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(999_999_999.99)
    price?: number | null

    @IsOptional()
    @ValidateIf((_, value) => value !== null)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(999_999_999.99)
    compareAtPrice?: number | null

    @IsOptional()
    @ValidateIf((_, value) => value !== null)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(999_999_999.99)
    cost?: number | null

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    imageUrl?: string

    @IsOptional()
    @ValidateIf((_, value) => value !== null)
    @IsNumber()
    @Min(0)
    weight?: number | null

    @IsOptional()
    @IsBoolean()
    isActive?: boolean

    /** Default preset variant on the storefront / POS (one per product). */
    @IsOptional()
    @IsBoolean()
    isDefault?: boolean

    /** Display order within the product. */
    @IsOptional()
    @IsInt()
    @Min(0)
    sortOrder?: number

    /** MM material the variant sells (stock authority). */
    @IsOptional()
    @IsString()
    materialId?: string

    @IsOptional()
    @IsString()
    companyId?: string

    @IsOptional()
    @IsString()
    salesUomId?: string

    @IsOptional()
    @IsString()
    materialUomId?: string

    /**
     * Display values in the same order as `options` (e.g. ["Black", "Medium"]
     * for [Color, Size]). Each value must exist in its option.
     */
    @IsArray()
    @ArrayMinSize(1)
    @IsString({ each: true })
    optionValues!: string[]
}

export class UpdateProductOptionsVariantsDto {
    /** Empty arrays clear options and variants (back to a simple product). */
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProductOptionInputDto)
    options!: ProductOptionInputDto[]

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => VariantInputDto)
    variants!: VariantInputDto[]

    /** Storefront: variant image replaces the main product photo. */
    @IsOptional()
    @IsIn(VARIANT_IMAGE_MODES)
    variantImageMode?: VariantImageMode
}

/** Retail order line: optional selected variant of the sold product. */
export class VariantLineReferenceDto {
    @IsOptional()
    @IsString()
    @MaxLength(64)
    variantId?: string
}