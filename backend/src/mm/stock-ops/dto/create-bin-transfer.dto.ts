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

    /**
     * Source storage bin. Omit (or send null) for warehouse-level stock that
     * was never assigned to a bin — the OUT leg then posts at warehouse level,
     * moving that stock into the destination bin.
     */
    @IsOptional()
    @IsString()
    sourceBinId?: string | null

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
