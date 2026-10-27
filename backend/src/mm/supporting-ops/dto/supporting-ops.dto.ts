import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsNumber,
    IsBoolean,
    Min,
    IsIn,
} from 'class-validator'
import { Type } from 'class-transformer'

export class RegistryQueryDto {
    @IsOptional() @IsString() companyId?: string
    @IsOptional() @IsString() materialId?: string
    @IsOptional() @IsString() entityType?: string
    @IsOptional() @IsString() status?: string
    @IsOptional() @IsString() search?: string
    @IsOptional() @Type(() => Number) @IsNumber() page?: number
    @IsOptional() @Type(() => Number) @IsNumber() pageSize?: number
}

export class CreateRegistryBarcodeDto {
    @IsString() @IsNotEmpty() materialId!: string
    @IsString() @IsNotEmpty() barcodeType!: string
    @IsString() @IsNotEmpty() barcodeValue!: string
    @IsOptional() @IsBoolean() isPrimary?: boolean
    @IsOptional() @IsString() entityType?: string
    @IsOptional() @IsString() entityId?: string
    @IsOptional() @IsString() uomId?: string
    @IsOptional() @IsNumber() @Min(0.000001) packagingQuantity?: number
    @IsOptional() @IsString() batchId?: string
    @IsOptional() @IsString() serialNumberId?: string
    @IsOptional() @IsString() createdBy?: string
}

export class StartScanSessionDto {
    @IsString() @IsNotEmpty() companyId!: string
    @IsString() @IsNotEmpty() userId!: string
    @IsOptional() @IsString() userRole?: string
    @IsOptional() @IsString() mobileDeviceId?: string
    @IsOptional() @IsString() warehouseId?: string
    @IsString() @IsNotEmpty() businessProcess!: string
    @IsOptional() @IsString() sourceDocumentType?: string
    @IsOptional() @IsString() sourceDocumentId?: string
    @IsOptional() @IsString() sourceTaskId?: string
    @IsOptional() @IsBoolean() offlineMode?: boolean
}

export class CreateScanOverrideDto {
    @IsString() @IsNotEmpty() companyId!: string
    @IsOptional() @IsString() warehouseId?: string
    @IsString() @IsNotEmpty() businessProcess!: string
    @IsOptional() @IsString() sourceDocumentType?: string
    @IsOptional() @IsString() sourceDocumentId?: string
    @IsOptional() @IsString() materialId?: string
    @IsOptional() @IsString() batchId?: string
    @IsOptional() @IsString() serialNumberId?: string
    @IsString() @IsNotEmpty() reasonCode!: string
    @IsString() @IsNotEmpty() explanation!: string
    @IsString() @IsNotEmpty() requestedBy!: string
    @IsOptional() @IsBoolean() supervisorRequired?: boolean
}

export class DecideScanOverrideDto {
    @IsString() @IsNotEmpty() approverId!: string
    @IsIn(['APPROVE', 'REJECT']) decision!: 'APPROVE' | 'REJECT'
}

export class AssignRfidTagDto {
    @IsString() @IsNotEmpty() companyId!: string
    @IsString() @IsNotEmpty() tagValue!: string
    @IsOptional() @IsString() entityType?: string
    @IsOptional() @IsString() entityId?: string
    @IsOptional() @IsString() materialId?: string
    @IsOptional() @IsString() batchId?: string
    @IsOptional() @IsString() serialNumberId?: string
    @IsOptional() @IsString() performedBy?: string
}

export class RfidReadDto {
    @IsString() @IsNotEmpty() companyId!: string
    @IsString() @IsNotEmpty() tagValue!: string
    @IsOptional() @IsString() readerId?: string
    @IsOptional() @IsString() warehouseId?: string
    @IsOptional() @IsString() storageBinId?: string
    @IsOptional() @IsString() performedBy?: string
}

export class CreateControlledDocumentDto {
    @IsString() @IsNotEmpty() companyId!: string
    @IsString() @IsNotEmpty() title!: string
    @IsString() @IsNotEmpty() documentType!: string
    @IsOptional() @IsString() department?: string
    @IsOptional() @IsString() processArea?: string
    @IsOptional() @IsString() ownerUserId?: string
    @IsOptional() @IsString() createdBy?: string
}

export class ApproveControlledDocDto {
    @IsString() @IsNotEmpty() revisionNumber!: string
    @IsString() @IsNotEmpty() approverUserId!: string
    @IsOptional() @IsString() authorUserId?: string
    @IsOptional() @IsString() effectiveDate?: string
}

export class ComplianceAuditQueryDto {
    @IsString() @IsNotEmpty() companyId!: string
    @IsOptional() @IsString() domain?: string
    @IsOptional() @Type(() => Number) @IsNumber() page?: number
    @IsOptional() @Type(() => Number) @IsNumber() pageSize?: number
}

export class ListDevicesQueryDto {
    @IsOptional() @IsString() companyId?: string
    @IsOptional() @IsString() status?: string
}

export class RegisterDeviceAdminDto {
    @IsString() @IsNotEmpty() deviceCode!: string
    @IsString() @IsNotEmpty() companyId!: string
    @IsOptional() @IsString() warehouseId?: string
    @IsOptional() @IsString() name?: string
    @IsOptional() @IsString() deviceType?: string
    @IsOptional() @IsString() platform?: string
    @IsOptional() @IsString() osInfo?: string
}
