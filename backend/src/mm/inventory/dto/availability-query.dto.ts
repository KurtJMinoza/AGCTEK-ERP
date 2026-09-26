import { IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class AvailabilityQueryDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsString()
    @IsNotEmpty()
    warehouseId!: string

    @IsString()
    @IsNotEmpty()
    materialId!: string

    @IsOptional()
    @IsString()
    storageBinId?: string

    @IsOptional()
    @IsString()
    batchId?: string

    @IsOptional()
    @IsString()
    serialNumberId?: string
}
