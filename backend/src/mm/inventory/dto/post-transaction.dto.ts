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

const MOVEMENT_TYPES = [
    'RECEIPT',
    'ISSUE',
    'TRANSFER_IN',
    'TRANSFER_OUT',
    'ADJUSTMENT_IN',
    'ADJUSTMENT_OUT',
    'RETURN_IN',
    'RETURN_OUT',
    'SCRAP',
    'COUNT_GAIN',
    'COUNT_LOSS',
] as const

const STOCK_STATUSES = [
    'UNRESTRICTED',
    'QUALITY_INSPECTION',
    'BLOCKED',
    'QUARANTINE',
    'IN_TRANSIT',
    'EXPIRED',
    'DAMAGED',
] as const

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
