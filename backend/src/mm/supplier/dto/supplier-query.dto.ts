import { IsOptional, IsString, IsInt, Min } from 'class-validator'
import { Type } from 'class-transformer'

export class SupplierQueryDto {
    @IsOptional()
    @IsString()
    status?: string

    @IsOptional()
    @IsString()
    categoryId?: string

    @IsOptional()
    @IsString()
    search?: string

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    pageSize?: number = 20
}
