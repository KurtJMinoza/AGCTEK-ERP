import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsNumber,
    IsIn,
    IsDateString,
    IsArray,
    ValidateNested,
    ArrayMaxSize,
    ArrayMinSize,
    Min,
    MaxLength,
} from 'class-validator'
import { Type, Transform } from 'class-transformer'

const OPERATIONS = [
    'RECEIVING',
    'PUTAWAY',
    'PICKING',
    'PACKING',
    'COUNTING',
    'TRANSFER',
] as const

function pickAlias(obj: any, camel: string, snake: string) {
    if (obj[camel] !== undefined && obj[camel] !== null) return obj[camel]
    if (obj[snake] !== undefined && obj[snake] !== null) return obj[snake]
    return undefined
}

export class ScannerEventDto {
    @Transform(({ obj }) => pickAlias(obj, 'deviceId', 'device_id'))
    @IsString()
    @IsNotEmpty()
    deviceId!: string

    @Transform(({ obj }) => pickAlias(obj, 'userId', 'user_id'))
    @IsString()
    @IsNotEmpty()
    userId!: string

    @IsIn(OPERATIONS)
    operation!: string

    @IsString()
    @IsNotEmpty()
    barcode!: string

    @Transform(({ obj }) => pickAlias(obj, 'timestamp', 'timestamp'))
    @IsDateString()
    timestamp!: string

    @IsOptional()
    @IsNumber()
    @Min(0.000001)
    @Type(() => Number)
    quantity?: number

    @Transform(({ obj }) => pickAlias(obj, 'warehouseId', 'warehouse'))
    @IsOptional()
    @IsString()
    warehouseId?: string

    /** Bin barcode or storageBinId */
    @Transform(({ obj }) => pickAlias(obj, 'bin', 'bin'))
    @IsOptional()
    @IsString()
    bin?: string

    @Transform(({ obj }) => pickAlias(obj, 'batch', 'batch'))
    @IsOptional()
    @IsString()
    batch?: string

    @Transform(({ obj }) => pickAlias(obj, 'serial', 'serial'))
    @IsOptional()
    @IsString()
    serial?: string

    @Transform(({ obj }) => pickAlias(obj, 'idempotencyKey', 'idempotency_key'))
    @IsString()
    @IsNotEmpty()
    @MaxLength(128)
    idempotencyKey!: string

    // ── Operation context ───────────────────────────────────────

    @IsOptional()
    @IsString()
    expectedReceiptId?: string

    @IsOptional()
    @IsString()
    expectedReceiptLineId?: string

    @IsOptional()
    @IsString()
    putawayTaskId?: string

    @IsOptional()
    @IsString()
    pickingTaskId?: string

    @IsOptional()
    @IsString()
    packageId?: string

    @IsOptional()
    @IsString()
    countLineId?: string

    /** TRANSFER: destination bin barcode or id */
    @IsOptional()
    @IsString()
    destinationBin?: string

    @IsOptional()
    @IsString()
    companyId?: string

    @IsOptional()
    @IsString()
    uomId?: string
}

export class ScannerEventBatchDto {
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(50)
    @ValidateNested({ each: true })
    @Type(() => ScannerEventDto)
    events!: ScannerEventDto[]
}

export class ResolveQueryDto {
    @IsString()
    @IsNotEmpty()
    barcode!: string

    @IsOptional()
    @IsString()
    companyId?: string
}

export class ScannerEventsQueryDto {
    @IsOptional()
    @IsString()
    companyId?: string

    @IsOptional()
    @IsString()
    operation?: string

    @IsOptional()
    @IsString()
    userId?: string

    @IsOptional()
    @IsString()
    status?: string

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    page?: number

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    pageSize?: number
}
