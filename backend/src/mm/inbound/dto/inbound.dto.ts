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

export class AsnLineDto {
    @IsString() @IsNotEmpty() materialId!: string
    @IsNumber() @Min(0.000001) quantity!: number
    @IsString() @IsNotEmpty() uomId!: string
    @IsOptional() @IsString() purchaseOrderLineId?: string
    @IsOptional() @IsString() batchNumber?: string
    @IsOptional() @IsString() serialNumber?: string
    @IsOptional() @IsString() packageType?: string
    @IsOptional() @IsNumber() @Min(0) grossWeight?: number
    @IsOptional() @IsString() remarks?: string
}

export class CreateAsnDto {
    @IsString() @IsNotEmpty() companyId!: string
    @IsString() @IsNotEmpty() supplierId!: string
    @IsOptional() @IsString() purchaseOrderId?: string
    @IsOptional() @IsString() warehouseId?: string
    @IsOptional() @IsString() shipmentNumber?: string
    @IsOptional() @IsString() supplierReference?: string
    @IsOptional() @IsNumber() @Min(0) packageCount?: number
    @IsOptional() @IsString() carrier?: string
    @IsOptional() @IsString() trackingNumber?: string
    @IsOptional() @IsDateString() expectedDate?: string
    @IsOptional() @IsString() remarks?: string
    @IsOptional() @IsString() createdBy?: string
    @IsArray() @ValidateNested({ each: true }) @Type(() => AsnLineDto)
    lines!: AsnLineDto[]
}

export class CreateExpectedReceiptFromPoDto {
    @IsString() @IsNotEmpty() purchaseOrderId!: string
    @IsOptional() @IsString() warehouseId?: string
    @IsOptional() @IsDateString() expectedDate?: string
    @IsOptional() @IsString() createdBy?: string
}

export class CreateExpectedReceiptFromAsnDto {
    @IsString() @IsNotEmpty() asnId!: string
    @IsOptional() @IsString() warehouseId?: string
    @IsOptional() @IsString() createdBy?: string
}

export class ReceiveLineDto {
    @IsString() @IsNotEmpty() expectedReceiptLineId!: string
    @IsNumber() @Min(0) receivedQuantity!: number
    @IsOptional() @IsNumber() @Min(0) damagedQuantity?: number
    @IsOptional() @IsNumber() @Min(0) rejectedQuantity?: number
    @IsOptional() @IsString() batchId?: string
    @IsOptional() @IsString() serialNumberId?: string
    @IsOptional() @IsString() storageBinId?: string
    @IsOptional() @IsNumber() @Min(0) unitCost?: number
    @IsOptional() @IsString() barcode?: string
    /** Optional override material when scanning — mismatch → WRONG_MATERIAL variance */
    @IsOptional() @IsString() materialId?: string
    @IsOptional() @IsString() uomId?: string
}

export class ReceiveDto {
    @IsString() @IsNotEmpty() expectedReceiptId!: string
    @IsOptional() autoPost?: boolean
    @IsOptional() @IsString() receiverId?: string
    @IsOptional() @IsString() createdBy?: string
    @IsOptional() @IsDateString() postingDate?: string
    @IsOptional() @IsDateString() documentDate?: string
    @IsArray() @ValidateNested({ each: true }) @Type(() => ReceiveLineDto)
    lines!: ReceiveLineDto[]
}

export class QualityDecideLineDto {
    @IsString() @IsNotEmpty() lineId!: string
    @IsNumber() @Min(0) passQuantity!: number
    @IsNumber() @Min(0) failQuantity!: number
    @IsOptional() @IsString() remarks?: string
}

export class QualityDecideDto {
    @IsOptional() @IsString() inspectedBy?: string
    @IsOptional() @IsString() remarks?: string
    @IsArray() @ValidateNested({ each: true }) @Type(() => QualityDecideLineDto)
    lines!: QualityDecideLineDto[]
}

export class InboundQueryDto {
    @IsOptional() @IsString() status?: string
    @IsOptional() @IsString() companyId?: string
    @IsOptional() @IsString() warehouseId?: string
    @IsOptional() @IsString() supplierId?: string
    @IsOptional() @IsString() search?: string
    @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number
    @IsOptional() @Type(() => Number) @IsNumber() @Min(1) pageSize?: number
}
