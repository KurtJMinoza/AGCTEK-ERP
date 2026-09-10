import { IsOptional, IsString, IsInt, Min, IsIn } from 'class-validator'

export class PutawayQueryDto {
    @IsOptional()
    @IsInt()
    @Min(1)
    page?: number = 1

    @IsOptional()
    @IsInt()
    @Min(1)
    limit?: number = 20

    @IsOptional()
    @IsIn(['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
    status?: string

    @IsOptional()
    @IsString()
    warehouseId?: string

    @IsOptional()
    @IsString()
    assignedWorker?: string

    @IsOptional()
    @IsString()
    search?: string

    @IsOptional()
    @IsIn(['taskNumber', 'status', 'priority', 'createdAt'])
    sortBy?: string = 'createdAt'

    @IsOptional()
    @IsIn(['asc', 'desc'])
    sortOrder?: 'asc' | 'desc' = 'desc'
}
