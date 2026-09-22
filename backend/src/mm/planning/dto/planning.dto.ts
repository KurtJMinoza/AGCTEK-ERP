import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsNumber,
    IsInt,
    IsBoolean,
    IsIn,
    IsDateString,
    Min,
    MaxLength,
} from 'class-validator'
import { Type } from 'class-transformer'

/** Canonical demand sources + legacy aliases accepted on write/filter. */
export const PLANNING_DEMAND_SOURCES = [
    'SALES',
    'PRODUCTION',
    'MAINTENANCE',
    'PROJECTS',
    'MANUAL_INTERNAL',
    'FORECAST',
    'IMPORTED',
    // legacy
    'MANUAL',
    'SALES_ORDER',
    'OTHER',
] as const

export class CreateReorderRuleDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsString()
    @IsNotEmpty()
    materialId!: string

    @IsOptional()
    @IsString()
    warehouseId?: string

    @IsOptional()
    @IsString()
    plantId?: string

    @IsOptional()
    @IsDateString()
    effectiveFrom?: string

    @IsOptional()
    @IsDateString()
    effectiveTo?: string

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    planningHorizonDays?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    reorderPoint?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    safetyStock?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    reorderQuantity?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    minimumOrderQuantity?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    minStock?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    maxStock?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    lotSize?: number

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    leadTimeDays?: number

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    reviewPeriodDays?: number

    @IsOptional()
    @IsIn(['REORDER_POINT', 'TIME_PHASED', 'MIN_MAX'])
    planningStrategy?: string

    @IsOptional()
    @IsIn(['BUY', 'MAKE', 'BOTH'])
    procurementType?: string

    @IsOptional()
    @IsBoolean()
    isActive?: boolean
}

export class UpdateReorderRuleDto {
    @IsOptional()
    @IsString()
    plantId?: string

    @IsOptional()
    @IsDateString()
    effectiveFrom?: string

    @IsOptional()
    @IsDateString()
    effectiveTo?: string

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    planningHorizonDays?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    reorderPoint?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    safetyStock?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    reorderQuantity?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    minimumOrderQuantity?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    minStock?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    maxStock?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    lotSize?: number

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    leadTimeDays?: number

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    reviewPeriodDays?: number

    @IsOptional()
    @IsIn(['REORDER_POINT', 'TIME_PHASED', 'MIN_MAX'])
    planningStrategy?: string

    @IsOptional()
    @IsIn(['BUY', 'MAKE', 'BOTH'])
    procurementType?: string

    @IsOptional()
    @IsBoolean()
    isActive?: boolean
}

export class ReorderRuleQueryDto {
    @IsOptional()
    @IsString()
    companyId?: string

    @IsOptional()
    @IsString()
    materialId?: string

    @IsOptional()
    @IsString()
    warehouseId?: string

    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    isActive?: boolean

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
}

export class CreatePlanningDemandDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsString()
    @IsNotEmpty()
    materialId!: string

    @IsOptional()
    @IsString()
    warehouseId?: string

    @IsOptional()
    @IsString()
    plantId?: string

    @IsDateString()
    demandDate!: string

    @Type(() => Number)
    @IsNumber()
    @Min(0.0001)
    quantity!: number

    @IsOptional()
    @IsString()
    uomId?: string

    @IsOptional()
    @IsString()
    sourceModule?: string

    @IsOptional()
    @IsString()
    sourceDocumentType?: string

    @IsOptional()
    @IsIn([...PLANNING_DEMAND_SOURCES])
    sourceType?: string

    @IsOptional()
    @IsString()
    sourceDocumentId?: string

    @IsOptional()
    @IsString()
    sourceDocumentLineId?: string

    @IsOptional()
    @IsInt()
    @Min(1)
    priority?: number

    @IsOptional()
    @IsIn(['OPEN', 'CANCELLED', 'FULFILLED'])
    status?: string

    @IsOptional()
    @IsString()
    @MaxLength(500)
    remarks?: string

    @IsOptional()
    @IsString()
    createdBy?: string
}

export class UpdatePlanningDemandDto {
    @IsOptional()
    @IsString()
    warehouseId?: string

    @IsOptional()
    @IsString()
    plantId?: string

    @IsOptional()
    @IsDateString()
    demandDate?: string

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0.0001)
    quantity?: number

    @IsOptional()
    @IsString()
    uomId?: string

    @IsOptional()
    @IsString()
    sourceModule?: string

    @IsOptional()
    @IsString()
    sourceDocumentType?: string

    @IsOptional()
    @IsIn([...PLANNING_DEMAND_SOURCES])
    sourceType?: string

    @IsOptional()
    @IsString()
    sourceDocumentId?: string

    @IsOptional()
    @IsString()
    sourceDocumentLineId?: string

    @IsOptional()
    @IsInt()
    @Min(1)
    priority?: number

    @IsOptional()
    @IsIn(['OPEN', 'CANCELLED', 'FULFILLED'])
    status?: string

    @IsOptional()
    @IsString()
    @MaxLength(500)
    remarks?: string
}

export class PlanningDemandQueryDto {
    @IsOptional()
    @IsString()
    companyId?: string

    @IsOptional()
    @IsString()
    materialId?: string

    @IsOptional()
    @IsString()
    warehouseId?: string

    @IsOptional()
    @IsString()
    plantId?: string

    @IsOptional()
    @IsIn([...PLANNING_DEMAND_SOURCES])
    sourceType?: string

    @IsOptional()
    @IsIn(['OPEN', 'CANCELLED'])
    status?: string

    @IsOptional()
    @IsDateString()
    fromDate?: string

    @IsOptional()
    @IsDateString()
    toDate?: string

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
}

export class CreateMrpRunDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsOptional()
    @IsString()
    plantId?: string

    @IsOptional()
    @IsString()
    warehouseId?: string

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    planningHorizonDays?: number

    @IsOptional()
    @IsBoolean()
    includeOpenReceipts?: boolean

    @IsOptional()
    @IsBoolean()
    autoCreatePurchaseRequisitions?: boolean

    @IsOptional()
    @IsString()
    createdBy?: string

    @IsOptional()
    @IsBoolean()
    executeImmediately?: boolean

    /** Optional dedup key — returns existing QUEUED/RUNNING run within 5 min for same scope */
    @IsOptional()
    @IsString()
    runKey?: string
}

export class MrpRunQueryDto {
    @IsOptional()
    @IsString()
    companyId?: string

    @IsOptional()
    @IsString()
    plantId?: string

    @IsOptional()
    @IsString()
    warehouseId?: string

    @IsOptional()
    @IsIn(['QUEUED', 'PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'])
    status?: string

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
}

export class MaterialRequirementQueryDto {
    @IsOptional()
    @IsString()
    mrpRunId?: string

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
    @Type(() => Boolean)
    @IsBoolean()
    shortage?: boolean

    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    belowReorderPoint?: boolean

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
}

export class BomExplosionTraceQueryDto {
    @IsOptional()
    @IsString()
    mrpRunId?: string

    @IsOptional()
    @IsString()
    companyId?: string

    @IsOptional()
    @IsString()
    warehouseId?: string

    @IsOptional()
    @IsString()
    parentMaterialId?: string

    @IsOptional()
    @IsString()
    componentMaterialId?: string

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
}

export class SuggestionQueryDto {
    @IsOptional()
    @IsString()
    companyId?: string

    @IsOptional()
    @IsString()
    mrpRunId?: string

    @IsOptional()
    @IsString()
    warehouseId?: string

    @IsOptional()
    @IsIn(['OPEN', 'CONVERTED', 'DISMISSED'])
    status?: string

    @IsOptional()
    @IsIn(['PR_RECOMMENDATION', 'PLANNED_REPLENISHMENT'])
    suggestionType?: string

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
}

export class ConvertSuggestionDto {
    @IsString()
    @IsNotEmpty()
    requesterId!: string

    @IsOptional()
    @IsString()
    purpose?: string

    @IsOptional()
    @IsString()
    createdBy?: string

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    estimatedUnitPrice?: number
}

export class PlanningDashboardQueryDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsOptional()
    @IsString()
    warehouseId?: string
}

export class ProjectedStockQueryDto {
    @IsOptional()
    @IsString()
    companyId?: string

    @IsOptional()
    @IsString()
    mrpRunId?: string

    @IsOptional()
    @IsString()
    warehouseId?: string

    @IsOptional()
    @IsString()
    materialId?: string

    @IsOptional()
    @IsDateString()
    dateFrom?: string

    @IsOptional()
    @IsDateString()
    dateTo?: string

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
}

/** Phase 2D structured MRP explainability — persisted on requirements and suggestions. */
export {
    MRP_EXPLANATION_VERSION,
    type MrpDemandLineExplanation,
    type MrpRecommendationExplanation,
} from '../mrp-explanation.types'
