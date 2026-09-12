import {
    IsString,
    IsOptional,
    IsNotEmpty,
    IsNumber,
    IsDateString,
    IsInt,
    Min,
} from 'class-validator'
import { Type } from 'class-transformer'

/** Shared filters for /mm/analytics/* — company required; warehouse/date/supplier optional. */
export class AnalyticsQueryDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsOptional()
    @IsString()
    warehouseId?: string

    @IsOptional()
    @IsString()
    branchId?: string

    @IsOptional()
    @IsString()
    materialCategoryId?: string

    @IsOptional()
    @IsString()
    supplierId?: string

    @IsOptional()
    @IsDateString()
    dateFrom?: string

    @IsOptional()
    @IsDateString()
    dateTo?: string

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    deadStockDays?: number

    @IsOptional()
    @IsString()
    agingBuckets?: string

    /** Near-expiry horizon in days (default 30). */
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    expiryDays?: number

    @IsOptional()
    @IsString()
    role?: string

    @IsOptional()
    @IsString()
    authority?: string

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
