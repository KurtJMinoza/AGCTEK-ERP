import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsNumber,
    IsArray,
    ValidateNested,
    IsIn,
    Min,
} from 'class-validator'
import { Type } from 'class-transformer'

const REASONS = [
    'DAMAGE',
    'EXPIRY',
    'RECALL',
    'OBSOLETE',
    'SHRINKAGE',
    'QUALITY_FAILURE',
] as const

const DISPOSAL_TYPES = ['SCRAP', 'DISPOSAL'] as const

// ─── Config ────────────────────────────────────────────────────────

export class UpsertConfigDto {
    @IsString() @IsNotEmpty() companyId!: string
    @IsOptional() @IsNumber() approvalAmountThreshold?: number
    @IsOptional() @IsNumber() approvalQuantityThreshold?: number
}

// ─── Supplier Return ───────────────────────────────────────────────

export class ReturnLineDto {
    @IsString() @IsNotEmpty() materialId!: string
    @IsString() @IsNotEmpty() uomId!: string
    @IsOptional() @IsString() batchId?: string
    @IsOptional() @IsString() serialNumberId?: string
    @IsOptional() @IsString() storageBinId?: string
    @IsOptional() @IsString() goodsReceiptLineId?: string
    @IsNumber() @Min(0.000001) quantity!: number
    @IsOptional() @IsNumber() unitCost?: number
    @IsIn(REASONS) reason!: string
    @IsOptional() @IsString() stockStatus?: string
    @IsOptional() @IsString() remarks?: string
}

export class CreateSupplierReturnDto {
    @IsString() @IsNotEmpty() companyId!: string
    @IsString() @IsNotEmpty() supplierId!: string
    @IsString() @IsNotEmpty() warehouseId!: string
    @IsOptional() @IsString() goodsReceiptId?: string
    @IsOptional() @IsString() purchaseOrderId?: string
    @IsIn(REASONS) reason!: string
    @IsOptional() @IsString() remarks?: string
    @IsOptional() @IsString() createdBy?: string

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ReturnLineDto)
    lines!: ReturnLineDto[]
}

export class UpdateSupplierReturnDto {
    @IsOptional() @IsIn(REASONS) reason?: string
    @IsOptional() @IsString() remarks?: string

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ReturnLineDto)
    lines?: ReturnLineDto[]
}

// ─── Disposal ──────────────────────────────────────────────────────

export class DisposalLineDto {
    @IsString() @IsNotEmpty() materialId!: string
    @IsString() @IsNotEmpty() uomId!: string
    @IsOptional() @IsString() batchId?: string
    @IsOptional() @IsString() serialNumberId?: string
    @IsOptional() @IsString() storageBinId?: string
    @IsNumber() @Min(0.000001) quantity!: number
    @IsOptional() @IsNumber() unitCost?: number
    @IsIn(REASONS) reason!: string
    @IsOptional() @IsString() stockStatus?: string
    @IsOptional() @IsString() remarks?: string
}

export class CreateDisposalDto {
    @IsString() @IsNotEmpty() companyId!: string
    @IsString() @IsNotEmpty() warehouseId!: string
    @IsIn(DISPOSAL_TYPES) disposalType!: string
    @IsIn(REASONS) reason!: string
    @IsOptional() @IsString() remarks?: string
    @IsOptional() @IsString() createdBy?: string

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DisposalLineDto)
    lines!: DisposalLineDto[]
}

export class UpdateDisposalDto {
    @IsOptional() @IsIn(REASONS) reason?: string
    @IsOptional() @IsString() remarks?: string

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DisposalLineDto)
    lines?: DisposalLineDto[]
}

// ─── Query ─────────────────────────────────────────────────────────

export class ReturnsQueryDto {
    @IsOptional() @IsString() companyId?: string
    @IsOptional() @IsString() warehouseId?: string
    @IsOptional() @IsString() supplierId?: string
    @IsOptional() @IsString() status?: string
    @IsOptional() @IsString() reason?: string
    @IsOptional() @IsString() search?: string
    @IsOptional() @IsNumber() @Type(() => Number) page?: number
    @IsOptional() @IsNumber() @Type(() => Number) pageSize?: number
}

export class DisposalQueryDto {
    @IsOptional() @IsString() companyId?: string
    @IsOptional() @IsString() warehouseId?: string
    @IsOptional() @IsString() disposalType?: string
    @IsOptional() @IsString() status?: string
    @IsOptional() @IsString() reason?: string
    @IsOptional() @IsString() search?: string
    @IsOptional() @IsNumber() @Type(() => Number) page?: number
    @IsOptional() @IsNumber() @Type(() => Number) pageSize?: number
}

export class DamagedExpiredQueryDto {
    @IsOptional() @IsString() companyId?: string
    @IsOptional() @IsString() warehouseId?: string
    @IsOptional() @IsString() materialId?: string
    @IsOptional() @IsNumber() @Type(() => Number) page?: number
    @IsOptional() @IsNumber() @Type(() => Number) pageSize?: number
}

export class ActionDto {
    @IsOptional() @IsString() performedBy?: string
    @IsOptional() @IsString() reason?: string
}

// ─── Customer Return ───────────────────────────────────────────────

const DISPOSITIONS = ['RESTOCK', 'REPAIR', 'BLOCK', 'SCRAP'] as const

export class CustomerReturnLineDto {
    @IsString() @IsNotEmpty() materialId!: string
    @IsString() @IsNotEmpty() uomId!: string
    @IsOptional() @IsString() batchId?: string
    @IsOptional() @IsString() serialNumberId?: string
    @IsOptional() @IsString() storageBinId?: string
    @IsNumber() @Min(0.000001) quantity!: number
    @IsOptional() @IsNumber() unitCost?: number
    @IsOptional() @IsIn(DISPOSITIONS) disposition?: string
    @IsOptional() @IsString() remarks?: string
}

export class CreateCustomerReturnDto {
    @IsString() @IsNotEmpty() companyId!: string
    @IsString() @IsNotEmpty() warehouseId!: string
    @IsOptional() @IsString() customerRef?: string
    @IsOptional() @IsString() customerName?: string
    @IsOptional() @IsString() reason?: string
    @IsOptional() @IsString() remarks?: string
    @IsOptional() @IsString() createdBy?: string

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CustomerReturnLineDto)
    lines!: CustomerReturnLineDto[]
}

export class UpdateCustomerReturnDto {
    @IsOptional() @IsString() customerRef?: string
    @IsOptional() @IsString() customerName?: string
    @IsOptional() @IsString() reason?: string
    @IsOptional() @IsString() remarks?: string

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CustomerReturnLineDto)
    lines?: CustomerReturnLineDto[]
}

export class SetDispositionDto {
    @IsIn(DISPOSITIONS) disposition!: string
    @IsOptional() @IsString() performedBy?: string
}

export class CustomerReturnQueryDto {
    @IsOptional() @IsString() companyId?: string
    @IsOptional() @IsString() warehouseId?: string
    @IsOptional() @IsString() status?: string
    @IsOptional() @IsString() search?: string
    @IsOptional() @IsNumber() @Type(() => Number) page?: number
    @IsOptional() @IsNumber() @Type(() => Number) pageSize?: number
}

// ─── Stock status ops / create-from-balance ─────────────────────────

export class IdentifyDamageDto {
    @IsString() @IsNotEmpty() companyId!: string
    @IsString() @IsNotEmpty() warehouseId!: string
    @IsString() @IsNotEmpty() materialId!: string
    @IsString() @IsNotEmpty() uomId!: string
    @IsNumber() @Min(0.000001) quantity!: number
    @IsOptional() @IsNumber() unitCost?: number
    @IsOptional() @IsString() batchId?: string
    @IsOptional() @IsString() serialNumberId?: string
    @IsOptional() @IsString() storageBinId?: string
    @IsOptional() @IsString() performedBy?: string
}

export class MarkExpiredDto {
    @IsString() @IsNotEmpty() companyId!: string
    @IsString() @IsNotEmpty() warehouseId!: string
    @IsString() @IsNotEmpty() materialId!: string
    @IsString() @IsNotEmpty() uomId!: string
    @IsNumber() @Min(0.000001) quantity!: number
    @IsOptional() @IsNumber() unitCost?: number
    @IsOptional() @IsString() batchId?: string
    @IsOptional() @IsString() serialNumberId?: string
    @IsOptional() @IsString() storageBinId?: string
    /** Source stock status before mark (default UNRESTRICTED) */
    @IsOptional() @IsString() fromStockStatus?: string
    @IsOptional() @IsString() performedBy?: string
}

export class BalanceLineRefDto {
    @IsString() @IsNotEmpty() materialId!: string
    @IsString() @IsNotEmpty() uomId!: string
    @IsNumber() @Min(0.000001) quantity!: number
    @IsOptional() @IsNumber() unitCost?: number
    @IsOptional() @IsString() batchId?: string
    @IsOptional() @IsString() serialNumberId?: string
    @IsOptional() @IsString() storageBinId?: string
    @IsOptional() @IsString() stockStatus?: string
}

export class CreateFromBalancesDto {
    @IsString() @IsNotEmpty() companyId!: string
    @IsString() @IsNotEmpty() warehouseId!: string
    @IsOptional() @IsString() supplierId?: string
    @IsOptional() @IsString() goodsReceiptId?: string
    @IsOptional() @IsIn(DISPOSAL_TYPES) disposalType?: string
    @IsIn(REASONS) reason!: string
    @IsOptional() @IsString() remarks?: string
    @IsOptional() @IsString() createdBy?: string

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BalanceLineRefDto)
    lines!: BalanceLineRefDto[]
}
