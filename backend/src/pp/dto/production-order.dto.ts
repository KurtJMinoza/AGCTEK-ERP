import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsNumber,
    Min,
} from 'class-validator'

export class CreateProductionOrderDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsString()
    @IsNotEmpty()
    warehouseId!: string

    @IsOptional()
    @IsString()
    plantId?: string

    @IsString()
    @IsNotEmpty()
    finishedMaterialId!: string

    @IsNumber()
    @Min(0.000001)
    plannedQuantity!: number

    @IsOptional()
    @IsString()
    idempotencyKey?: string

    @IsOptional()
    @IsString()
    createdBy?: string
}

export class ChangeProductionMaterialQtyDto {
    @IsNumber()
    @Min(0)
    quantity!: number
}

export class IssueProductionComponentsDto {
    @IsOptional()
    @IsString()
    storageBinId?: string

    @IsOptional()
    @IsString()
    createdBy?: string
}

export class ReportProductionOutputDto {
    @IsString()
    @IsNotEmpty()
    materialId!: string

    @IsNumber()
    @Min(0.000001)
    quantity!: number

    @IsOptional()
    @IsString()
    storageBinId?: string

    @IsOptional()
    @IsString()
    createdBy?: string
}

export class CreateBomDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsOptional()
    @IsString()
    plantId?: string

    @IsString()
    @IsNotEmpty()
    parentMaterialId!: string

    @IsOptional()
    @IsNumber()
    @Min(0.000001)
    baseQuantity?: number

    @IsOptional()
    @IsNumber()
    @Min(0.000001)
    yieldFactor?: number

    @IsOptional()
    components?: Array<{
        componentMaterialId: string
        quantityPer: number
        uomId: string
        scrapFactor?: number
    }>
}
