import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsNumber,
    IsArray,
    ValidateNested,
    Min,
    IsIn,
    IsBoolean,
    IsDateString,
    IsInt,
} from 'class-validator'
import { Type } from 'class-transformer'
import { ALLOCATION_STRATEGIES, RESERVATION_STATUSES } from '../reservation-allocation.constants'

export class CreateReservationLineDto {
    @IsString() @IsNotEmpty() materialId!: string
    @IsNumber() @Min(0.000001) quantity!: number
    @IsOptional() @IsString() batchId?: string
    @IsOptional() @IsString() serialNumberId?: string
    @IsOptional() @IsString() uomId?: string
    @IsOptional() @IsString() stockStatus?: string
}

export class CreateReservationHeaderDto {
    @IsString() @IsNotEmpty() companyId!: string
    @IsString() @IsNotEmpty() warehouseId!: string
    @IsString() @IsNotEmpty() sourceModule!: string
    @IsString() @IsNotEmpty() sourceDocumentType!: string
    @IsString() @IsNotEmpty() sourceDocumentId!: string
    @IsOptional() @IsString() demandReferenceType?: string
    @IsOptional() @IsString() demandReferenceId?: string
    @IsOptional() @IsString() demandReferenceLineId?: string
    @IsOptional() @IsBoolean() allowPartialReservation?: boolean
    @IsOptional() @IsDateString() validUntil?: string
    @IsOptional() @IsString() createdBy?: string
    @IsArray() @ValidateNested({ each: true }) @Type(() => CreateReservationLineDto)
    lines!: CreateReservationLineDto[]
}

export class ReservationQueryDto {
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number
    @IsOptional() @IsString() companyId?: string
    @IsOptional() @IsString() warehouseId?: string
    @IsOptional() @IsIn([...RESERVATION_STATUSES]) status?: string
    @IsOptional() @IsString() demandReferenceId?: string
    @IsOptional() @IsString() search?: string
}

export class AllocateReservationDto {
    @IsOptional() @IsIn([...ALLOCATION_STRATEGIES]) strategy?: string
    @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CustomAllocationLineDto)
    lines?: CustomAllocationLineDto[]
    @IsOptional() @IsBoolean() generatePickTasks?: boolean
    @IsOptional() @IsString() createdBy?: string
}

export class CustomAllocationLineDto {
    @IsString() @IsNotEmpty() reservationLineId!: string
    @IsString() @IsNotEmpty() storageBinId!: string
    @IsNumber() @Min(0.000001) quantity!: number
    @IsOptional() @IsString() batchId?: string
    @IsOptional() @IsString() serialNumberId?: string
}

export class CreateAllocationDto {
    @IsString() @IsNotEmpty() reservationHeaderId!: string
    @IsOptional() @IsIn([...ALLOCATION_STRATEGIES]) strategy?: string
    @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CustomAllocationLineDto)
    lines?: CustomAllocationLineDto[]
    @IsOptional() @IsBoolean() generatePickTasks?: boolean
    @IsOptional() @IsString() createdBy?: string
}

export class AllocationQueryDto {
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number
    @IsOptional() @IsString() headerId?: string
    @IsOptional() @IsString() status?: string
}
