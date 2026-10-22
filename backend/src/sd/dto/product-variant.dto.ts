import {
    ArrayMaxSize,
    IsArray,
    IsBoolean,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    MaxLength,
    Min,
    ValidateIf,
} from 'class-validator'

/**
 * Add Variant — request body.
 *
 * The variant LINKS an existing Material Master item. It never creates one:
 * no material payload, no opening stock, no cost/warehouse update, no nested
 * parent-product creation.
 */
export class AddVariantDto {
    /** Existing Material Master item (required — no auto-creation). */
    @IsString()
    @IsNotEmpty()
    materialId!: string

    /**
     * Selected option values, one per product option, in the product's option
     * order (e.g. ["Black", "Medium"] for [Color, Size]).
     */
    @IsArray()
    @ArrayMaxSize(10)
    @IsString({ each: true })
    optionValues!: string[]

    /** Display name; defaults to the selected option values. */
    @IsOptional()
    @IsString()
    @MaxLength(200)
    variantName?: string

    /** Sellable price override; omitted → inherit the parent product price. */
    @IsOptional()
    @ValidateIf((_, value) => value !== null)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(999_999_999.99)
    price?: number | null

    /**
     * Scannable barcode (POS / scanner lookup). Omitted → the material's
     * primary barcode.
     */
    @IsOptional()
    @ValidateIf((_, value) => value !== null)
    @IsString()
    @MaxLength(128)
    barcode?: string | null

    /** Shipping weight of the variant. */
    @IsOptional()
    @ValidateIf((_, value) => value !== null)
    @IsNumber()
    @Min(0)
    weight?: number | null

    /** Variant image override; omitted → the parent product image. */
    @IsOptional()
    @IsString()
    @MaxLength(1000)
    imageUrl?: string

    /** Make this the storefront/POS default variant. */
    @IsOptional()
    @IsBoolean()
    isDefault?: boolean

    /** Published variants are sellable on the storefront. */
    @IsOptional()
    @IsBoolean()
    isPublished?: boolean

    /** Client-generated key so a double submit cannot create two variants. */
    @IsOptional()
    @IsUUID()
    idempotencyKey?: string
}

/**
 * Edit Variant — request body.
 *
 * Relinking a material never creates or deletes a material: the old material
 * and its stock are preserved.
 */
export class UpdateVariantDto {
    /** New existing Material Master item. Omitted → keep the current link. */
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    materialId?: string

    /** New selected option values (one per product option). */
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(10)
    @IsString({ each: true })
    optionValues?: string[]

    @IsOptional()
    @IsString()
    @MaxLength(200)
    variantName?: string

    @IsOptional()
    @ValidateIf((_, value) => value !== null)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(999_999_999.99)
    price?: number | null

    /** Scannable barcode (POS / scanner lookup). */
    @IsOptional()
    @ValidateIf((_, value) => value !== null)
    @IsString()
    @MaxLength(128)
    barcode?: string | null

    /** Shipping weight of the variant. */
    @IsOptional()
    @ValidateIf((_, value) => value !== null)
    @IsNumber()
    @Min(0)
    weight?: number | null

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    imageUrl?: string

    @IsOptional()
    @IsBoolean()
    isActive?: boolean

    @IsOptional()
    @IsBoolean()
    isPublished?: boolean

    @IsOptional()
    @IsBoolean()
    isDefault?: boolean

    @IsOptional()
    @IsInt()
    @Min(0)
    sortOrder?: number
}
