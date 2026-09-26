import {
    IsString,
    IsOptional,
    IsNumber,
    IsIn,
    IsArray,
    ValidateNested,
    Min,
    IsBoolean,
} from 'class-validator'
import { Type } from 'class-transformer'
import {
    VALUATION_METHODS,
    LANDED_COST_TYPES,
    ALLOCATION_BASES,
} from '../valuation.constants'

export class UpsertMaterialValuationDto {
    @IsString()
    companyId!: string

    @IsString()
    materialId!: string

    @IsString()
    warehouseId!: string

    @IsIn([...VALUATION_METHODS])
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

    @IsOptional()
    @IsString()
    code?: string

    @IsOptional()
    @IsString()
    name?: string

    @IsOptional()
    @IsBoolean()
    isActive?: boolean
}

export class UpdateMaterialValuationDto {
    @IsOptional()
    @IsIn([...VALUATION_METHODS])
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

    @IsOptional()
    @IsString()
    code?: string | null

    @IsOptional()
    @IsString()
    name?: string | null

    @IsOptional()
    @IsBoolean()
    isActive?: boolean
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

export class CreateCostLayerDto {
    @IsString()
    receiptTxnId!: string
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
    @IsIn([...LANDED_COST_TYPES])
    costType!: string

    @IsOptional()
    @IsString()
    costElementId?: string

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

    @IsIn([...ALLOCATION_BASES])
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

export class UpsertCostElementDto {
    @IsString()
    companyId!: string

    @IsString()
    code!: string

    @IsString()
    name!: string

    @IsIn([...LANDED_COST_TYPES])
    costType!: string

    @IsOptional()
    @IsBoolean()
    isActive?: boolean
}

export class CostElementQueryDto {
    @IsOptional()
    @IsString()
    companyId?: string

    @IsOptional()
    @IsString()
    costType?: string

    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    isActive?: boolean

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    page?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    limit?: number
}

export class PriceVarianceQueryDto {
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
    varianceType?: string

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    page?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    limit?: number
}
