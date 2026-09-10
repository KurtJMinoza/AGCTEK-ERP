import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, Min } from 'class-validator'

export class PurchaseRequisitionQueryDto {
    @IsOptional()
    @IsString()
    status?: string

    @IsOptional()
    @IsString()
    requesterId?: string

    @IsOptional()
    @IsString()
    departmentId?: string

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