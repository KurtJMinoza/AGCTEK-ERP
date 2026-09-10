import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsArray,
    IsNumber,
    Min,
    ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'

export class CreatePoFromAwardDto {
    @IsString()
    @IsNotEmpty()
    awardId!: string

    @IsOptional()
    @IsString()
    buyerId?: string

    @IsOptional()
    @IsString()
    warehouseId?: string

    @IsOptional()
    @IsString()
    branchId?: string

    @IsOptional()
    @IsString()
    createdBy?: string
}

class FromPrLineDto {
    @IsString()
    @IsNotEmpty()
    lineId!: string

    @IsOptional()
    @IsNumber()
    @Min(0.000001)
    quantity?: number
}

export class CreatePoFromPrDto {
    @IsString()
    @IsNotEmpty()
    purchaseRequisitionId!: string

    @IsString()
    @IsNotEmpty()
    supplierId!: string

    @IsString()
    @IsNotEmpty()
    buyerId!: string

    @IsOptional()
    @IsString()
    warehouseId?: string

    @IsOptional()
    @IsString()
    branchId?: string

    @IsOptional()
    @IsString()
    currencyId?: string

    @IsOptional()
    @IsString()
    paymentTermsId?: string

    @IsOptional()
    @IsString()
    createdBy?: string

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => FromPrLineDto)
    lineIds!: FromPrLineDto[]
}

export class CreatePoAttachmentDto {
    @IsString()
    @IsNotEmpty()
    fileName!: string

    @IsOptional()
    @IsString()
    fileUrl?: string

    @IsOptional()
    @IsString()
    storageKey?: string

    @IsOptional()
    @IsString()
    uploadedBy?: string
}

export class UpsertPoToleranceDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsOptional()
    @IsNumber()
    @Min(0)
    overDeliveryPct?: number

    @IsOptional()
    @IsNumber()
    @Min(0)
    underDeliveryPct?: number

    @IsOptional()
    @IsNumber()
    @Min(0)
    priceTolerancePct?: number

    @IsOptional()
    @IsNumber()
    @Min(0)
    quantityTolerancePct?: number

    @IsOptional()
    @IsNumber()
    @Min(0)
    absoluteToleranceAmount?: number
}
