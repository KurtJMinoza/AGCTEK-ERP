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

export class CreatePurchaseOrderLineDto {
    @IsString()
    @IsNotEmpty()
    materialId!: string

    @IsOptional()
    @IsString()
    description?: string

    @IsNumber()
    @Min(0.000001)
    quantity!: number

    @IsString()
    @IsNotEmpty()
    uomId!: string

    @IsOptional()
    @IsNumber()
    @Min(0)
    unitPrice?: number

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
    freight?: number

    @IsOptional()
    @IsDateString()
    requiredDate?: string

    @IsOptional()
    @IsDateString()
    expectedDeliveryDate?: string

    @IsOptional()
    @IsString()
    warehouseId?: string

    @IsOptional()
    @IsString()
    storageBinId?: string

    @IsOptional()
    @IsString()
    costCenterId?: string

    @IsOptional()
    @IsString()
    projectId?: string

    @IsOptional()
    @IsString()
    prLineId?: string

    @IsOptional()
    @IsString()
    rfqLineId?: string

    @IsOptional()
    @IsString()
    quotationLineId?: string

    @IsOptional()
    @IsString()
    remarks?: string
}

export class CreatePurchaseOrderDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsString()
    @IsNotEmpty()
    supplierId!: string

    @IsString()
    @IsNotEmpty()
    buyerId!: string

    @IsOptional()
    @IsString()
    branchId?: string

    @IsOptional()
    @IsString()
    departmentId?: string

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
    warehouseId?: string

    @IsOptional()
    @IsDateString()
    expectedDeliveryDate?: string

    @IsOptional()
    @IsString()
    purchaseRequisitionId?: string

    @IsOptional()
    @IsString()
    rfqId?: string

    @IsOptional()
    @IsString()
    quotationId?: string

    @IsOptional()
    @IsString()
    awardId?: string

    @IsOptional()
    @IsNumber()
    overDeliveryPctOverride?: number

    @IsOptional()
    @IsNumber()
    underDeliveryPctOverride?: number

    @IsOptional()
    @IsNumber()
    priceTolerancePctOverride?: number

    @IsOptional()
    @IsNumber()
    quantityTolerancePctOverride?: number

    @IsOptional()
    @IsString()
    createdBy?: string

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreatePurchaseOrderLineDto)
    lines!: CreatePurchaseOrderLineDto[]
}
