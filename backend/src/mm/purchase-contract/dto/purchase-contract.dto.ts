import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsDateString,
    IsArray,
    ValidateNested,
    IsNumber,
    Min,
    IsInt,
} from 'class-validator'
import { Type } from 'class-transformer'

export class CreatePurchaseContractLineDto {
    @IsString()
    @IsNotEmpty()
    materialId!: string

    @IsString()
    @IsNotEmpty()
    uomId!: string

    @IsNumber()
    @Min(0)
    negotiatedPrice!: number

    @IsOptional()
    @IsNumber()
    @Min(0)
    moq?: number

    @IsOptional()
    @IsInt()
    @Min(0)
    leadTimeDays?: number

    @IsOptional()
    @IsNumber()
    @Min(0)
    contractQuantity?: number

    @IsOptional()
    @IsString()
    remarks?: string
}

export class CreateContractReleaseLineDto {
    @IsString()
    @IsNotEmpty()
    contractLineId!: string

    @IsNumber()
    @Min(0.000001)
    quantity!: number
}

export class CreateContractReleaseDto {
    @IsString()
    @IsNotEmpty()
    buyerId!: string

    @IsOptional()
    @IsString()
    warehouseId?: string

    @IsOptional()
    @IsString()
    releasedBy?: string

    @IsOptional()
    @IsString()
    notes?: string

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateContractReleaseLineDto)
    lines!: CreateContractReleaseLineDto[]
}

export class CreatePurchaseContractDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsString()
    @IsNotEmpty()
    supplierId!: string

    @IsString()
    @IsNotEmpty()
    buyerId!: string

    @IsDateString()
    validFrom!: string

    @IsOptional()
    @IsDateString()
    validTo?: string

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
    @IsString()
    materialCategoryId?: string

    @IsOptional()
    @IsString()
    purchaseOrderId?: string

    @IsOptional()
    @IsString()
    notes?: string

    @IsOptional()
    @IsString()
    createdBy?: string

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreatePurchaseContractLineDto)
    lines?: CreatePurchaseContractLineDto[]
}

export class UpdatePurchaseContractDto {
    @IsOptional()
    @IsString()
    buyerId?: string

    @IsOptional()
    @IsDateString()
    validFrom?: string

    @IsOptional()
    @IsDateString()
    validTo?: string

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
    @IsString()
    materialCategoryId?: string

    @IsOptional()
    @IsString()
    purchaseOrderId?: string

    @IsOptional()
    @IsString()
    notes?: string

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreatePurchaseContractLineDto)
    lines?: CreatePurchaseContractLineDto[]
}

export class PurchaseContractQueryDto {
    @IsOptional()
    @IsString()
    companyId?: string

    @IsOptional()
    @IsString()
    supplierId?: string

    @IsOptional()
    @IsString()
    status?: string

    @IsOptional()
    @IsString()
    search?: string

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    pageSize?: number
}

export class LinkContractPoDto {
    @IsString()
    @IsNotEmpty()
    purchaseOrderId!: string
}
