import {
    IsString,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsInt,
    Min,
} from 'class-validator'

export class CreatePickingDto {
    @IsString()
    @IsNotEmpty()
    warehouseId!: string

    @IsOptional()
    @IsString()
    companyId?: string

    @IsOptional()
    @IsString()
    sourceBinId?: string

    @IsString()
    @IsNotEmpty()
    materialId!: string

    @IsNumber()
    @Min(0.01)
    requiredQty!: number

    @IsOptional()
    @IsString()
    batchId?: string

    @IsOptional()
    @IsString()
    serialId?: string

    @IsOptional()
    @IsString()
    uomId?: string

    @IsOptional()
    @IsString()
    waveId?: string

    @IsOptional()
    @IsString()
    reservationId?: string

    @IsOptional()
    @IsString()
    reservationHeaderId?: string

    @IsOptional()
    @IsString()
    reservationLineId?: string

    @IsOptional()
    @IsString()
    allocationLineId?: string

    @IsOptional()
    @IsString()
    sourceDocument?: string

    /** Sales order that generated this task (ecommerce/retail fulfillment). */
    @IsOptional()
    @IsString()
    salesOrderId?: string

    @IsOptional()
    @IsString()
    salesOrderLineId?: string

    /** Deterministic key — a retried call never creates a duplicate task. */
    @IsOptional()
    @IsString()
    lastIdempotencyKey?: string

    @IsOptional()
    @IsInt()
    @Min(1)
    priority?: number

    /** FIFO | FEFO | NEAREST | ZONE — used when sourceBinId is omitted */
    @IsOptional()
    @IsString()
    strategy?: string

    /** Zone filter for ZONE strategy (section/type code) */
    @IsOptional()
    @IsString()
    zoneCode?: string
}
