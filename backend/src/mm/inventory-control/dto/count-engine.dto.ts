import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsNumber,
    IsBoolean,
    IsArray,
    ValidateNested,
    Min,
    IsIn,
    IsDateString,
    IsInt,
} from 'class-validator'
import { Type } from 'class-transformer'
import { COUNT_TYPES, COUNT_PLAN_STATUSES, ADJUSTMENT_REQUEST_STATUSES } from '../count-engine.constants'

export class CreateCountPolicyDto {
    @IsOptional() @IsString() code?: string
    @IsString() @IsNotEmpty() name!: string
    @IsOptional() @IsString() companyId?: string
    @IsOptional() @IsString() warehouseId?: string
    @IsOptional() @IsIn(['A', 'B', 'C']) abcClass?: string
    @IsOptional() @IsString() velocityClass?: string
    @IsOptional() @IsString() riskClass?: string
    @IsOptional() @IsString() materialCategoryId?: string
    @IsOptional() @IsString() materialTypeId?: string
    @IsOptional() @IsInt() @Min(1) frequencyDays?: number
    @IsOptional() @IsNumber() varianceQtyTolerance?: number
    @IsOptional() @IsNumber() variancePctTolerance?: number
    @IsOptional() @IsNumber() varianceValueTolerance?: number
    @IsOptional() @IsNumber() minUnitValue?: number
    @IsOptional() @IsNumber() maxUnitValue?: number
    @IsOptional() @IsBoolean() blindCountRequired?: boolean
    @IsOptional() @IsInt() priority?: number
    @IsOptional() @IsBoolean() isActive?: boolean
}

export class UpdateCountPolicyDto extends CreateCountPolicyDto {}

export class CountPolicyQueryDto {
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number
    @IsOptional() @IsString() companyId?: string
    @IsOptional() @IsString() warehouseId?: string
    @IsOptional() @IsIn(['A', 'B', 'C']) abcClass?: string
    @IsOptional() @IsBoolean() @Type(() => Boolean) isActive?: boolean
}

export class CreateCountPlanDto {
    @IsString() @IsNotEmpty() companyId!: string
    @IsString() @IsNotEmpty() warehouseId!: string
    @IsOptional() @IsString() policyId?: string
    @IsIn([...COUNT_TYPES]) countType!: string
    @IsOptional() @IsDateString() dueDate?: string
    @IsOptional() @IsDateString() plannedStart?: string
    @IsOptional() @IsDateString() plannedEnd?: string
    @IsOptional() @IsString() notes?: string
    @IsOptional() @IsString() createdBy?: string
}

export class CountPlanQueryDto {
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number
    @IsOptional() @IsString() companyId?: string
    @IsOptional() @IsString() warehouseId?: string
    @IsOptional() @IsIn([...COUNT_PLAN_STATUSES]) status?: string
    @IsOptional() @IsIn([...COUNT_TYPES]) countType?: string
    @IsOptional() @IsString() search?: string
}

export class GenerateCountPlanDto {
    @IsOptional() @IsBoolean() includeZeroBalances?: boolean
    @IsOptional() @IsArray() @IsString({ each: true }) storageBinIds?: string[]
    @IsOptional() @IsString() assignedCounter?: string
}

export class CreateCountSessionDto {
    @IsString() @IsNotEmpty() planId!: string
    @IsOptional() @IsBoolean() blindMode?: boolean
}

export class CountSessionQueryDto {
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number
    @IsOptional() @IsString() companyId?: string
    @IsOptional() @IsString() warehouseId?: string
    @IsOptional() @IsString() planId?: string
    @IsOptional() @IsString() status?: string
    @IsOptional() @IsBoolean() @Type(() => Boolean) blind?: boolean
}

export class CountTaskQueryDto {
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number
    @IsOptional() @IsString() sessionId?: string
    @IsOptional() @IsString() status?: string
    @IsOptional() @IsString() assignedCounter?: string
    @IsOptional() @IsBoolean() @Type(() => Boolean) blind?: boolean
}

export class CreateCountEntryDto {
    @IsString() @IsNotEmpty() taskId!: string
    @IsNumber() @Min(0) countQuantity!: number
    @IsOptional() @IsString() uomId?: string
    @IsOptional() @IsString() counterId?: string
    @IsOptional() @IsString() notes?: string
    @IsOptional() @IsString() idempotencyKey?: string
    @IsOptional() attachmentMeta?: Record<string, unknown>
}

export class CreateRecountDto {
    @IsString() @IsNotEmpty() varianceId!: string
    @IsOptional() @IsString() reason?: string
    @IsOptional() @IsString() requestedBy?: string
}

export class CreateAdjustmentRequestDto {
    @IsString() @IsNotEmpty() sessionId!: string
    @IsOptional() @IsString() submittedBy?: string
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AdjustmentRequestLineDto)
    lines?: AdjustmentRequestLineDto[]
}

export class AdjustmentRequestLineDto {
    @IsString() @IsNotEmpty() taskId!: string
    @IsOptional() @IsString() varianceId?: string
    @IsNumber() quantity!: number
    @IsOptional() @IsString() reasonCodeId?: string
    @IsOptional() @IsString() rootCause?: string
    @IsOptional() @IsString() correctiveAction?: string
    @IsOptional() @IsString() managerRemarks?: string
}

export class ApproveAdjustmentRequestDto {
    @IsOptional() @IsString() approvedBy?: string
}

export class RejectAdjustmentRequestDto {
    @IsOptional() @IsString() rejectedBy?: string
    @IsOptional() @IsString() rejectionReason?: string
}

export class AdjustmentRequestQueryDto {
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number
    @IsOptional() @IsString() sessionId?: string
    @IsOptional() @IsString() companyId?: string
    @IsOptional() @IsString() warehouseId?: string
    @IsOptional() @IsIn([...ADJUSTMENT_REQUEST_STATUSES]) status?: string
}
