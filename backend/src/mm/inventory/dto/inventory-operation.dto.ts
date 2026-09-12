import {
    IsDateString,
    IsIn,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    MaxLength,
    Min,
} from 'class-validator'
import { MM_STOCK_STATUSES } from '../inventory.constants'

class InventoryOperationBaseDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsOptional()
    @IsString()
    plantId?: string

    @IsString()
    @IsNotEmpty()
    warehouseId!: string

    @IsOptional()
    @IsString()
    storageBinId?: string

    @IsOptional()
    @IsString()
    sourceBinId?: string

    @IsOptional()
    @IsString()
    destinationBinId?: string

    @IsString()
    @IsNotEmpty()
    materialId!: string

    @IsOptional()
    @IsString()
    batchId?: string

    @IsOptional()
    @IsString()
    serialNumberId?: string

    @IsOptional()
    @IsIn(MM_STOCK_STATUSES)
    stockStatus?: string

    @IsNumber()
    @Min(0.000001)
    quantity!: number

    @IsString()
    @IsNotEmpty()
    uomId!: string

    @IsOptional()
    @IsNumber()
    unitCost?: number

    @IsOptional()
    @IsNumber()
    totalCost?: number

    @IsDateString()
    postingDate!: string

    @IsDateString()
    documentDate!: string

    @IsOptional()
    @IsString()
    sourceModule?: string

    @IsOptional()
    @IsString()
    sourceDocumentType?: string

    @IsOptional()
    @IsString()
    sourceDocumentId?: string

    @IsOptional()
    @IsString()
    sourceDocumentLineId?: string

    @IsOptional()
    @IsString()
    reasonCode?: string

    @IsOptional()
    @IsString()
    @MaxLength(500)
    remarks?: string

    @IsOptional()
    @IsString()
    @MaxLength(128)
    idempotencyKey?: string

    @IsOptional()
    @IsString()
    createdBy?: string
}

export class PostReceiptDto extends InventoryOperationBaseDto {}

export class PostIssueDto extends InventoryOperationBaseDto {
    @IsOptional()
    @IsIn(['AVAILABLE', 'ON_HAND'])
    stockCheckMode?: 'AVAILABLE' | 'ON_HAND'

    @IsOptional()
    @IsNumber()
    @Min(0)
    releaseReservedQuantity?: number
}

export class PostTransferDto extends InventoryOperationBaseDto {
    @IsString()
    @IsNotEmpty()
    destinationWarehouseId!: string
}

export class PostAdjustmentDto extends InventoryOperationBaseDto {
    @IsIn(['ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'COUNT_GAIN', 'COUNT_LOSS'])
    movementType!:
        | 'ADJUSTMENT_IN'
        | 'ADJUSTMENT_OUT'
        | 'COUNT_GAIN'
        | 'COUNT_LOSS'
}
