import { Type } from 'class-transformer'
import {
    IsString,
    IsOptional,
    IsNotEmpty,
    IsNumber,
    Min,
    IsDateString,
    ValidateNested,
    IsArray,
} from 'class-validator'

export class UpdatePrLineDto {
    @IsOptional()
    @IsString()
    id?: string

    @IsOptional()
    @IsString()
    materialId?: string

    @IsOptional()
    @IsString()
    description?: string

    @IsOptional()
    @IsNumber()
    @Min(0.0001)
    requestedQuantity?: number

    @IsOptional()
    @IsString()
    uomId?: string

    @IsOptional()
    @IsNumber()
    @Min(0)
    estimatedUnitPrice?: number

    @IsOptional()
    @IsDateString()
    requiredDate?: string

    @IsOptional()
    @IsString()
    warehouseId?: string

    @IsOptional()
    @IsString()
    preferredSupplierId?: string

    @IsOptional()
    @IsString()
    remarks?: string
}

export class UpdatePurchaseRequisitionDto {
    @IsOptional()
    @IsString()
    businessUnitId?: string

    @IsOptional()
    @IsString()
    branchId?: string

    @IsOptional()
    @IsString()
    departmentId?: string

    @IsOptional()
    @IsString()
    costCenterId?: string

    @IsOptional()
    @IsString()
    projectId?: string

    @IsOptional()
    @IsString()
    requesterId?: string

    @IsOptional()
    @IsDateString()
    requiredDate?: string

    @IsOptional()
    @IsString()
    purpose?: string

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => UpdatePrLineDto)
    lines?: UpdatePrLineDto[]
}