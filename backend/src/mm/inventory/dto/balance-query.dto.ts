import { IsOptional, IsString, IsInt, Min } from 'class-validator'

export class BalanceQueryDto {
    @IsOptional()
    @IsString()
    materialId?: string

    @IsOptional()
    @IsString()
    warehouseId?: string

    @IsOptional()
    @IsString()
    companyId?: string

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

    /** Free-text filter over material code, material name and SKU. */
    @IsOptional()
    @IsString()
    search?: string

    @IsOptional()
    @IsInt()
    @Min(1)
    page?: number

    @IsOptional()
    @IsInt()
    @Min(1)
    limit?: number
}
