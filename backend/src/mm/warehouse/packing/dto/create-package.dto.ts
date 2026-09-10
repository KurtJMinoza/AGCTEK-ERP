import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsNumber,
    IsArray,
    ValidateNested,
    Min,
} from 'class-validator'
import { Type } from 'class-transformer'

export class CreatePackageItemDto {
    @IsString()
    @IsNotEmpty()
    materialId!: string

    @IsNumber()
    @Min(0.000001)
    expectedQty!: number

    @IsOptional()
    @IsString()
    batchId?: string

    @IsOptional()
    @IsString()
    serialId?: string
}

export class CreatePackageDto {
    @IsString()
    @IsNotEmpty()
    warehouseId!: string

    @IsOptional()
    @IsString()
    orderNumber?: string

    @IsOptional()
    @IsString()
    pickingTaskId?: string

    @IsOptional()
    @IsString()
    reservationId?: string

    @IsOptional()
    @IsString()
    packageType?: string

    @IsOptional()
    @IsNumber()
    weight?: number

    @IsOptional()
    @IsNumber()
    length?: number

    @IsOptional()
    @IsNumber()
    width?: number

    @IsOptional()
    @IsNumber()
    height?: number

    @IsOptional()
    @IsString()
    carrier?: string

    @IsOptional()
    @IsString()
    trackingNumber?: string

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreatePackageItemDto)
    items!: CreatePackageItemDto[]
}
