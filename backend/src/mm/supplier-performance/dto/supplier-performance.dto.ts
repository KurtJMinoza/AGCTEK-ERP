import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsNumber,
    IsInt,
    IsBoolean,
    IsDateString,
    IsIn,
    Min,
    Max,
} from 'class-validator'
import { Type } from 'class-transformer'

export class UpsertWeightConfigDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @Type(() => Number)
    @IsInt()
    @Min(0)
    @Max(100)
    deliveryWeight!: number

    @Type(() => Number)
    @IsInt()
    @Min(0)
    @Max(100)
    qualityWeight!: number

    @Type(() => Number)
    @IsInt()
    @Min(0)
    @Max(100)
    priceWeight!: number

    @Type(() => Number)
    @IsInt()
    @Min(0)
    @Max(100)
    serviceWeight!: number

    @Type(() => Number)
    @IsInt()
    @Min(0)
    @Max(100)
    complianceWeight!: number
}

export class UpsertAlertConfigDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @Type(() => Number)
    @IsNumber()
    @Min(0)
    @Max(100)
    scoreThreshold!: number

    @IsOptional()
    @IsBoolean()
    isActive?: boolean
}

export class RunEvaluationDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsDateString()
    periodStart!: string

    @IsDateString()
    periodEnd!: string

    @IsOptional()
    @IsString()
    supplierId?: string
}

export class EvaluationQueryDto {
    @IsOptional()
    @IsString()
    companyId?: string

    @IsOptional()
    @IsString()
    supplierId?: string

    @IsOptional()
    @IsDateString()
    periodStart?: string

    @IsOptional()
    @IsDateString()
    periodEnd?: string

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

export class DashboardQueryDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsOptional()
    @IsDateString()
    periodStart?: string

    @IsOptional()
    @IsDateString()
    periodEnd?: string
}

export class TrendsQueryDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsString()
    @IsNotEmpty()
    supplierId!: string

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(36)
    periods?: number
}

export class AlertQueryDto {
    @IsOptional()
    @IsString()
    companyId?: string

    @IsOptional()
    @IsString()
    supplierId?: string

    @IsOptional()
    @IsIn(['OPEN', 'ACKNOWLEDGED', 'DISMISSED'])
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

export class CompareQueryDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    /** Comma-separated supplier ids */
    @IsString()
    @IsNotEmpty()
    supplierIds!: string

    @IsOptional()
    @IsDateString()
    periodStart?: string

    @IsOptional()
    @IsDateString()
    periodEnd?: string
}

export class SupplierDetailQueryDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number
}

export class CreateManualAssessmentDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsString()
    @IsNotEmpty()
    supplierId!: string

    @IsString()
    @IsNotEmpty()
    assessedBy!: string

    @Type(() => Number)
    @IsNumber()
    @Min(0)
    @Max(100)
    overallScore!: number

    @IsOptional()
    @IsDateString()
    assessmentDate?: string

    @IsOptional()
    @IsDateString()
    periodStart?: string

    @IsOptional()
    @IsDateString()
    periodEnd?: string

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    @Max(100)
    deliveryScore?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    @Max(100)
    qualityScore?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    @Max(100)
    priceScore?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    @Max(100)
    serviceScore?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    @Max(100)
    complianceScore?: number

    @IsOptional()
    @IsString()
    notes?: string

    @IsOptional()
    @IsIn(['DRAFT', 'SUBMITTED', 'APPROVED'])
    status?: string
}

export class ManualAssessmentQueryDto {
    @IsOptional()
    @IsString()
    companyId?: string

    @IsOptional()
    @IsString()
    supplierId?: string

    @IsOptional()
    @IsIn(['DRAFT', 'SUBMITTED', 'APPROVED', 'CANCELLED'])
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
