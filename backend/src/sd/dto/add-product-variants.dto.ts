import {
    IsArray,
    IsBoolean,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'

/** One new option value for an existing option group. */
export class NewOptionValueInput {
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    value!: string
}

/** New values for one existing option group (e.g. Size → Extra Large). */
export class NewOptionValuesInput {
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    optionName!: string

    @IsArray()
    @IsString({ each: true })
    @IsNotEmpty({ each: true })
    values!: string[]
}

/** Material overrides for the variant's auto-created material. */
export class AddVariantMaterialOverridesInput {
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
 * One variant to add to an existing VARIABLE product. The combination must
 * not exist yet — the server rejects duplicates with 409.
 */
export class AddVariantInput {
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

    /** Option value selections for this combination, e.g. ["Black", "Medium"]. */
    @IsArray()
    @IsString({ each: true })
    optionValues!: string[]

    @IsOptional()
    @ValidateNested()
    @Type(() => AddVariantMaterialOverridesInput)
    materialOverrides?: AddVariantMaterialOverridesInput

    /** Link an existing MM material instead of auto-creating one. */
    @IsOptional()
    @IsString()
    existingMaterialId?: string
}

/**
 * POST /sd/products/:id/variants — add option values and/or variant
 * combinations to an existing VARIABLE product.
 *
 * Only the MISSING combinations are created: existing variants and their
 * stock are never touched, and no second parent product is created.
 */
export class AddProductVariantsDto {
    /** New values for existing option groups. */
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => NewOptionValuesInput)
    newOptionValues?: NewOptionValuesInput[]

    /** The variant combinations to create (one entry = one custom variant). */
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AddVariantInput)
    newVariants?: AddVariantInput[]
}
