import { IsOptional, IsString, IsInt, Min, IsIn } from 'class-validator'

export class PickWaveQueryDto {
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
    @IsIn(['DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
    status?: string

    @IsOptional()
    @IsIn(['waveNumber', 'status', 'createdAt'])
    sortBy?: string = 'createdAt'

    @IsOptional()
    @IsIn(['asc', 'desc'])
    sortOrder?: 'asc' | 'desc' = 'desc'
}
