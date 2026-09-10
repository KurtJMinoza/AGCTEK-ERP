import {
    IsString,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    Min,
    MaxLength,
} from 'class-validator'

export class ConfirmPickingDto {
    @IsString()
    @IsNotEmpty()
    scannedBinId!: string

    @IsString()
    @IsNotEmpty()
    scannedMaterialId!: string

    @IsOptional()
    @IsString()
    scannedBatchId?: string

    @IsOptional()
    @IsString()
    scannedSerialId?: string

    @IsNumber()
    @Min(0.01)
    pickedQty!: number

    @IsOptional()
    @IsString()
    @MaxLength(128)
    idempotencyKey?: string
}
