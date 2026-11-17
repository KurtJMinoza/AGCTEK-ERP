import { Type } from 'class-transformer'
import {
    ArrayMinSize,
    IsArray,
    IsDateString,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
    MinLength,
    ValidateNested,
} from 'class-validator'
import {
    FICO_DETERMINATION_RULE_STATUSES,
    FICO_DETERMINATION_SIDES,
    FICO_DETERMINATION_SOURCE_MODULES,
    FICO_DETERMINATION_TRANSACTION_TYPE_CODES,
} from '../fico-account-determination.constants'

export class FicoDeterminationLineDto {
    @IsIn(FICO_DETERMINATION_SIDES)
    side!: string

    @IsString()
    @IsNotEmpty()
    glAccountId!: string

    @IsOptional()
    @IsString()
    @MaxLength(200)
    description?: string | null
}

export class FicoDeterminationRuleCreateDto {
    @IsString()
    @MinLength(1)
    @MaxLength(32)
    determinationCode!: string

    @IsString()
    @MinLength(1)
    @MaxLength(120)
    name!: string

    @IsOptional()
    @IsString()
    @MaxLength(500)
    description?: string

    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsIn(FICO_DETERMINATION_SOURCE_MODULES)
    sourceModule!: string

    @IsIn(FICO_DETERMINATION_TRANSACTION_TYPE_CODES)
    transactionType!: string

    @IsOptional()
    @IsString()
    @MaxLength(40)
    transactionKeyCode?: string | null

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(9999)
    priority?: number

    @IsOptional()
    @IsDateString()
    effectiveFrom?: string | null

    @IsOptional()
    @IsDateString()
    effectiveTo?: string | null

    @IsOptional()
    @IsString()
    valuationClassId?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(40)
    materialTypeCode?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(40)
    movementType?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(40)
    customerAccountGroup?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(40)
    salesOrganization?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(40)
    distributionChannel?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(500)
    changeReason?: string | null

    @IsArray()
    @ArrayMinSize(2)
    @ValidateNested({ each: true })
    @Type(() => FicoDeterminationLineDto)
    lines!: FicoDeterminationLineDto[]
}

export class FicoDeterminationRuleUpdateDto {
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(120)
    name?: string

    @IsOptional()
    @IsString()
    @MaxLength(500)
    description?: string

    @IsOptional()
    @IsString()
    @MaxLength(40)
    transactionKeyCode?: string | null

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(9999)
    priority?: number

    @IsOptional()
    @IsDateString()
    effectiveFrom?: string | null

    @IsOptional()
    @IsDateString()
    effectiveTo?: string | null

    @IsOptional()
    @IsString()
    valuationClassId?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(40)
    materialTypeCode?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(40)
    movementType?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(40)
    customerAccountGroup?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(40)
    salesOrganization?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(40)
    distributionChannel?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(500)
    changeReason?: string | null

    @IsOptional()
    @IsArray()
    @ArrayMinSize(2)
    @ValidateNested({ each: true })
    @Type(() => FicoDeterminationLineDto)
    lines?: FicoDeterminationLineDto[]
}

export class FicoDeterminationRuleQueryDto {
    @IsOptional()
    @IsString()
    companyId?: string

    @IsOptional()
    @IsIn(FICO_DETERMINATION_SOURCE_MODULES)
    sourceModule?: string

    @IsOptional()
    @IsIn(FICO_DETERMINATION_TRANSACTION_TYPE_CODES)
    transactionType?: string

    @IsOptional()
    @IsIn(FICO_DETERMINATION_RULE_STATUSES)
    status?: string

    @IsOptional()
    @IsString()
    search?: string

    @IsOptional()
    @IsInt()
    @Min(1)
    page?: number

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(200)
    pageSize?: number
}

export class FicoDeterminationReasonDto {
    @IsOptional()
    @IsString()
    @MaxLength(500)
    reason?: string

    @IsOptional()
    @IsString()
    @MaxLength(500)
    changeReason?: string
}

export class FicoAccountResolutionDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsIn(FICO_DETERMINATION_SOURCE_MODULES)
    sourceModule!: string

    @IsIn(FICO_DETERMINATION_TRANSACTION_TYPE_CODES)
    transactionType!: string

    @IsDateString()
    postingDate!: string

    @IsOptional()
    @IsString()
    currencyCode?: string | null

    @IsOptional()
    @IsString()
    transactionKeyCode?: string | null

    @IsOptional()
    @IsString()
    valuationClassId?: string | null

    @IsOptional()
    @IsString()
    materialTypeCode?: string | null

    @IsOptional()
    @IsString()
    movementType?: string | null

    @IsOptional()
    @IsString()
    customerAccountGroup?: string | null

    @IsOptional()
    @IsString()
    salesOrganization?: string | null

    @IsOptional()
    @IsString()
    distributionChannel?: string | null
}
