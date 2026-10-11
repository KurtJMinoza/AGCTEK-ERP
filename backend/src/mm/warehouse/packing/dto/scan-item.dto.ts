import { IsIn, IsNumber, IsOptional, IsString, Min, MaxLength } from 'class-validator'

/**
 * Scanner-first packing scan. The packer types / scans whatever the label
 * carries — the server resolves `materialId`, `materialCode` or `barcode` to
 * the material, so no material dropdown is needed and the client never decides
 * which item a scan counts against. At least one of the three is required
 * (validated in the service, which is the authority).
 */
export class ScanItemDto {
    @IsOptional()
    @IsString()
    materialId?: string

    /** Material Master code, e.g. MAT-000008. */
    @IsOptional()
    @IsString()
    materialCode?: string

    /** Any barcode that resolves to the material (preferred for scanners). */
    @IsOptional()
    @IsString()
    barcode?: string

    @IsOptional()
    @IsNumber()
    @Min(0.000001)
    quantity?: number

    @IsOptional()
    @IsString()
    batchId?: string

    @IsOptional()
    @IsString()
    serialId?: string

    /** barcode (scanner) or manual (fallback controls). */
    @IsOptional()
    @IsIn(['barcode', 'manual'])
    scanType?: 'barcode' | 'manual'

    @IsOptional()
    @IsString()
    @MaxLength(128)
    idempotencyKey?: string
}
