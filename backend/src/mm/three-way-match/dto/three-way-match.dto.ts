import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsNumber,
    IsArray,
    ValidateNested,
    IsDateString,
    Min,
} from 'class-validator'
import { Type } from 'class-transformer'

export class InvoiceLineReceiptDto {
    @IsString()
    @IsNotEmpty()
    goodsReceiptLineId!: string

    @IsNumber()
    @Min(0.000001)
    allocatedQuantity!: number
}

export class CreateSupplierInvoiceLineDto {
    @IsString()
    @IsNotEmpty()
    materialId!: string

    @IsString()
    @IsNotEmpty()
    purchaseOrderLineId!: string

    @IsString()
    @IsNotEmpty()
    uomId!: string

    @IsNumber()
    @Min(0.000001)
    invoicedQuantity!: number

    @IsNumber()
    @Min(0)
    unitPrice!: number

    @IsOptional()
    @IsNumber()
    @Min(0)
    taxAmount?: number

    @IsOptional()
    @IsString()
    remarks?: string

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => InvoiceLineReceiptDto)
    receipts!: InvoiceLineReceiptDto[]
}

export class CreateSupplierInvoiceDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsString()
    @IsNotEmpty()
    supplierId!: string

    @IsString()
    @IsNotEmpty()
    purchaseOrderId!: string

    @IsOptional()
    @IsString()
    currencyId?: string

    @IsDateString()
    invoiceDate!: string

    @IsOptional()
    @IsDateString()
    postingDate?: string

    @IsOptional()
    @IsNumber()
    @Min(0)
    taxAmount?: number

    @IsOptional()
    @IsString()
    createdBy?: string

    @IsOptional()
    @IsString()
    remarks?: string

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateSupplierInvoiceLineDto)
    lines!: CreateSupplierInvoiceLineDto[]
}

export class UpdateSupplierInvoiceDto {
    @IsOptional()
    @IsDateString()
    invoiceDate?: string

    @IsOptional()
    @IsDateString()
    postingDate?: string

    @IsOptional()
    @IsNumber()
    @Min(0)
    taxAmount?: number

    @IsOptional()
    @IsString()
    remarks?: string

    @IsOptional()
    @IsString()
    currencyId?: string

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateSupplierInvoiceLineDto)
    lines?: CreateSupplierInvoiceLineDto[]
}

export class SupplierInvoiceQueryDto {
    @IsOptional()
    @IsString()
    companyId?: string

    @IsOptional()
    @IsString()
    supplierId?: string

    @IsOptional()
    @IsString()
    purchaseOrderId?: string

    @IsOptional()
    @IsString()
    status?: string

    @IsOptional()
    @IsString()
    search?: string

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    page?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    limit?: number
}

export class ApproveInvoiceDto {
    @IsOptional()
    @IsString()
    approvedBy?: string
}

export class MatchExceptionQueryDto {
    @IsOptional()
    @IsString()
    companyId?: string

    @IsOptional()
    @IsString()
    invoiceId?: string

    @IsOptional()
    @IsString()
    status?: string

    @IsOptional()
    @IsString()
    varianceType?: string

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    page?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    limit?: number
}

export class ResolveExceptionDto {
    @IsOptional()
    @IsString()
    resolvedBy?: string

    @IsOptional()
    @IsString()
    notes?: string
}

export class UpsertMatchToleranceDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsOptional()
    @IsNumber()
    @Min(0)
    quantityTolerancePct?: number

    @IsOptional()
    @IsNumber()
    @Min(0)
    priceTolerancePct?: number

    @IsOptional()
    @IsNumber()
    @Min(0)
    absoluteToleranceAmount?: number

    @IsOptional()
    @IsNumber()
    @Min(0)
    overDeliveryPct?: number

    @IsOptional()
    @IsNumber()
    @Min(0)
    underDeliveryPct?: number
}
