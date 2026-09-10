import { IsOptional, IsString, IsInt, Min, IsNumber, IsDateString } from 'class-validator'
import { Type } from 'class-transformer'

export class ProcurementHistoryQueryDto {
    @IsOptional()
    @IsString()
    companyId?: string

    @IsOptional()
    @IsString()
    supplierId?: string

    @IsOptional()
    @IsString()
    materialId?: string

    @IsOptional()
    @IsString()
    buyerId?: string

    @IsOptional()
    @IsString()
    poNumber?: string

    @IsOptional()
    @IsDateString()
    dateFrom?: string

    @IsOptional()
    @IsDateString()
    dateTo?: string

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    minPrice?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    maxPrice?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    minQty?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    maxQty?: number

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    pageSize?: number
}
