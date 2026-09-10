import { IsOptional, IsString, IsInt, Min, IsIn, IsBoolean } from 'class-validator'

export class MaterialQueryDto {
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
    materialTypeId?: string

    @IsOptional()
    @IsString()
    materialCategoryId?: string

    @IsOptional()
    @IsIn(['DRAFT', 'ACTIVE', 'INACTIVE', 'BLOCKED'])
    status?: string

    @IsOptional()
    @IsBoolean()
    batchManaged?: boolean

    @IsOptional()
    @IsBoolean()
    serialManaged?: boolean

    @IsOptional()
    @IsString()
    @IsIn([
        'materialCode',
        'materialName',
        'status',
        'createdAt',
        'updatedAt',
        'standardCost',
    ])
    sortBy?: string = 'createdAt'

    @IsOptional()
    @IsIn(['asc', 'desc'])
    sortOrder?: 'asc' | 'desc' = 'desc'
}
