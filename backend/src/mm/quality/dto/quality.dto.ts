import {
    IsString, IsNotEmpty, IsOptional, IsNumber, Min, IsBoolean,
    IsArray, ValidateNested, IsDateString, IsIn,
} from 'class-validator'
import { Type } from 'class-transformer'
import {
    CAPA_STATUSES,
    HOLD_TYPES,
    INSPECTION_RULE_ACTIONS,
    NC_STATUSES,
    PURCHASE_TYPES,
    RECEIPT_TYPES,
    SAMPLING_TYPES,
    USAGE_DECISION_CODES,
} from '../quality.constants'

export class QualityQueryDto {
    @IsOptional() @IsString() status?: string
    @IsOptional() @IsString() companyId?: string
    @IsOptional() @IsString() supplierId?: string
    @IsOptional() @IsString() materialId?: string
    @IsOptional() @IsString() warehouseId?: string
    @IsOptional() @IsString() search?: string
    @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number
    @IsOptional() @Type(() => Number) @IsNumber() @Min(1) pageSize?: number
}

export class PlanLineDto {
    @IsOptional() @Type(() => Number) lineNumber?: number
    @IsString() @IsNotEmpty() name!: string
    @IsOptional() @IsString() valueType?: string
    @IsOptional() @Type(() => Number) toleranceMin?: number
    @IsOptional() @Type(() => Number) toleranceMax?: number
    @IsOptional() @IsBoolean() required?: boolean
    @IsOptional() @IsString() unit?: string
    @IsOptional() @IsString() targetValue?: string
    @IsOptional() @IsString() categoryLabel?: string
    @IsOptional() allowedValues?: string[]
}

export class CreateInspectionPlanDto {
    @IsString() @IsNotEmpty() planCode!: string
    @IsString() @IsNotEmpty() name!: string
    @IsString() @IsNotEmpty() companyId!: string
    @IsOptional() @IsString() materialCategoryId?: string
    @IsOptional() @IsString() materialId?: string
    @IsOptional() @IsString() supplierId?: string
    @IsOptional() @IsString() plantId?: string
    @IsOptional() @IsString() inspectionType?: string
    @IsOptional() @IsIn([...SAMPLING_TYPES]) samplingType?: string
    @IsOptional() @Type(() => Number) sampleSize?: number
    @IsOptional() @Type(() => Number) samplePercent?: number
    @IsOptional() @IsBoolean() allowFullInspection?: boolean
    @IsOptional() @IsDateString() effectiveFrom?: string
    @IsOptional() @IsDateString() effectiveTo?: string
    @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PlanLineDto)
    lines?: PlanLineDto[]
}

export class UpdateInspectionPlanDto {
    @IsOptional() @IsString() name?: string
    @IsOptional() @IsString() status?: string
    @IsOptional() @IsIn([...SAMPLING_TYPES]) samplingType?: string
    @IsOptional() @Type(() => Number) sampleSize?: number
    @IsOptional() @Type(() => Number) samplePercent?: number
    @IsOptional() @IsBoolean() allowFullInspection?: boolean
    @IsOptional() @IsDateString() effectiveFrom?: string
    @IsOptional() @IsDateString() effectiveTo?: string
    @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PlanLineDto)
    lines?: PlanLineDto[]
}

export class CreateDefectCodeDto {
    @IsString() @IsNotEmpty() companyId!: string
    @IsString() @IsNotEmpty() code!: string
    @IsString() @IsNotEmpty() description!: string
    @IsOptional() @IsString() category?: string
    @IsOptional() @IsString() severityDefault?: string
    @IsOptional() @IsBoolean() active?: boolean
}

export class StartInspectionLotDto {
    @IsOptional() @IsString() inspector?: string
}

export class CompleteInspectionLotDto {
    @IsOptional() @IsString() completedBy?: string
    @IsOptional() @IsString() remarks?: string
}

export class CreateNonconformanceDto {
    @IsString() @IsNotEmpty() companyId!: string
    @IsOptional() @IsString() inspectionLotId?: string
    @IsOptional() @IsString() inspectionDefectId?: string
    @IsOptional() @IsString() cause?: string
    @IsOptional() @IsString() severity?: string
    @IsOptional() @Type(() => Number) @Min(0) affectedQuantity?: number
    @IsOptional() @IsString() responsibleParty?: string
    @IsOptional() @IsString() notes?: string
    @IsOptional() @IsString() createdBy?: string
}

export class ResolveNonconformanceDto {
    @IsOptional() @IsString() resolvedBy?: string
    @IsOptional() @IsString() notes?: string
    @IsOptional() @IsIn([...NC_STATUSES]) status?: string
}

export class CreateCorrectiveActionDto {
    @IsOptional() @IsString() problem?: string
    @IsOptional() @IsString() rootCause?: string
    @IsOptional() @IsString() containment?: string
    @IsOptional() @IsString() correctiveAction?: string
    @IsOptional() @IsString() preventiveAction?: string
    @IsOptional() @IsString() owner?: string
    @IsOptional() @IsDateString() dueDate?: string
    @IsOptional() @IsString() notes?: string
}

export class UpdateCorrectiveActionDto {
    @IsOptional() @IsString() problem?: string
    @IsOptional() @IsString() rootCause?: string
    @IsOptional() @IsString() containment?: string
    @IsOptional() @IsString() correctiveAction?: string
    @IsOptional() @IsString() preventiveAction?: string
    @IsOptional() @IsString() owner?: string
    @IsOptional() @IsDateString() dueDate?: string
    @IsOptional() @IsString() resolution?: string
    @IsOptional() @IsString() notes?: string
}

export class TransitionCorrectiveActionDto {
    @IsIn([...CAPA_STATUSES]) targetStatus!: string
    @IsOptional() @IsString() resolution?: string
    @IsOptional() @IsString() verifiedBy?: string
    @IsOptional() @IsString() closedBy?: string
    @IsOptional() @IsString() notes?: string
}

export class CapaQueryDto {
    @IsOptional() @IsString() companyId?: string
    @IsOptional() @IsString() status?: string
    @IsOptional() @IsString() search?: string
    @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number
    @IsOptional() @Type(() => Number) @IsNumber() @Min(1) pageSize?: number
}

export class CreateQualityHoldDtoExtended {
    @IsString() @IsNotEmpty() companyId!: string
    @IsString() @IsNotEmpty() reason!: string
    @IsOptional() @IsString() inspectionLotId?: string
    @IsOptional() @IsString() goodsReceiptLineId?: string
    @IsOptional() @IsString() materialId?: string
    @IsOptional() @IsString() warehouseId?: string
    @IsOptional() @IsIn([...HOLD_TYPES]) holdType?: string
    @IsOptional() @IsString() targetStockStatus?: string
    @IsOptional() @IsString() heldBy?: string
}

export class UsageDecisionExtendedDto {
    @IsIn([...USAGE_DECISION_CODES]) decisionCode!: string
    @IsNumber() @Min(0.000001) quantity!: number
    @IsOptional() @IsString() reason?: string
    @IsOptional() @IsString() deviationReason?: string
    @IsOptional() @IsString() decidedBy?: string
    @IsOptional() @IsString() notes?: string
    @IsOptional() @IsString() idempotencyKey?: string
}

export class CreateInspectionRuleDto {
    @IsString() @IsNotEmpty() companyId!: string
    @IsString() @IsNotEmpty() ruleCode!: string
    @IsString() @IsNotEmpty() name!: string
    @IsOptional() @Type(() => Number) @IsNumber() @Min(0) priority?: number
    @IsOptional() @IsBoolean() active?: boolean
    @IsOptional() @IsDateString() effectiveFrom?: string
    @IsOptional() @IsDateString() effectiveTo?: string
    @IsOptional() @IsString() materialId?: string
    @IsOptional() @IsString() materialCategoryId?: string
    @IsOptional() @IsString() supplierId?: string
    @IsOptional() @IsString() supplierCategoryId?: string
    @IsOptional() @IsString() plantId?: string
    @IsOptional() @IsString() warehouseId?: string
    @IsOptional() @IsIn([...PURCHASE_TYPES]) purchaseType?: string
    @IsOptional() @IsIn([...RECEIPT_TYPES]) receiptType?: string
    @IsIn([...INSPECTION_RULE_ACTIONS]) action!: string
}

export class UpdateInspectionRuleDto {
    @IsOptional() @IsString() name?: string
    @IsOptional() @Type(() => Number) @IsNumber() @Min(0) priority?: number
    @IsOptional() @IsBoolean() active?: boolean
    @IsOptional() @IsDateString() effectiveFrom?: string
    @IsOptional() @IsDateString() effectiveTo?: string
    @IsOptional() @IsString() materialId?: string
    @IsOptional() @IsString() materialCategoryId?: string
    @IsOptional() @IsString() supplierId?: string
    @IsOptional() @IsString() supplierCategoryId?: string
    @IsOptional() @IsString() plantId?: string
    @IsOptional() @IsString() warehouseId?: string
    @IsOptional() @IsIn([...PURCHASE_TYPES]) purchaseType?: string
    @IsOptional() @IsIn([...RECEIPT_TYPES]) receiptType?: string
    @IsOptional() @IsIn([...INSPECTION_RULE_ACTIONS]) action?: string
}

export class UploadQualityAttachmentDto {
    @IsString() @IsNotEmpty() companyId!: string
    @IsString() @IsNotEmpty() entityType!: string
    @IsString() @IsNotEmpty() entityId!: string
    @IsString() @IsNotEmpty() fileName!: string
    @IsString() @IsNotEmpty() contentBase64!: string
    @IsOptional() @IsString() mimeType?: string
    @IsOptional() @IsString() uploadedBy?: string
}
