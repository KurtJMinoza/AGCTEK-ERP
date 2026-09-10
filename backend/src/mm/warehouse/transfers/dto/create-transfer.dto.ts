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

export class CreateTransferLineDto {
    @IsString()
    @IsNotEmpty()
    materialId!: string

    @IsNumber()
    @Min(0.01)
    quantity!: number

    @IsOptional()
    @IsString()
    batchId?: string

    @IsOptional()
    @IsString()
    serialId?: string

    @IsOptional()
    @IsString()
    sourceBinId?: string

    @IsOptional()
    @IsString()
    destinationBinId?: string
}

export class CreateTransferDto {
    @IsString()
    @IsNotEmpty()
    sourceWarehouseId!: string

    @IsString()
    @IsNotEmpty()
    destinationWarehouseId!: string

    @IsOptional()
    @IsString()
    requestedBy?: string

    @IsOptional()
    @IsString()
    notes?: string

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateTransferLineDto)
    lines!: CreateTransferLineDto[]
}
