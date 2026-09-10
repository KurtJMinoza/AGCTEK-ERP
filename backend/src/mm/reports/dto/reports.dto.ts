import {
    IsString,
    IsOptional,
    IsNotEmpty,
    IsNumber,
    IsDateString,
    IsInt,
    Min,
    Max,
    IsIn,
} from 'class-validator'
import { Type } from 'class-transformer'

export class ReportsQueryDto {
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
    @IsString()
    materialId?: string

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
    @IsString()
    stockStatus?: string

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
    @IsIn(['material', 'category', 'warehouse', 'bin', 'batch', 'serial', 'status'])
    groupBy?: string

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(200)
    limit?: number

    @IsOptional()
    @IsString()
    role?: string

    @IsOptional()
    @IsString()
    authority?: string
}
