import { IsOptional, IsString, IsInt, Min, IsIn } from 'class-validator'

export class WarehouseQueryDto {
    @IsOptional()
    @IsInt()
    @Min(1)
    page?: number = 1

    @IsOptional()
    @IsInt()
    @Min(1)
    limit?: number = 20

    @IsOptional()
    @IsString()
    search?: string

    @IsOptional()
    @IsString()
    companyId?: string

    @IsOptional()
    @IsIn(['ACTIVE', 'INACTIVE'])
    status?: string

    @IsOptional()
    @IsString()
    @IsIn(['code', 'name', 'status', 'createdAt', 'updatedAt'])
    sortBy?: string = 'createdAt'

    @IsOptional()
    @IsIn(['asc', 'desc'])
    sortOrder?: 'asc' | 'desc' = 'desc'
}
