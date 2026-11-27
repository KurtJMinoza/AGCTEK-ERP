import { Type } from 'class-transformer'
import {
    ArrayMinSize,
    IsArray,
    IsBoolean,
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
    materialGroupCode?: string | null

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
    @MaxLength(40)
    salesChannelCode?: string | null

    @IsOptional()
    @IsString()
    taxCodeId?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(40)
    paymentMethodCode?: string | null

    @IsOptional()
    @IsString()
    bankAccountId?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(40)
    paymentProviderCode?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(8)
    currencyCode?: string | null

    @IsOptional()
    @IsString()
    branchId?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(40)
    assetClassCode?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(40)
    depreciationAreaCode?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(40)
    documentTypeCode?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(40)
    productionOrderTypeCode?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(40)
    costElementCategoryCode?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(40)
    controllingAreaCode?: string | null

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
    materialGroupCode?: string | null

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
    @MaxLength(40)
    salesChannelCode?: string | null

    @IsOptional()
    @IsString()
    taxCodeId?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(40)
    paymentMethodCode?: string | null

    @IsOptional()
    @IsString()
    bankAccountId?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(40)
    paymentProviderCode?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(8)
    currencyCode?: string | null

    @IsOptional()
    @IsString()
    branchId?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(40)
    assetClassCode?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(40)
    depreciationAreaCode?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(40)
    documentTypeCode?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(40)
    productionOrderTypeCode?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(40)
    costElementCategoryCode?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(40)
    controllingAreaCode?: string | null

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

    @IsOptional()
    @IsString()
    @MaxLength(40)
    transactionKeyCode?: string

    @IsOptional()
    @IsString()
    glAccountId?: string

    @IsOptional()
    @IsDateString()
    effectiveOn?: string

    @IsOptional()
    @IsString()
    @MaxLength(40)
    accountingCategory?: string

    @IsOptional()
    @IsIn(['COMPLETE', 'INCOMPLETE'])
    completeness?: string

    @IsOptional()
    @IsString()
    @MaxLength(40)
    sortBy?: string

    @IsOptional()
    @IsIn(['asc', 'desc'])
    sortDir?: 'asc' | 'desc'
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

export class AccountDeterminationDimensionsDto {
    @IsOptional()
    @IsString()
    valuationClassId?: string

    @IsOptional()
    @IsString()
    materialTypeCode?: string

    @IsOptional()
    @IsString()
    movementType?: string

    @IsOptional()
    @IsString()
    customerAccountGroup?: string

    @IsOptional()
    @IsString()
    salesOrganization?: string

    @IsOptional()
    @IsString()
    distributionChannel?: string

    @IsOptional()
    @IsString()
    paymentMethodCode?: string

    @IsOptional()
    @IsString()
    bankAccountId?: string

    @IsOptional()
    @IsString()
    paymentProviderCode?: string

    @IsOptional()
    @IsString()
    currencyCode?: string

    @IsOptional()
    @IsString()
    branchId?: string

    @IsOptional()
    @IsString()
    assetClassCode?: string

    @IsOptional()
    @IsString()
    depreciationAreaCode?: string

    @IsOptional()
    @IsString()
    documentTypeCode?: string

    @IsOptional()
    @IsString()
    productionOrderTypeCode?: string

    @IsOptional()
    @IsString()
    costElementCategoryCode?: string

    @IsOptional()
    @IsString()
    controllingAreaCode?: string
}

export class FicoAccountDeterminationDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsString()
    @IsNotEmpty()
    transactionKey!: string

    @IsIn(FICO_DETERMINATION_SOURCE_MODULES)
    sourceModule!: string

    @IsDateString()
    postingDate!: string

    @IsOptional()
    @IsString()
    currencyCode?: string | null

    @IsOptional()
    @IsString()
    transactionType?: string

    @ValidateNested()
    @Type(() => AccountDeterminationDimensionsDto)
    dimensions!: AccountDeterminationDimensionsDto
}

export class FicoAccountDeterminationBatchItemDto {
    @IsString()
    @IsNotEmpty()
    transactionKey!: string

    @IsOptional()
    @IsString()
    transactionType?: string

    @IsOptional()
    @IsIn(['DEBIT', 'CREDIT'])
    preferredSide?: 'DEBIT' | 'CREDIT'
}

export class FicoAccountDeterminationBatchDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsIn(FICO_DETERMINATION_SOURCE_MODULES)
    sourceModule!: string

    @IsDateString()
    postingDate!: string

    @IsOptional()
    @IsString()
    currencyCode?: string | null

    @ValidateNested()
    @Type(() => AccountDeterminationDimensionsDto)
    dimensions!: AccountDeterminationDimensionsDto

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => FicoAccountDeterminationBatchItemDto)
    items!: FicoAccountDeterminationBatchItemDto[]
}

export class FicoDeterminationSimulationDto {
    @IsIn(['SINGLE_KEY', 'MULTI_KEY', 'DRAFT_RULE', 'SOURCE_DOCUMENT'])
    mode!: string

    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsDateString()
    postingDate!: string

    @IsIn(FICO_DETERMINATION_SOURCE_MODULES)
    sourceModule!: string

    @IsOptional()
    @IsString()
    @MaxLength(40)
    transactionKey?: string

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    transactionKeys?: string[]

    @IsOptional()
    @IsString()
    transactionType?: string

    @IsOptional()
    @IsString()
    currencyCode?: string | null

    @IsOptional()
    @IsString()
    documentType?: string

    @IsOptional()
    @ValidateNested()
    @Type(() => AccountDeterminationDimensionsDto)
    dimensions?: AccountDeterminationDimensionsDto

    @IsOptional()
    @IsString()
    sourceDocumentType?: string

    @IsOptional()
    @IsString()
    sourceDocumentId?: string
}

export class FicoDeterminationConflictCheckDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsOptional()
    @IsIn(FICO_DETERMINATION_SOURCE_MODULES)
    sourceModule?: string

    @IsOptional()
    @IsString()
    @MaxLength(40)
    transactionKeyCode?: string
}

export class FicoDeterminationNewVersionDto {
    @IsOptional()
    @IsDateString()
    effectiveFrom?: string

    @IsOptional()
    @IsString()
    @MaxLength(500)
    changeReason?: string
}

export class FicoTransactionKeyWriteDto {
    @IsOptional()
    @IsString()
    @MaxLength(40)
    code?: string

    @IsOptional()
    @IsString()
    @MaxLength(120)
    name?: string

    @IsOptional()
    @IsString()
    @MaxLength(500)
    description?: string

    @IsOptional()
    @IsString()
    @MaxLength(20)
    owningModule?: string

    @IsOptional()
    @IsString()
    @MaxLength(40)
    accountingCategory?: string

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    supportedSourceModules?: string[]

    @IsOptional()
    @IsBoolean()
    requiresValuationClass?: boolean

    @IsOptional()
    @IsIn(['DEBIT_INVENTORY', 'CREDIT_INVENTORY', 'NONE'])
    inventorySide?: string

    @IsOptional()
    @IsBoolean()
    automaticPostingEligible?: boolean

    @IsOptional()
    @IsIn(['LIVE', 'CONFIG_ONLY', 'NOT_AVAILABLE'])
    integrationStatus?: string

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(9999)
    sortOrder?: number

    @IsOptional()
    @IsIn(['ACTIVE', 'INACTIVE'])
    status?: string
}

export class FicoDeterminationExceptionQueryDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsOptional()
    @IsString()
    @MaxLength(60)
    category?: string

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

export class FicoDeterminationUsageQueryDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsOptional()
    @IsString()
    glAccountId?: string

    @IsOptional()
    @IsString()
    @MaxLength(40)
    transactionKeyCode?: string
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

    @IsOptional()
    @IsString()
    paymentMethodCode?: string | null

    @IsOptional()
    @IsString()
    bankAccountId?: string | null

    @IsOptional()
    @IsString()
    paymentProviderCode?: string | null

    @IsOptional()
    @IsString()
    branchId?: string | null

    @IsOptional()
    @IsString()
    assetClassCode?: string | null

    @IsOptional()
    @IsString()
    depreciationAreaCode?: string | null

    @IsOptional()
    @IsString()
    documentTypeCode?: string | null

    @IsOptional()
    @IsString()
    productionOrderTypeCode?: string | null

    @IsOptional()
    @IsString()
    costElementCategoryCode?: string | null

    @IsOptional()
    @IsString()
    controllingAreaCode?: string | null
}
