import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsDateString,
    IsArray,
    ValidateNested,
    IsNumber,
    Min,
    IsIn,
} from 'class-validator'
import { Type } from 'class-transformer'

const STOCK_STATUSES = ['UNRESTRICTED', 'QUALITY_INSPECTION', 'BLOCKED'] as const

export class GoodsReceiptLineDto {
    @IsString() @IsNotEmpty() materialId!: string
    @IsNumber() @Min(0.000001) quantity!: number
    @IsString() @IsNotEmpty() uomId!: string
    @IsOptional() @IsNumber() @Min(0) expectedQuantity?: number
    @IsOptional() @IsNumber() @Min(0) shortageQuantity?: number
    @IsOptional() @IsNumber() @Min(0) overageQuantity?: number
    @IsOptional() @IsNumber() @Min(0) damagedQuantity?: number
    @IsOptional() @IsNumber() @Min(0) rejectedQuantity?: number
    @IsOptional() @IsString() storageBinId?: string
    @IsOptional() @IsString() batchId?: string
    @IsOptional() @IsString() serialNumberId?: string
    @IsOptional() @IsNumber() @Min(0) unitCost?: number
    @IsOptional() @IsNumber() @Min(0) totalCost?: number
    @IsOptional() @IsString() remarks?: string
    @IsOptional() @IsString() purchaseOrderLineId?: string
    @IsOptional() @IsString() expectedReceiptLineId?: string
    @IsOptional() @IsString() discrepancyFlag?: string
    @IsOptional() @IsIn(STOCK_STATUSES) stockStatus?: string
}

export class CreateGoodsReceiptDto {
    @IsString() @IsNotEmpty() companyId!: string
    @IsString() @IsNotEmpty() warehouseId!: string
    @IsOptional() @IsString() purchaseOrderId?: string
    @IsOptional() @IsString() expectedReceiptId?: string
    @IsOptional() @IsString() asnId?: string
    @IsOptional() @IsString() supplierId?: string
    @IsOptional() @IsString() receiverId?: string
    @IsDateString() postingDate!: string
    @IsDateString() documentDate!: string
    @IsOptional() @IsIn(STOCK_STATUSES) stockStatus?: string
    @IsOptional() @IsString() remarks?: string
    @IsOptional() @IsString() createdBy?: string
    @IsArray() @ValidateNested({ each: true }) @Type(() => GoodsReceiptLineDto)
    lines!: GoodsReceiptLineDto[]
}
