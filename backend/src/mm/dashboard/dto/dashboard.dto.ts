import { IsString, IsOptional, IsNotEmpty, IsNumber, IsDateString, IsBoolean } from 'class-validator'
import { Type, Transform } from 'class-transformer'

export class DashboardQueryDto {
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

    @IsOptional()
    @IsString()
    role?: string

    /** Comma-separated authority tags, e.g. mm.inventory,mm.procurement */
    @IsOptional()
    @IsString()
    authority?: string

    /** When false, skip heavy analytics summaries (KPIs + alerts only). */
    @IsOptional()
    @Transform(({ value }) => value === true || value === 'true' || value === '1')
    @IsBoolean()
    includeAnalytics?: boolean
}

export class DashboardRefreshDto {
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
}
