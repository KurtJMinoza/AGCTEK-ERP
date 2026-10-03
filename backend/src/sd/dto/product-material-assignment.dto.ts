import {
    IsBoolean,
    IsIn,
    IsISO8601,
    IsNotEmpty,
    IsOptional,
    IsString,
} from 'class-validator'

export class CreateProductMaterialAssignmentDto {
    @IsString()
    @IsNotEmpty()
    productId!: string

    @IsString()
    @IsNotEmpty()
    materialId!: string

    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsOptional()
    @IsString()
    divisionId?: string

    @IsOptional()
    @IsString()
    salesUomId?: string

    @IsOptional()
    @IsString()
    materialUomId?: string

    @IsOptional()
    @IsString()
    fulfillmentType?: string

    @IsOptional()
    @IsBoolean()
    inventoryRelevant?: boolean

    @IsOptional()
    @IsBoolean()
    atpRelevant?: boolean

    @IsOptional()
    @IsBoolean()
    reservationRelevant?: boolean

    @IsOptional()
    @IsISO8601()
    effectiveFrom?: string

    @IsOptional()
    @IsISO8601()
    effectiveTo?: string

    @IsOptional()
    @IsIn(['ACTIVE', 'INACTIVE'])
    status?: string
}
