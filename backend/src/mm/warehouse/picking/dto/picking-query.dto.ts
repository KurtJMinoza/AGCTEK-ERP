import { IsOptional, IsString, IsInt, Min, IsIn } from 'class-validator'

export class PickingQueryDto {
    @IsOptional()
    @IsInt()
    @Min(1)
    page?: number = 1

    @IsOptional()
    @IsInt()
    @Min(1)
    limit?: number = 20

    @IsOptional()
    @IsIn(['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'PARTIALLY_PICKED', 'CANCELLED'])
    status?: string

    @IsOptional()
    @IsString()
    waveId?: string

    @IsOptional()
    @IsString()
    warehouseId?: string

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
