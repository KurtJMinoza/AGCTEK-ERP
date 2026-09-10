import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsNumber,
    IsIn,
    IsDateString,
    Min,
    IsInt,
} from 'class-validator'
import { Type } from 'class-transformer'

const SOURCE_TYPES = [
    'SALES_ORDER',
    'PRODUCTION_ORDER',
    'MAINTENANCE_ORDER',
    'INTERNAL_REQUEST',
    'PROJECT',
] as const

const STATUSES = ['OPEN', 'PARTIAL', 'FULFILLED', 'CANCELLED', 'EXPIRED'] as const

export class CreateReservationDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsString()
    @IsNotEmpty()
    warehouseId!: string

    @IsString()
    @IsNotEmpty()
    materialId!: string

    @IsNumber()
    @Min(0.000001)
    quantity!: number

    @IsIn(SOURCE_TYPES)
    sourceType!: string

    @IsString()
    @IsNotEmpty()
    sourceModule!: string

    @IsString()
    @IsNotEmpty()
    sourceDocumentType!: string

    @IsString()
    @IsNotEmpty()
    sourceDocumentId!: string

    @IsOptional()
    @IsString()
    sourceDocumentLineId?: string

    @IsOptional()
    @IsString()
    storageBinId?: string

    @IsOptional()
    @IsString()
    batchId?: string

    @IsOptional()
    @IsString()
    serialNumberId?: string

    @IsOptional()
    @IsDateString()
    validUntil?: string

    @IsOptional()
    @IsString()
    createdBy?: string
}

export class ReservationQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    limit?: number

    @IsOptional()
    @IsString()
    companyId?: string

    @IsOptional()
    @IsString()
    warehouseId?: string

    @IsOptional()
    @IsString()
    materialId?: string

    @IsOptional()
    @IsIn(STATUSES)
    status?: string

    @IsOptional()
    @IsIn(SOURCE_TYPES)
    sourceType?: string

    @IsOptional()
    @IsString()
    sourceDocumentId?: string

    @IsOptional()
    @IsString()
    search?: string
}

export class AtpQueryDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsString()
    @IsNotEmpty()
    warehouseId!: string

    @IsString()
    @IsNotEmpty()
    materialId!: string

    @IsOptional()
    @IsString()
    storageBinId?: string

    @IsOptional()
    @IsString()
    batchId?: string

    @IsOptional()
    @IsString()
    serialNumberId?: string
}
