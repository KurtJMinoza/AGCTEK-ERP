import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsDateString,
    IsArray,
    ValidateNested,
    IsNumber,
    Min,
} from 'class-validator'
import { Type } from 'class-transformer'

class WarehouseTransferOrderLineDto {
    @IsString()
    @IsNotEmpty()
    materialId!: string

    @IsNumber()
    @Min(0.000001)
    quantity!: number

    @IsString()
    @IsNotEmpty()
    uomId!: string

    @IsOptional()
    @IsString()
    sourceBinId?: string

    @IsOptional()
    @IsString()
    destinationBinId?: string

    @IsOptional()
    @IsString()
    batchId?: string

    @IsOptional()
    @IsString()
    serialNumberId?: string
}

export class CreateWarehouseTransferOrderDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsString()
    @IsNotEmpty()
    sourceWarehouseId!: string

    @IsString()
    @IsNotEmpty()
    destinationWarehouseId!: string

    @IsDateString()
    postingDate!: string

    @IsOptional()
    @IsString()
    requestedBy?: string

    @IsOptional()
    @IsString()
    notes?: string

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => WarehouseTransferOrderLineDto)
    lines!: WarehouseTransferOrderLineDto[]
}
