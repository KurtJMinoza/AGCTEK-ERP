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

export class PpAvailabilityCheckDto {
    @IsString() @IsNotEmpty() companyId!: string
    @IsString() @IsNotEmpty() warehouseId!: string
    @IsString() @IsNotEmpty() materialId!: string
    @IsNumber() @Min(0.000001) quantity!: number
    @IsOptional() @IsString() batchId?: string
    @IsOptional() @IsString() serialNumberId?: string
}

export class PpAvailabilityCheckDateDto extends PpAvailabilityCheckDto {
    @IsDateString() requiredDate!: string
}

export class PpAvailabilityBatchLineDto {
    @IsString() @IsNotEmpty() materialId!: string
    @IsNumber() @Min(0.000001) quantity!: number
    @IsOptional() @IsString() lineRef?: string
}

export class PpAvailabilityBatchDto {
    @IsString() @IsNotEmpty() companyId!: string
    @IsString() @IsNotEmpty() warehouseId!: string
    @IsArray() @ValidateNested({ each: true }) @Type(() => PpAvailabilityBatchLineDto)
    lines!: PpAvailabilityBatchLineDto[]
}

export class PpReserveDemandLineDto extends CreateReservationLineDto {
    @IsOptional() @IsString() demandReferenceLineId?: string
}

export class PpReserveDemandDto {
    @IsString() @IsNotEmpty() companyId!: string
    @IsString() @IsNotEmpty() warehouseId!: string
    @IsString() @IsNotEmpty() sourceDocumentId!: string
    @IsOptional() @IsString() demandReferenceId?: string
    @IsOptional() @IsString() idempotencyKey?: string
    @IsOptional() @IsString() correlationId?: string
    @IsOptional() @IsString() causationId?: string
    @IsOptional() @IsBoolean() allowPartialReservation?: boolean
    @IsArray() @ValidateNested({ each: true }) @Type(() => PpReserveDemandLineDto)
    lines!: PpReserveDemandLineDto[]
}

export class PpAdjustDemandLineDto {
    @IsString() @IsNotEmpty() demandReferenceLineId!: string
    @IsNumber() @Min(0) newQuantity!: number
}

export class PpAdjustDemandDto {
    @IsArray() @ValidateNested({ each: true }) @Type(() => PpAdjustDemandLineDto)
    lines!: PpAdjustDemandLineDto[]
}

export class PpReleaseBySourceDto {
    @IsOptional() @IsString() reason?: string
}

export class PpIssueComponentsDto {
    @IsString() @IsNotEmpty() productionOrderId!: string
    @IsString() @IsNotEmpty() storageBinId!: string
    @IsOptional() @IsString() createdBy?: string
}

export class PpReceiveOutputDto {
    @IsString() @IsNotEmpty() productionOrderId!: string
    @IsString() @IsNotEmpty() companyId!: string
    @IsString() @IsNotEmpty() warehouseId!: string
    @IsString() @IsNotEmpty() materialId!: string
    @IsNumber() @Min(0.000001) quantity!: number
    @IsOptional() @IsString() storageBinId?: string
    @IsOptional() @IsString() outputId?: string
    @IsOptional() @IsString() createdBy?: string
}
