import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsBoolean,
    IsNumber,
    IsInt,
    IsIn,
    IsArray,
    ValidateNested,
    ArrayMaxSize,
    Min,
    MaxLength,
    MinLength,
    IsUUID,
} from 'class-validator'
import { Type } from 'class-transformer'

// ─── Option value ────────────────────────────────────────────────────────────

export class OptionValueInput {
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    value!: string

    @IsOptional()
    @IsString()
    swatchColor?: string

    @IsOptional()
    @IsString()
    imageUrl?: string

    @IsOptional()
    @IsInt()
    @Min(0)
    sortOrder?: number
}

// ─── Option ──────────────────────────────────────────────────────────────────

export class OptionInput {
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name!: string

    @IsOptional()
    @IsIn(['BUTTON', 'DROPDOWN', 'SWATCH', 'IMAGE', 'TILE'])
    displayStyle?: string

    @IsOptional()
    @IsBoolean()
    isRequired?: boolean

    @IsOptional()
    @IsInt()
    @Min(0)
    sortOrder?: number

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => OptionValueInput)
    values!: OptionValueInput[]
}

// ─── Variant ─────────────────────────────────────────────────────────────────

export class MaterialOverridesInput {
    @IsOptional() @IsString() baseUomId?: string
    @IsOptional() @IsString() salesUomId?: string
    @IsOptional() @IsString() defaultWarehouseId?: string
    @IsOptional() @IsString() storageBinId?: string
    @IsOptional() @IsNumber() @Min(0) standardCost?: number
    @IsOptional() @IsNumber() @Min(0) safetyStock?: number
    @IsOptional() @IsNumber() @Min(0) maximumStock?: number
    @IsOptional() @IsNumber() @Min(0) reorderPoint?: number
    @IsOptional() @IsBoolean() batchManaged?: boolean
    @IsOptional() @IsBoolean() serialManaged?: boolean
    @IsOptional() @IsBoolean() expiryManaged?: boolean
}

/**
 * One sellable combination. It LINKS an existing Material Master item —
 * the Product Catalog never creates a material.
 */
export class VariantInput {
    @IsBoolean()
    enabled!: boolean

    @IsOptional()
    @IsString()
    @MaxLength(80)
    sku?: string

    @IsOptional()
    @IsString()
    @MaxLength(64)
    barcode?: string

    @IsOptional()
    @IsNumber()
    @Min(0)
    price?: number

    @IsOptional()
    @IsNumber()
    @Min(0)
    compareAtPrice?: number

    @IsOptional()
    @IsString()
    imageUrl?: string

    @IsOptional()
    @IsNumber()
    @Min(0)
    weight?: number

    /** Option value selections for this combination, e.g. ["Black", "Medium"] */
    @IsArray()
    @IsString({ each: true })
    optionValues!: string[]

    @IsOptional()
    @ValidateNested()
    @Type(() => MaterialOverridesInput)
    materialOverrides?: MaterialOverridesInput

    /** The existing MM material this variant sells (required). */
    @IsOptional()
    @IsString()
    existingMaterialId?: string
}

// ─── Material defaults ──────────────────────────────────────────────────────

/**
 * Stock ownership for the product. The Product Catalog never creates a
 * material — the variants link EXISTING Material Master items, so only the
 * owning company is needed here.
 */
export class MaterialDefaultsInput {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    /** Optional: only used to label the product category when sent. */
    @IsOptional()
    @IsString()
    materialCategoryId?: string
}

// ─── Root ────────────────────────────────────────────────────────────────────

export class CreateProductFamilyDto {
    @IsString()
    @IsNotEmpty()
    divisionId!: string

    @IsString()
    @IsNotEmpty()
    @MinLength(2)
    @MaxLength(200)
    name!: string

    @IsOptional()
    @IsString()
    description?: string

    @IsOptional()
    @IsString()
    brand?: string

    @IsOptional()
    @IsString()
    category?: string

    @IsNumber()
    @Min(0)
    price!: number

    @IsOptional()
    @IsNumber()
    @Min(0)
    originalPrice?: number

    @IsOptional()
    @IsString()
    imageUrl?: string

    @IsOptional()
    @IsString()
    badge?: string

    @IsIn(['SIMPLE', 'VARIABLE'])
    productConfig!: 'SIMPLE' | 'VARIABLE'

    @IsOptional()
    @IsString()
    salesUomId?: string

    @IsOptional()
    @IsString()
    @MaxLength(80)
    sku?: string

    /** Client-generated UUID to prevent duplicate product creation on retries. */
    @IsOptional()
    @IsUUID()
    idempotencyKey?: string

    @ValidateNested()
    @Type(() => MaterialDefaultsInput)
    materialDefaults!: MaterialDefaultsInput

    /**
     * SIMPLE products only: link an existing MM material instead of creating
     * one. VARIABLE products link a material per variant (`variants[].existingMaterialId`).
     */
    @IsOptional()
    @IsString()
    existingMaterialId?: string

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(10)
    @ValidateNested({ each: true })
    @Type(() => OptionInput)
    options?: OptionInput[]

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(500)
    @ValidateNested({ each: true })
    @Type(() => VariantInput)
    variants?: VariantInput[]
}
