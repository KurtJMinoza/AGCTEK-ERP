import { IsString, IsOptional, IsNotEmpty, IsNumber, IsDateString } from 'class-validator'
import { Type } from 'class-transformer'

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
