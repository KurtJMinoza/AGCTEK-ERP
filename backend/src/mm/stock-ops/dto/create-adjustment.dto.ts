import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsDateString,
    IsArray,
    ValidateNested,
    IsNumber,
    IsIn,
} from 'class-validator'
import { Type } from 'class-transformer'

const ADJUSTMENT_REASONS = [
    'DAMAGE',
    'LOSS',
    'FOUND',
    'SHRINKAGE',
    'OVERAGE',
    'COUNT_VARIANCE',
    'SYSTEM_ERROR',
    'EXPIRED',
] as const

class AdjustmentLineDto {
    @IsString()
    @IsNotEmpty()
    materialId!: string

    @IsNumber()
    quantity!: number

    @IsString()
    @IsNotEmpty()
    uomId!: string

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
    @IsNumber()
    unitCost?: number

    @IsOptional()
    @IsString()
    remarks?: string
}

export class CreateAdjustmentDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsString()
    @IsNotEmpty()
    warehouseId!: string

    @IsDateString()
    postingDate!: string

    @IsIn(ADJUSTMENT_REASONS)
    adjustmentReason!: string

    @IsOptional()
    @IsString()
    justification?: string

    @IsOptional()
    @IsNumber()
    approvalThreshold?: number

    @IsOptional()
    @IsString()
    createdBy?: string

    @IsOptional()
    @IsString()
    sourceCountId?: string

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AdjustmentLineDto)
    lines!: AdjustmentLineDto[]
}
