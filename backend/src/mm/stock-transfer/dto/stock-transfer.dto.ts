import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsNumber,
    IsArray,
    ValidateNested,
    Min,
    IsIn,
    IsDateString,
    IsInt,
} from 'class-validator'
import { Type } from 'class-transformer'
import { STO_STATUSES, STO_TRANSFER_TYPES } from '../stock-transfer.constants'

export class CreateStoLineDto {
    @IsString() @IsNotEmpty() materialId!: string
    @IsNumber() @Min(0.000001) quantity!: number
    @IsString() @IsNotEmpty() uomId!: string
    @IsOptional() @IsString() sourceBinId?: string
    @IsOptional() @IsString() destinationBinId?: string
    @IsOptional() @IsString() batchId?: string
    @IsOptional() @IsString() serialNumberId?: string
}

export class CreateStockTransferOrderDto {
    @IsString() @IsNotEmpty() companyId!: string
    @IsIn([...STO_TRANSFER_TYPES]) transferType!: string
    @IsString() @IsNotEmpty() sourceWarehouseId!: string
    @IsString() @IsNotEmpty() destinationWarehouseId!: string
    @IsOptional() @IsDateString() postingDate?: string
    @IsOptional() @IsString() requestedBy?: string
    @IsOptional() @IsString() notes?: string
    @IsArray() @ValidateNested({ each: true }) @Type(() => CreateStoLineDto)
    lines!: CreateStoLineDto[]
}

export class StoQueryDto {
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number
    @IsOptional() @IsString() companyId?: string
    @IsOptional() @IsString() sourceWarehouseId?: string
    @IsOptional() @IsString() destinationWarehouseId?: string
    @IsOptional() @IsIn([...STO_STATUSES]) status?: string
    @IsOptional() @IsIn([...STO_TRANSFER_TYPES]) transferType?: string
    @IsOptional() @IsString() search?: string
}

export class ApproveStoDto {
    @IsOptional() @IsString() approvedBy?: string
}

export class DispatchStoDto {
    @IsOptional() @IsString() dispatchedBy?: string
    /** Optional partial quantities keyed by order line id */
    @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => DispatchLineDto)
    lines?: DispatchLineDto[]
}

export class DispatchLineDto {
    @IsString() @IsNotEmpty() orderLineId!: string
    @IsNumber() @Min(0.000001) quantity!: number
}

export class ReceiveStoDto {
    @IsOptional() @IsString() receivedBy?: string
    @IsOptional() @IsString() shipmentId?: string
    @IsArray() @ValidateNested({ each: true }) @Type(() => ReceiveLineDto)
    lines!: ReceiveLineDto[]
}

export class ReceiveLineDto {
    @IsString() @IsNotEmpty() orderLineId!: string
    @IsNumber() @Min(0.000001) quantity!: number
    @IsOptional() @IsString() destinationBinId?: string
}
