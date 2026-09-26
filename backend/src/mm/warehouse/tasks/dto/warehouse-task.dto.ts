import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsNumber,
    Min,
    IsIn,
    IsObject,
} from 'class-validator'
import { Type } from 'class-transformer'
import {
    WAREHOUSE_TASK_TYPES,
    WAREHOUSE_TASK_STATUSES,
    WAREHOUSE_EXCEPTION_CODES,
} from '../warehouse-task.constants'

export class CreateWarehouseTaskDto {
    @IsString() @IsNotEmpty() companyId!: string
    @IsString() @IsNotEmpty() warehouseId!: string
    @IsIn([...WAREHOUSE_TASK_TYPES]) taskType!: string
    @IsNumber() @Min(0.000001) quantity!: number
    @IsOptional() @IsString() plantId?: string
    @IsOptional() @IsString() sourceBinId?: string
    @IsOptional() @IsString() destinationBinId?: string
    @IsOptional() @IsString() materialId?: string
    @IsOptional() @IsString() batchId?: string
    @IsOptional() @IsString() serialId?: string
    @IsOptional() @IsString() uomId?: string
    @IsOptional() @IsString() stockStatus?: string
    @IsOptional() @IsString() referenceType?: string
    @IsOptional() @IsString() referenceId?: string
    @IsOptional() @IsNumber() @Min(1) priority?: number
    @IsOptional() @IsString() assignedUserId?: string
    @IsOptional() @IsObject() metadata?: Record<string, unknown>
}

export class WarehouseTaskQueryDto {
    @IsOptional() @IsIn([...WAREHOUSE_TASK_TYPES]) taskType?: string
    @IsOptional() @IsIn([...WAREHOUSE_TASK_STATUSES]) status?: string
    @IsOptional() @IsString() warehouseId?: string
    @IsOptional() @IsString() companyId?: string
    @IsOptional() @IsString() assignedUserId?: string
    @IsOptional() @IsString() search?: string
    @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number
    @IsOptional() @Type(() => Number) @IsNumber() @Min(1) pageSize?: number
}

export class AssignTaskDto {
    @IsString() @IsNotEmpty() userId!: string
}

export class StartTaskDto {
    @IsOptional() @IsString() performedBy?: string
}

export class CompleteTaskDto {
    @IsNumber() @Min(0.000001) quantity!: number
    @IsOptional() @IsString() destinationBinId?: string
    @IsOptional() @IsString() sourceBinId?: string
    @IsOptional() @IsString() scannedBinId?: string
    @IsOptional() @IsString() scannedBinCode?: string
    @IsOptional() @IsString() scannedMaterialId?: string
    @IsOptional() @IsString() scannedBatchId?: string
    @IsOptional() @IsString() scannedSerialId?: string
    @IsOptional() @IsString() performedBy?: string
    @IsOptional() @IsString() idempotencyKey?: string
}

export class CancelTaskDto {
    @IsOptional() @IsString() reason?: string
    @IsOptional() @IsString() performedBy?: string
}

export class ReportExceptionDto {
    @IsIn([...WAREHOUSE_EXCEPTION_CODES]) exceptionCode!: string
    @IsOptional() @IsString() details?: string
    @IsOptional() @IsString() reportedBy?: string
}

export class ReleaseExceptionDto {
    @IsOptional() @IsString() releasedBy?: string
}
