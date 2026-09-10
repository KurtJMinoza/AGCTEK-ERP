import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsBoolean,
    IsNumber,
    Min,
    IsArray,
    ValidateNested,
    ArrayMinSize,
    IsDateString,
} from 'class-validator'
import { Type } from 'class-transformer'

export class CreateRfqLineDto {
    @IsString()
    @IsNotEmpty()
    materialId!: string

    @IsNumber()
    @Min(0.0001)
    quantity!: number

    @IsString()
    @IsNotEmpty()
    uomId!: string

    @IsOptional()
    @IsDateString()
    requiredDate?: string

    @IsOptional()
    @IsString()
    specifications?: string

    @IsOptional()
    @IsString()
    prLineId?: string
}

export class CreateRfqDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsString()
    @IsNotEmpty()
    buyerId!: string

    @IsDateString()
    responseDeadline!: string

    @IsOptional()
    @IsString()
    currencyId?: string

    @IsOptional()
    @IsString()
    purpose?: string

    @IsOptional()
    @IsString()
    notes?: string

    @IsOptional()
    @IsBoolean()
    autoSelectCheapest?: boolean

    @IsOptional()
    @IsString()
    purchaseRequisitionId?: string

    @IsOptional()
    @IsString()
    createdBy?: string

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateRfqLineDto)
    @ArrayMinSize(1)
    lines!: CreateRfqLineDto[]

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    supplierIds?: string[]
}

export class CreateRfqFromPrDto {
    @IsString()
    @IsNotEmpty()
    purchaseRequisitionId!: string

    @IsString()
    @IsNotEmpty()
    buyerId!: string

    @IsDateString()
    responseDeadline!: string

    @IsOptional()
    @IsString()
    currencyId?: string

    @IsOptional()
    @IsString()
    purpose?: string

    @IsOptional()
    @IsBoolean()
    autoSelectCheapest?: boolean

    @IsOptional()
    @IsString()
    createdBy?: string

    @IsArray()
    @ArrayMinSize(1)
    @IsString({ each: true })
    prLineIds!: string[]

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    supplierIds?: string[]
}

export class InviteSuppliersDto {
    @IsArray()
    @ArrayMinSize(1)
    @IsString({ each: true })
    supplierIds!: string[]
}

export class AwardRfqDto {
    @IsOptional()
    @IsString()
    quotationId?: string

    @IsOptional()
    @IsString()
    supplierId?: string

    @IsString()
    @IsNotEmpty()
    reason!: string

    @IsOptional()
    @IsString()
    evaluatedBy?: string

    /** Only honored when RFQ.autoSelectCheapest is true */
    @IsOptional()
    @IsBoolean()
    useCheapest?: boolean
}
