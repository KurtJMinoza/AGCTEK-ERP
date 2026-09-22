import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsNumber,
    IsArray,
    ValidateNested,
    Min,
    IsDateString,
    IsBoolean,
} from 'class-validator'
import { Type } from 'class-transformer'
import { CreateReservationLineDto } from '../../../inventory/reservation-allocation/dto/reservation-allocation.dto'

export class SdAvailabilityCheckDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsString()
    @IsNotEmpty()
    warehouseId!: string

    @IsString()
    @IsNotEmpty()
    materialId!: string

    @IsNumber()
    @Min(0.000001)
    quantity!: number

    @IsOptional()
    @IsString()
    batchId?: string

    @IsOptional()
    @IsString()
    serialNumberId?: string
}

export class SdAvailabilityCheckDateDto extends SdAvailabilityCheckDto {
    @IsDateString()
    requiredDate!: string
}

export class SdAvailabilityBatchLineDto {
    @IsString()
    @IsNotEmpty()
    materialId!: string

    @IsNumber()
    @Min(0.000001)
    quantity!: number

    @IsOptional()
    @IsString()
    lineRef?: string
}

export class SdAvailabilityBatchDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsString()
    @IsNotEmpty()
    warehouseId!: string

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SdAvailabilityBatchLineDto)
    lines!: SdAvailabilityBatchLineDto[]
}

export class SdReserveDemandLineDto extends CreateReservationLineDto {
    @IsOptional()
    @IsString()
    demandReferenceLineId?: string
}

export class SdReserveDemandDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsString()
    @IsNotEmpty()
    warehouseId!: string

    @IsString()
    @IsNotEmpty()
    sourceDocumentId!: string

    @IsOptional()
    @IsString()
    demandReferenceId?: string

    @IsOptional()
    @IsString()
    idempotencyKey?: string

    @IsOptional()
    @IsString()
    correlationId?: string

    @IsOptional()
    @IsString()
    causationId?: string

    @IsOptional()
    @IsBoolean()
    allowPartialReservation?: boolean

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SdReserveDemandLineDto)
    lines!: SdReserveDemandLineDto[]
}

export class SdAdjustDemandLineDto {
    @IsString()
    @IsNotEmpty()
    demandReferenceLineId!: string

    @IsNumber()
    @Min(0)
    newQuantity!: number
}

export class SdAdjustDemandDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SdAdjustDemandLineDto)
    lines!: SdAdjustDemandLineDto[]
}

export class SdReleaseBySourceDto {
    @IsOptional()
    @IsString()
    reason?: string
}
