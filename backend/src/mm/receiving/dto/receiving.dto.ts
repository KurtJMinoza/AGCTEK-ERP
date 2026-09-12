import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsDateString,
    IsArray,
    ValidateNested,
    IsNumber,
    Min,
    IsBoolean,
} from 'class-validator'
import { Type } from 'class-transformer'

export class CreateReceivingLineDto {
    @IsString() @IsNotEmpty() expectedReceiptLineId!: string
    @IsNumber() @Min(0) receivedQuantity!: number
    @IsOptional() @IsNumber() @Min(0) damagedQuantity?: number
    @IsOptional() @IsNumber() @Min(0) rejectedQuantity?: number
    @IsOptional() @IsString() uomId?: string
    @IsOptional() @IsString() batchId?: string
    @IsOptional() @IsString() serialNumberId?: string
    @IsOptional() @IsString() storageBinId?: string
    @IsOptional() @IsNumber() @Min(0) unitCost?: number
    @IsOptional() @IsString() barcode?: string
    @IsOptional() @IsString() materialId?: string
}

export class CreateReceivingDocumentDto {
    @IsString() @IsNotEmpty() expectedReceiptId!: string
    @IsOptional() @IsString() receiverId?: string
    @IsOptional() @IsString() createdBy?: string
    @IsOptional() @IsDateString() postingDate?: string
    @IsOptional() @IsDateString() documentDate?: string
    @IsOptional() @IsBoolean() autoPost?: boolean
    @IsArray() @ValidateNested({ each: true }) @Type(() => CreateReceivingLineDto)
    lines!: CreateReceivingLineDto[]
}

export class ReceivingActionDto {
    @IsOptional() @IsString() performedBy?: string
}

export class ReceivingQueryDto {
    @IsOptional() @IsString() status?: string
    @IsOptional() @IsString() companyId?: string
    @IsOptional() @IsString() expectedReceiptId?: string
    @IsOptional() @IsString() search?: string
    @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number
    @IsOptional() @Type(() => Number) @IsNumber() @Min(1) pageSize?: number
}

export class VarianceQueryDto {
    @IsOptional() @IsString() status?: string
    @IsOptional() @IsString() varianceType?: string
    @IsOptional() @IsString() companyId?: string
    @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number
    @IsOptional() @Type(() => Number) @IsNumber() @Min(1) pageSize?: number
}

export class RecordInspectionResultsDto {
    @IsOptional() @IsString() recordedBy?: string
    @IsOptional()
    @IsArray()
    samples?: Array<{ sampleNumber?: number; sampleSize: number; notes?: string }>
    @IsOptional()
    @IsArray()
    results?: Array<{
        sampleId?: string
        characteristicId?: string
        measuredValue?: string
        numericValue?: number
        passed?: boolean
        notes?: string
    }>
    @IsOptional()
    @IsArray()
    defects?: Array<{
        defectCode: string
        quantity: number
        severity?: string
        notes?: string
    }>
}

export class UsageDecisionDto {
    @IsString() @IsNotEmpty() decisionCode!: string
    @IsNumber() @Min(0.000001) quantity!: number
    @IsOptional() @IsString() deviationReason?: string
    @IsOptional() @IsString() decidedBy?: string
    @IsOptional() @IsString() notes?: string
}

export class CreateQualityHoldDto {
    @IsString() @IsNotEmpty() companyId!: string
    @IsString() @IsNotEmpty() reason!: string
    @IsOptional() @IsString() inspectionLotId?: string
    @IsOptional() @IsString() goodsReceiptLineId?: string
    @IsOptional() @IsString() materialId?: string
    @IsOptional() @IsString() warehouseId?: string
    @IsOptional() @IsString() heldBy?: string
}

export class ReleaseQualityHoldDto {
    @IsOptional() @IsString() releasedBy?: string
    @IsOptional() @IsString() releaseNotes?: string
}
