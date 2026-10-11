import {
    IsIn,
    IsNumber,
    IsOptional,
    IsString,
    MaxLength,
    Min,
} from 'class-validator'

/**
 * Manual packing adjustment (no barcode scanner): +1 / −1 / add an exact
 * quantity / reset the line. The backend re-validates the expected quantity,
 * so this is a convenience — never an authority bypass.
 */
export class AdjustPackageItemDto {
    @IsIn(['add', 'remove', 'reset'])
    action!: 'add' | 'remove' | 'reset'

    @IsOptional()
    @IsNumber()
    @Min(0.000001)
    quantity?: number

    /** Justification for manual overrides / short packs (audit log). */
    @IsOptional()
    @IsString()
    @MaxLength(500)
    reason?: string
}

/**
 * "Complete Packing". Blocked until every required quantity is scanned unless
 * `allowPartial` is explicitly set together with a reason (short pack).
 */
export class CompletePackingDto {
    @IsOptional()
    allowPartial?: boolean

    @IsOptional()
    @IsString()
    @MaxLength(500)
    reason?: string
}
