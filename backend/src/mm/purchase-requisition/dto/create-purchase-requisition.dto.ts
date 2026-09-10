import { Type } from 'class-transformer'
import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsInt,
    IsNumber,
    Min,
    IsDateString,
    ValidateNested,
    ArrayMinSize,
} from 'class-validator'

export class CreatePrLineDto {
    @IsString()
    @IsNotEmpty()
    materialId!: string

    @IsOptional()
    @IsString()
    description?: string

    @IsNumber()
    @Min(0.0001)
    requestedQuantity!: number

    @IsString()
    @IsNotEmpty()
    uomId!: string

    @IsNumber()
    @Min(0)
    estimatedUnitPrice!: number

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

export class CreatePurchaseRequisitionDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

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

    @IsString()
    @IsNotEmpty()
    requesterId!: string

    @IsDateString()
    requiredDate!: string

    @IsString()
    @IsNotEmpty()
    purpose!: string

    @IsOptional()
    @IsString()
    createdBy?: string

    @IsOptional()
    @IsString()
    sourceMrpRunId?: string

    @ValidateNested({ each: true })
    @Type(() => CreatePrLineDto)
    @ArrayMinSize(1)
    lines!: CreatePrLineDto[]
}