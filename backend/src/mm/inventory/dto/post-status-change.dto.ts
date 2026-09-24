import {
    IsDateString,
    IsIn,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    MaxLength,
    Min,
} from 'class-validator'
import { MM_STOCK_STATUSES } from '../inventory.constants'

export class PostStatusChangeDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsOptional()
    @IsString()
    plantId?: string

    @IsString()
    @IsNotEmpty()
    warehouseId!: string

    @IsOptional()
    @IsString()
    storageBinId?: string

    @IsString()
    @IsNotEmpty()
    materialId!: string

    @IsOptional()
    @IsString()
    batchId?: string

    @IsOptional()
    @IsString()
    serialNumberId?: string

    @IsIn(MM_STOCK_STATUSES)
    fromStatus!: string

    @IsIn(MM_STOCK_STATUSES)
    toStatus!: string

    @IsNumber()
    @Min(0.000001)
    quantity!: number

    @IsString()
    @IsNotEmpty()
    uomId!: string

    @IsDateString()
    postingDate!: string

    @IsDateString()
    documentDate!: string

    @IsOptional()
    @IsString()
    sourceModule?: string

    @IsOptional()
    @IsString()
    sourceDocumentType?: string

    @IsOptional()
    @IsString()
    sourceDocumentId?: string

    @IsOptional()
    @IsString()
    sourceDocumentLineId?: string

    @IsOptional()
    @IsString()
    @MaxLength(128)
    idempotencyKey?: string

    @IsOptional()
    @IsString()
    createdBy?: string
}
