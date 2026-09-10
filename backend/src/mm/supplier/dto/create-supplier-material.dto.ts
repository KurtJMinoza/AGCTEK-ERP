import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsNumber,
    IsBoolean,
    IsDateString,
    IsInt,
    Min,
} from 'class-validator'

export class CreateSupplierMaterialDto {
    @IsString()
    @IsNotEmpty()
    supplierId!: string

    @IsString()
    @IsNotEmpty()
    materialId!: string

    @IsOptional()
    @IsString()
    supplierMaterialCode?: string

    @IsNumber()
    @Min(0)
    unitPrice!: number

    @IsOptional()
    @IsString()
    currencyId?: string

    @IsOptional()
    @IsNumber()
    @Min(0)
    minimumOrderQuantity?: number

    @IsOptional()
    @IsInt()
    @Min(0)
    leadTimeDays?: number

    @IsOptional()
    @IsDateString()
    validityStart?: string

    @IsOptional()
    @IsDateString()
    validityEnd?: string

    @IsOptional()
    @IsBoolean()
    preferredSupplier?: boolean
}
