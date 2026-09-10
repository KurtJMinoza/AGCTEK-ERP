import {
    IsString,
    IsOptional,
    IsNumber,
    IsIn,
    IsArray,
    ValidateNested,
    Min,
} from 'class-validator'
import { Type } from 'class-transformer'

export class UpsertMaterialValuationDto {
    @IsString()
    companyId!: string

    @IsString()
    materialId!: string

    @IsString()
    warehouseId!: string

    @IsIn(['STANDARD_COST', 'MOVING_AVERAGE', 'FIFO'])
    valuationMethod!: string

    @IsOptional()
    @IsString()
    currencyId?: string

    @IsOptional()
    @IsNumber()
    @Min(0)
    standardCost?: number

    @IsOptional()
    @IsString()
    effectiveDate?: string
}

export class UpdateMaterialValuationDto {
    @IsOptional()
    @IsIn(['STANDARD_COST', 'MOVING_AVERAGE', 'FIFO'])
    valuationMethod?: string

    @IsOptional()
    @IsString()
    currencyId?: string | null

    @IsOptional()
    @IsNumber()
    @Min(0)
    standardCost?: number

    @IsOptional()
    @IsString()
    effectiveDate?: string
}

export class ReviseStandardCostDto {
    @IsNumber()
    @Min(0)
    standardCost!: number

    @IsOptional()
    @IsString()
    effectiveDate?: string

    @IsOptional()
    @IsString()
    createdBy?: string
}

export class MaterialValuationQueryDto {
    @IsOptional()
    @IsString()
    companyId?: string

    @IsOptional()
    @IsString()
    warehouseId?: string

    @IsOptional()
    @IsString()
    materialId?: string

    @IsOptional()
    @IsString()
    valuationMethod?: string

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    page?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    limit?: number
}

export class CostLayerQueryDto {
    @IsOptional()
    @IsString()
    companyId?: string

    @IsOptional()
    @IsString()
    warehouseId?: string

    @IsOptional()
    @IsString()
    materialId?: string

    @IsOptional()
    @IsString()
    status?: string

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    page?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    limit?: number
}

export class ValuationTxnQueryDto {
    @IsOptional()
    @IsString()
    companyId?: string

    @IsOptional()
    @IsString()
    warehouseId?: string

    @IsOptional()
    @IsString()
    materialId?: string

    @IsOptional()
    @IsString()
    valuationMethod?: string

    @IsOptional()
    @IsString()
    direction?: string

    /** When true, only rows with non-zero priceVariance */
    @IsOptional()
    priceVarianceOnly?: string | boolean

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    page?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    limit?: number
}

export class InventoryValueQueryDto {
    @IsString()
    companyId!: string

    @IsOptional()
    @IsString()
    warehouseId?: string

    @IsOptional()
    @IsString()
    materialId?: string

    @IsOptional()
    @IsString()
    batchId?: string

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    page?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    limit?: number
}

export class LandedCostLineDto {
    @IsIn(['FREIGHT', 'CUSTOMS', 'INSURANCE', 'HANDLING', 'OTHER'])
    costType!: string

    @IsOptional()
    @IsString()
    description?: string

    @IsNumber()
    amount!: number

    @IsOptional()
    @IsString()
    materialId?: string

    @IsOptional()
    @IsNumber()
    weight?: number

    @IsOptional()
    @IsNumber()
    volume?: number

    @IsOptional()
    @IsNumber()
    quantity?: number

    @IsOptional()
    @IsNumber()
    valueBase?: number
}

export class CreateLandedCostDto {
    @IsString()
    companyId!: string

    @IsOptional()
    @IsString()
    warehouseId?: string

    @IsIn(['QUANTITY', 'WEIGHT', 'VOLUME', 'VALUE', 'MANUAL'])
    allocationBase!: string

    @IsOptional()
    @IsString()
    currencyId?: string

    @IsOptional()
    @IsString()
    referenceDocType?: string

    @IsOptional()
    @IsString()
    referenceDocId?: string

    @IsOptional()
    @IsString()
    remarks?: string

    @IsOptional()
    @IsString()
    createdBy?: string

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => LandedCostLineDto)
    lines!: LandedCostLineDto[]
}

export class LandedCostQueryDto {
    @IsOptional()
    @IsString()
    companyId?: string

    @IsOptional()
    @IsString()
    status?: string

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    page?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    limit?: number
}

export class AllocatePreviewDto {
    @IsOptional()
    @IsString()
    warehouseId?: string

    @IsOptional()
    @IsArray()
    targets?: Array<{
        materialId: string
        quantity?: number
        weight?: number
        volume?: number
        value?: number
        manualAmount?: number
    }>
}
