import {
    IsDateString,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Min,
} from 'class-validator'
import { MM_DEMAND_MODULES, MM_DEMAND_STATUSES } from '../mm-demand.types'

export class MmDemandQueryDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsOptional()
    @IsString()
    materialIds?: string

    @IsOptional()
    @IsString()
    warehouseIds?: string

    @IsDateString()
    asOf!: string

    @IsDateString()
    horizonEnd!: string
}

export class SyncDemandLineDto {
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
    requiredDate!: string

    @IsNumber()
    @Min(0)
    quantity!: number

    @IsString()
    @IsNotEmpty()
    uomId!: string

    @IsOptional()
    @IsInt()
    @Min(1)
    priority?: number

    @IsOptional()
    @IsIn(MM_DEMAND_STATUSES as unknown as string[])
    status?: (typeof MM_DEMAND_STATUSES)[number]

    @IsOptional()
    @IsString()
    remarks?: string

    @IsOptional()
    @IsString()
    createdBy?: string
}

export class SyncDemandBatchDto {
    @IsNotEmpty()
    lines!: SyncDemandLineDto[]
}

export class CancelDemandBySourceDto {
    @IsString()
    @IsNotEmpty()
    sourceModule!: string

    @IsString()
    @IsNotEmpty()
    sourceDocumentType!: string

    @IsString()
    @IsNotEmpty()
    sourceDocumentId!: string
}

export const ALLOWED_SYNC_MODULES = [
    MM_DEMAND_MODULES.MAINTENANCE,
    MM_DEMAND_MODULES.PROJECTS,
    MM_DEMAND_MODULES.MM,
] as const
