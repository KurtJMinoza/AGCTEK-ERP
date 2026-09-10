import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsNumber,
    IsInt,
    IsBoolean,
    IsIn,
    IsArray,
    IsDateString,
    Min,
    MaxLength,
} from 'class-validator'
import { Type } from 'class-transformer'

export class CreateCountRuleDto {
    @IsOptional()
    @IsString()
    @MaxLength(32)
    code?: string

    @IsString()
    @IsNotEmpty()
    name!: string

    @IsOptional()
    @IsString()
    companyId?: string

    @IsOptional()
    @IsString()
    warehouseId?: string

    @IsOptional()
    @IsIn(['A', 'B', 'C'])
    abcClass?: string

    @IsOptional()
    @IsIn(['FAST', 'MEDIUM', 'SLOW'])
    velocityClass?: string

    @IsOptional()
    @IsIn(['LOW', 'MEDIUM', 'HIGH'])
    riskClass?: string

    @IsOptional()
    @IsString()
    materialCategoryId?: string

    @IsOptional()
    @IsString()
    materialTypeId?: string

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    frequencyDays?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    varianceQtyTolerance?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    varianceValueTolerance?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    minUnitValue?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    maxUnitValue?: number

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    priority?: number

    @IsOptional()
    @IsBoolean()
    isActive?: boolean
}

export class UpdateCountRuleDto {
    @IsOptional()
    @IsString()
    name?: string

    @IsOptional()
    @IsString()
    warehouseId?: string

    @IsOptional()
    @IsIn(['A', 'B', 'C'])
    abcClass?: string

    @IsOptional()
    @IsIn(['FAST', 'MEDIUM', 'SLOW'])
    velocityClass?: string

    @IsOptional()
    @IsIn(['LOW', 'MEDIUM', 'HIGH'])
    riskClass?: string

    @IsOptional()
    @IsString()
    materialCategoryId?: string

    @IsOptional()
    @IsString()
    materialTypeId?: string

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    frequencyDays?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    varianceQtyTolerance?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    varianceValueTolerance?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    minUnitValue?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    maxUnitValue?: number

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    priority?: number

    @IsOptional()
    @IsBoolean()
    isActive?: boolean
}

export class CountRuleQueryDto {
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
    warehouseId?: string

    @IsOptional()
    @IsIn(['A', 'B', 'C'])
    abcClass?: string

    @IsOptional()
    @IsBoolean()
    @Type(() => Boolean)
    isActive?: boolean
}

export class CreateInventoryCountDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsString()
    @IsNotEmpty()
    warehouseId!: string

    @IsIn(['CYCLE', 'PHYSICAL'])
    countType!: string

    @IsOptional()
    @IsString()
    ruleId?: string

    @IsOptional()
    @IsDateString()
    dueDate?: string

    @IsOptional()
    @IsString()
    createdBy?: string
}

export class InventoryCountQueryDto {
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
    warehouseId?: string

    @IsOptional()
    @IsIn(['CYCLE', 'PHYSICAL'])
    countType?: string

    @IsOptional()
    @IsString()
    status?: string

    @IsOptional()
    @IsString()
    search?: string
}

export class GenerateCountDto {
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    storageBinIds?: string[]

    @IsOptional()
    @IsString()
    assignedCounter?: string

    /** Include zero-qty unrestricted balances (default: true for PHYSICAL, false for CYCLE) */
    @IsOptional()
    @IsBoolean()
    includeZeroBalances?: boolean
}

export class BlindCountDto {
    @IsNumber()
    @Min(0)
    countedQuantity!: number

    @IsOptional()
    @IsString()
    countedBy?: string

    @IsOptional()
    @IsString()
    @MaxLength(128)
    idempotencyKey?: string
}

export class RecountDto {
    @IsNumber()
    @Min(0)
    recountQuantity!: number

    @IsOptional()
    @IsString()
    recountBy?: string
}

export class ApproveCountDto {
    @IsOptional()
    @IsString()
    approvedBy?: string

    @IsOptional()
    @IsIn(['SHRINKAGE', 'DAMAGE', 'LOSS', 'OVERAGE', 'SYSTEM_ERROR', 'COUNT_VARIANCE'])
    adjustmentReason?: string

    @IsOptional()
    @IsNumber()
    @Min(0)
    approvalThreshold?: number
}

export class RejectCountDto {
    @IsOptional()
    @IsString()
    reason?: string

    @IsOptional()
    @IsString()
    rejectedBy?: string
}

export class CountLineQueryDto {
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
    countId?: string

    @IsOptional()
    @IsString()
    status?: string

    @IsOptional()
    @IsString()
    assignedCounter?: string

    @IsOptional()
    @IsString()
    warehouseId?: string

    /** When true, omit systemQuantity from response (blind counter view) */
    @IsOptional()
    @IsBoolean()
    @Type(() => Boolean)
    blind?: boolean
}
