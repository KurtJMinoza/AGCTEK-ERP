import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsDateString,
    IsArray,
    ValidateNested,
    IsNumber,
    Min,
    IsIn,
    MaxLength,
} from 'class-validator'
import { Type } from 'class-transformer'

const ISSUE_PURPOSES = ['PRODUCTION', 'SALES', 'INTERNAL', 'OTHER'] as const

class GoodsIssueLineDto {
    @IsString()
    @IsNotEmpty()
    materialId!: string

    @IsNumber()
    @Min(0.000001)
    quantity!: number

    @IsString()
    @IsNotEmpty()
    uomId!: string

    @IsOptional()
    @IsString()
    storageBinId?: string

    @IsOptional()
    @IsString()
    batchId?: string

    @IsOptional()
    @IsString()
    serialNumberId?: string

    @IsOptional()
    @IsString()
    reservationId?: string

    @IsOptional()
    @IsString()
    pickingTaskId?: string

    @IsOptional()
    @IsNumber()
    @Min(0)
    unitCost?: number

    @IsOptional()
    @IsNumber()
    @Min(0)
    totalCost?: number

    @IsOptional()
    @IsString()
    remarks?: string
}

export class CreateGoodsIssueDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsString()
    @IsNotEmpty()
    warehouseId!: string

    @IsDateString()
    postingDate!: string

    @IsDateString()
    documentDate!: string

    @IsOptional()
    @IsIn(ISSUE_PURPOSES)
    issuePurpose?: string

    @IsOptional()
    @IsString()
    reservationId?: string

    @IsOptional()
    @IsString()
    packageId?: string

    @IsOptional()
    @IsString()
    sourceDocumentType?: string

    @IsOptional()
    @IsString()
    sourceDocumentId?: string

    @IsOptional()
    @IsString()
    remarks?: string

    @IsOptional()
    @IsString()
    createdBy?: string

    @IsOptional()
    @IsString()
    @MaxLength(128)
    idempotencyKey?: string

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => GoodsIssueLineDto)
    lines!: GoodsIssueLineDto[]
}
