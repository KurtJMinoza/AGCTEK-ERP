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

class BinTransferLineDto {
    @IsString()
    @IsNotEmpty()
    materialId!: string

    @IsNumber()
    @Min(0.000001)
    quantity!: number

    @IsString()
    @IsNotEmpty()
    uomId!: string

    @IsString()
    @IsNotEmpty()
    sourceBinId!: string

    @IsString()
    @IsNotEmpty()
    destinationBinId!: string

    @IsOptional()
    @IsString()
    batchId?: string

    @IsOptional()
    @IsString()
    serialNumberId?: string
}

export class CreateBinTransferDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsString()
    @IsNotEmpty()
    warehouseId!: string

    @IsDateString()
    postingDate!: string

    @IsOptional()
    @IsString()
    remarks?: string

    @IsOptional()
    @IsString()
    createdBy?: string

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BinTransferLineDto)
    lines!: BinTransferLineDto[]
}
