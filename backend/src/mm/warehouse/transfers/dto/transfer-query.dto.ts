import { IsOptional, IsString, IsInt, Min, IsIn } from 'class-validator'

export class TransferQueryDto {
    @IsOptional()
    @IsInt()
    @Min(1)
    page?: number = 1

    @IsOptional()
    @IsInt()
    @Min(1)
    limit?: number = 20

    @IsOptional()
    @IsIn(['DRAFT', 'APPROVED', 'PICKED', 'IN_TRANSIT', 'RECEIVED', 'COMPLETED', 'CANCELLED'])
    status?: string

    @IsOptional()
    @IsString()
    sourceWarehouseId?: string

    @IsOptional()
    @IsString()
    destinationWarehouseId?: string

    @IsOptional()
    @IsString()
    search?: string

    @IsOptional()
    @IsIn(['transferNumber', 'status', 'createdAt'])
    sortBy?: string = 'createdAt'

    @IsOptional()
    @IsIn(['asc', 'desc'])
    sortOrder?: 'asc' | 'desc' = 'desc'
}
