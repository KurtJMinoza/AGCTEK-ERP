import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsBoolean,
    IsNumber,
    IsInt,
    Min,
    MaxLength,
    MinLength,
    Matches,
    IsIn,
} from 'class-validator'

export class CreateMaterialDto {
    @IsOptional()
    @IsString()
    @MaxLength(32)
    materialCode?: string

    @IsString()
    @IsNotEmpty()
    @MinLength(2)
    @MaxLength(120)
    materialName!: string

    @IsOptional()
    @IsString()
    description?: string

    @IsOptional()
    @IsString()
    @MaxLength(80)
    shortDescription?: string

    @IsOptional()
    @IsString()
    sku?: string

    @IsOptional()
    @IsString()
    brand?: string

    @IsOptional()
    @IsString()
    model?: string

    @IsOptional()
    @IsString()
    manufacturer?: string

    @IsString()
    @IsNotEmpty()
    materialTypeId!: string

    @IsString()
    @IsNotEmpty()
    materialCategoryId!: string

    @IsOptional()
    @IsIn(['DRAFT', 'ACTIVE', 'INACTIVE', 'BLOCKED'])
    status?: string

    @IsString()
    @IsNotEmpty()
    baseUomId!: string

    @IsOptional()
    @IsString()
    purchaseUomId?: string

    @IsOptional()
    @IsString()
    salesUomId?: string

    @IsOptional()
    @IsNumber()
    @Min(0)
    weight?: number

    @IsOptional()
    @IsString()
    weightUom?: string

    @IsOptional()
    @IsNumber()
    @Min(0)
    length?: number

    @IsOptional()
    @IsNumber()
    @Min(0)
    width?: number

    @IsOptional()
    @IsNumber()
    @Min(0)
    height?: number

    @IsOptional()
    @IsString()
    dimensionUom?: string

    @IsOptional()
    @IsNumber()
    @Min(0)
    volume?: number

    @IsOptional()
    @IsString()
    volumeUom?: string

    @IsOptional()
    @IsBoolean()
    inventoryManaged?: boolean

    @IsOptional()
    @IsBoolean()
    purchasable?: boolean

    @IsOptional()
    @IsBoolean()
    sellable?: boolean

    @IsOptional()
    @IsBoolean()
    batchManaged?: boolean

    @IsOptional()
    @IsBoolean()
    serialManaged?: boolean

    @IsOptional()
    @IsBoolean()
    expiryManaged?: boolean

    @IsOptional()
    @IsBoolean()
    qualityInspectionRequired?: boolean

    @IsOptional()
    @IsNumber()
    @Min(0)
    minimumStock?: number

    @IsOptional()
    @IsNumber()
    @Min(0)
    maximumStock?: number

    @IsOptional()
    @IsNumber()
    @Min(0)
    safetyStock?: number

    @IsOptional()
    @IsNumber()
    @Min(0)
    reorderPoint?: number

    @IsOptional()
    @IsNumber()
    @Min(0)
    reorderQuantity?: number

    @IsOptional()
    @IsInt()
    @Min(0)
    leadTimeDays?: number

    @IsOptional()
    @IsNumber()
    @Min(0)
    minimumOrderQuantity?: number

    @IsOptional()
    @IsString()
    valuationMethod?: string

    @IsOptional()
    @IsNumber()
    @Min(0)
    standardCost?: number

    @IsOptional()
    @IsString()
    currencyId?: string

    @IsOptional()
    @IsString()
    valuationClassId?: string

    @IsOptional()
    @IsString()
    companyId?: string

    @IsOptional()
    @IsString()
    defaultWarehouseId?: string

    @IsOptional()
    @IsString()
    preferredSupplierId?: string
}
