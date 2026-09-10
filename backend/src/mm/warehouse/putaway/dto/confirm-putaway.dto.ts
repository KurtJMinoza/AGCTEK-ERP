import { IsString, IsNotEmpty, IsNumber, Min, IsOptional, MaxLength } from 'class-validator'

export class ConfirmPutawayDto {
    @IsString()
    @IsNotEmpty()
    actualBinId!: string

    @IsNumber()
    @Min(0.01)
    quantity!: number

    /** Optional scanned bin code/barcode — must resolve to actualBinId when provided */
    @IsOptional()
    @IsString()
    @MaxLength(128)
    scannedBinCode?: string

    @IsOptional()
    @IsString()
    @MaxLength(128)
    idempotencyKey?: string
}
