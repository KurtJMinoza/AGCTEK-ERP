import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsNumber,
    IsIn,
    IsDateString,
    MaxLength,
    Min,
} from 'class-validator'

import { MM_MOVEMENT_TYPES, MM_STOCK_STATUSES } from '../inventory.constants'

const MOVEMENT_TYPES = MM_MOVEMENT_TYPES.filter((t) => t !== 'STATUS_CHANGE')

const STOCK_STATUSES = MM_STOCK_STATUSES

export class PostTransactionDto {
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

    @IsOptional()
    @IsString()
    sourceBinId?: string

    @IsOptional()
    @IsString()
    destinationBinId?: string

    @IsString()
    @IsNotEmpty()
    materialId!: string

    @IsOptional()
    @IsString()
    batchId?: string

    @IsOptional()
    @IsString()
    serialNumberId?: string

    @IsOptional()
    @IsIn(STOCK_STATUSES)
    stockStatus?: string

    @IsIn(MOVEMENT_TYPES)
    movementType!: string

    @IsNumber()
    @Min(0.000001)
    quantity!: number

    @IsString()
    @IsNotEmpty()
    uomId!: string

    @IsOptional()
    @IsNumber()
    unitCost?: number

    @IsOptional()
    @IsNumber()
    totalCost?: number

    @IsDateString()
    postingDate!: string

    @IsDateString()
    documentDate!: string

    @IsOptional()
    @IsString()
    @MaxLength(64)
    sourceModule?: string

    @IsOptional()
    @IsString()
    @MaxLength(64)
    sourceDocumentType?: string

    @IsOptional()
    @IsString()
    sourceDocumentId?: string

    @IsOptional()
    @IsString()
    sourceDocumentLineId?: string

    @IsOptional()
    @IsString()
    @MaxLength(64)
    reasonCode?: string

    @IsOptional()
    @IsString()
    @MaxLength(500)
    remarks?: string

    @IsOptional()
    @IsString()
    @MaxLength(128)
    idempotencyKey?: string

    @IsOptional()
    @IsString()
    createdBy?: string

    /** AVAILABLE (default) checks availableQuantity; ON_HAND checks physical quantity (e.g. reserved GI). */
    @IsOptional()
    @IsIn(['AVAILABLE', 'ON_HAND'])
    stockCheckMode?: 'AVAILABLE' | 'ON_HAND'

    /** After an outbound movement, release this amount from reservedQuantity on the balance. */
    @IsOptional()
    @IsNumber()
    @Min(0)
    releaseReservedQuantity?: number
}
