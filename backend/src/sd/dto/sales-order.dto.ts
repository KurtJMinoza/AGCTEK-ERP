import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsArray,
    ValidateNested,
    IsNumber,
    Min,
} from 'class-validator'
import { Type } from 'class-transformer'

export class CreateSalesOrderLineDto {
    @IsString()
    @IsNotEmpty()
    materialId!: string

    @IsNumber()
    @Min(0.000001)
    quantity!: number
}

export class CreateSalesOrderDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsString()
    @IsNotEmpty()
    warehouseId!: string

    @IsString()
    @IsNotEmpty()
    customerId!: string

    @IsOptional()
    @IsString()
    idempotencyKey?: string

    @IsOptional()
    @IsString()
    createdBy?: string

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateSalesOrderLineDto)
    lines!: CreateSalesOrderLineDto[]
}

export class ChangeSalesOrderLineQtyDto {
    @IsNumber()
    @Min(0)
    quantity!: number
}

export class IssueSalesOrderDto {
    @IsOptional()
    @IsString()
    storageBinId?: string

    @IsOptional()
    @IsString()
    createdBy?: string
}
