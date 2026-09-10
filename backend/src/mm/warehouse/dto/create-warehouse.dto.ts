import {
    IsString,
    IsNotEmpty,
    IsOptional,
    MaxLength,
    IsIn,
} from 'class-validator'

export class CreateWarehouseDto {
    @IsOptional()
    @IsString()
    @MaxLength(32)
    code?: string

    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    name!: string

    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsOptional()
    @IsString()
    plantId?: string

    @IsOptional()
    @IsString()
    branchId?: string

    @IsOptional()
    @IsString()
    managerId?: string

    @IsOptional()
    @IsString()
    @IsIn([
        'GENERAL',
        'DISTRIBUTION',
        'RECEIVING',
        'FULFILLMENT',
        'COLD_STORAGE',
        'RAW_MATERIAL',
        'FINISHED_GOODS',
    ])
    warehouseType?: string

    @IsOptional()
    @IsString()
    address?: string

    @IsOptional()
    @IsString()
    timezone?: string

    @IsOptional()
    @IsIn(['ACTIVE', 'INACTIVE'])
    status?: string

    @IsOptional()
    @IsString()
    defaultReceivingArea?: string

    @IsOptional()
    @IsString()
    defaultShippingArea?: string
}
