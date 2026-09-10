import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsNumber,
    Min,
    IsArray,
    ValidateNested,
    ArrayMinSize,
    IsDateString,
} from 'class-validator'
import { Type } from 'class-transformer'

export class CreateQuotationLineDto {
    @IsOptional()
    @IsString()
    rfqLineId?: string

    @IsString()
    @IsNotEmpty()
    materialId!: string

    @IsNumber()
    @Min(0.0001)
    quantity!: number

    @IsString()
    @IsNotEmpty()
    uomId!: string

    @IsNumber()
    @Min(0)
    unitPrice!: number

    @IsOptional()
    @IsNumber()
    @Min(0)
    discount?: number

    @IsOptional()
    @IsNumber()
    @Min(0)
    tax?: number

    @IsOptional()
    @IsNumber()
    @Min(0)
    leadTimeDays?: number

    @IsOptional()
    @IsNumber()
    @Min(0)
    moq?: number

    @IsOptional()
    @IsString()
    warranty?: string

    @IsOptional()
    @IsString()
    notes?: string
}

export class CreateQuotationDto {
    @IsString()
    @IsNotEmpty()
    rfqId!: string

    @IsString()
    @IsNotEmpty()
    supplierId!: string

    @IsDateString()
    validityDate!: string

    @IsOptional()
    @IsString()
    currencyId?: string

    @IsOptional()
    @IsString()
    paymentTermsId?: string

    @IsOptional()
    @IsString()
    deliveryTerms?: string

    @IsOptional()
    @IsNumber()
    @Min(0)
    freight?: number

    @IsOptional()
    @IsNumber()
    @Min(0)
    tax?: number

    @IsOptional()
    @IsNumber()
    @Min(0)
    qualityScore?: number

    @IsOptional()
    @IsNumber()
    @Min(0)
    supplierScore?: number

    @IsOptional()
    @IsString()
    notes?: string

    @IsOptional()
    @IsString()
    createdBy?: string

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateQuotationLineDto)
    @ArrayMinSize(1)
    lines!: CreateQuotationLineDto[]
}

export class UpdateQuotationScoresDto {
    @IsOptional()
    @IsNumber()
    @Min(0)
    qualityScore?: number

    @IsOptional()
    @IsNumber()
    @Min(0)
    supplierScore?: number
}
