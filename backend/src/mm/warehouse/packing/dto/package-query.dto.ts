import { IsOptional, IsString, IsInt, Min, IsIn } from 'class-validator'

export class PackageQueryDto {
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
    warehouseId?: string

    @IsOptional()
    @IsIn(['OPEN', 'VERIFIED', 'SEALED', 'READY_FOR_DISPATCH', 'DISPATCHED', 'CANCELLED'])
    status?: string

    @IsOptional()
    @IsString()
    orderNumber?: string

    @IsOptional()
    @IsString()
    search?: string

    @IsOptional()
    @IsIn(['packageNumber', 'status', 'createdAt'])
    sortBy?: string = 'createdAt'

    @IsOptional()
    @IsIn(['asc', 'desc'])
    sortOrder?: 'asc' | 'desc' = 'desc'
}
