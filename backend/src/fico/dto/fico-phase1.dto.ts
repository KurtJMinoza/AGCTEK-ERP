import { Type } from 'class-transformer'
import {
    IsArray,
    IsBoolean,
    IsDateString,
    IsIn,
    IsInt,
    IsObject,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
    MinLength,
    ValidateNested,
} from 'class-validator'
import {
    FICO_ACCOUNT_TYPES,
    FICO_CHART_STATUSES,
    FICO_NORMAL_BALANCES,
    FICO_NORMAL_PERIOD_COUNTS,
    FICO_PERIOD_STATUSES,
    FICO_PERIOD_TYPES,
    FICO_YEAR_ASSIGNMENTS,
} from '../fico.constants'

export class FicoListQueryDto {
    @IsOptional()
    @IsString()
    search?: string

    @IsOptional()
    @IsString()
    status?: string

    @IsOptional()
    @IsString()
    companyId?: string

    @IsOptional()
    @IsString()
    chartOfAccountsId?: string

    @IsOptional()
    @IsString()
    accountType?: string

    @IsOptional()
    @IsInt()
    fiscalYear?: number

    @IsOptional()
    @IsString()
    periodType?: string

    @IsOptional()
    @IsInt()
    @Min(1)
    page?: number

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(500)
    pageSize?: number
}

export class FicoCompanySettingsUpsertDto {
    @IsOptional()
    @IsString()
    legalName?: string

    @IsOptional()
    @IsString()
    @MaxLength(3)
    baseCurrency?: string

    @IsOptional()
    @IsString()
    @MaxLength(2)
    countryCode?: string

    @IsOptional()
    @IsString()
    timezone?: string

    @IsOptional()
    @IsIn(['ACCRUAL', 'CASH'])
    accountingMethod?: string

    @IsOptional()
    @IsString()
    chartOfAccountsId?: string | null

    @IsOptional()
    @IsString()
    fiscalYearVariantId?: string | null

    @IsOptional()
    @IsString()
    postingPeriodVariantId?: string | null

    @IsOptional()
    @IsString()
    accountDeterminationProfileId?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(2)
    taxCountryCode?: string | null

    @IsOptional()
    @IsString()
    taxRegistrationNumber?: string | null

    @IsOptional()
    @IsString()
    taxJurisdiction?: string | null

    @IsOptional()
    @IsString()
    defaultTaxCode?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(12)
    documentNumberPrefix?: string

    @IsOptional()
    @IsInt()
    @Min(3)
    @Max(12)
    documentNumberPadding?: number

    @IsOptional()
    @IsObject()
    closeChecklist?: Record<string, unknown> | null
}

export class FicoReasonDto {
    @IsOptional()
    @IsString()
    @MinLength(3)
    reason?: string
}

export class FicoChartCreateDto {
    @IsString()
    @MinLength(1)
    @MaxLength(32)
    code!: string

    @IsString()
    @MinLength(1)
    @MaxLength(160)
    name!: string

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    description?: string

    @IsOptional()
    @IsString()
    @MaxLength(2)
    countryCode?: string

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(32)
    accountCodeLength?: number | null
}

export class FicoChartUpdateDto {
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(160)
    name?: string

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    description?: string

    @IsOptional()
    @IsString()
    @MaxLength(2)
    countryCode?: string

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(32)
    accountCodeLength?: number | null

    @IsOptional()
    @IsIn(FICO_CHART_STATUSES)
    status?: string
}

export class FicoChartDuplicateDto {
    @IsString()
    @MinLength(1)
    @MaxLength(32)
    code!: string

    @IsString()
    @MinLength(1)
    @MaxLength(160)
    name!: string

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    description?: string
}

export class FicoGlGroupCreateDto {
    @IsString()
    @MinLength(1)
    @MaxLength(32)
    code!: string

    @IsString()
    @MinLength(1)
    @MaxLength(160)
    name!: string

    @IsIn(FICO_ACCOUNT_TYPES)
    category!: string

    @IsOptional()
    @IsString()
    parentGroupId?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(32)
    rangeFrom?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(32)
    rangeTo?: string | null

    @IsOptional()
    @IsInt()
    @Min(0)
    sortOrder?: number
}

export class FicoGlGroupUpdateDto {
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(160)
    name?: string

    @IsOptional()
    @IsIn(FICO_ACCOUNT_TYPES)
    category?: string

    @IsOptional()
    @IsString()
    parentGroupId?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(32)
    rangeFrom?: string | null

    @IsOptional()
    @IsString()
    @MaxLength(32)
    rangeTo?: string | null

    @IsOptional()
    @IsInt()
    @Min(0)
    sortOrder?: number

    @IsOptional()
    @IsIn(FICO_CHART_STATUSES)
    status?: string
}

export class FicoGlAccountCreateDto {
    @IsString()
    chartOfAccountsId!: string

    @IsString()
    accountGroupId!: string

    @IsString()
    @MinLength(1)
    @MaxLength(32)
    accountCode!: string

    @IsString()
    @MinLength(1)
    @MaxLength(200)
    accountName!: string

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    description?: string

    @IsIn(FICO_ACCOUNT_TYPES)
    accountType!: string

    @IsOptional()
    @IsIn(FICO_NORMAL_BALANCES)
    normalBalance?: string

    @IsOptional()
    @IsBoolean()
    isPostingAccount?: boolean

    @IsOptional()
    @IsBoolean()
    allowManualPosting?: boolean

    @IsOptional()
    @IsBoolean()
    allowAutomaticPosting?: boolean

    @IsOptional()
    @IsBoolean()
    isReconciliationAccount?: boolean

    @IsOptional()
    @IsString()
    reconciliationType?: string | null

    @IsOptional()
    @IsBoolean()
    openItemManagement?: boolean

    @IsOptional()
    @IsString()
    @MaxLength(3)
    currencyRestriction?: string | null
}

export class FicoGlAccountUpdateDto {
    @IsOptional()
    @IsString()
    accountGroupId?: string

    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(200)
    accountName?: string

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    description?: string

    @IsOptional()
    @IsIn(FICO_ACCOUNT_TYPES)
    accountType?: string

    @IsOptional()
    @IsIn(FICO_NORMAL_BALANCES)
    normalBalance?: string

    @IsOptional()
    @IsBoolean()
    isPostingAccount?: boolean

    @IsOptional()
    @IsBoolean()
    allowManualPosting?: boolean

    @IsOptional()
    @IsBoolean()
    allowAutomaticPosting?: boolean

    @IsOptional()
    @IsBoolean()
    isReconciliationAccount?: boolean

    @IsOptional()
    @IsString()
    reconciliationType?: string | null

    @IsOptional()
    @IsBoolean()
    openItemManagement?: boolean

    @IsOptional()
    @IsString()
    @MaxLength(3)
    currencyRestriction?: string | null

    @IsOptional()
    @IsIn(FICO_CHART_STATUSES)
    status?: string
}

export class FicoGlAccountImportRowDto {
    @IsString()
    @MaxLength(32)
    accountCode!: string

    @IsString()
    @MaxLength(200)
    accountName!: string

    @IsString()
    @MaxLength(32)
    accountGroupCode!: string

    @IsOptional()
    @IsIn(FICO_ACCOUNT_TYPES)
    accountType?: string

    @IsOptional()
    @IsIn(FICO_NORMAL_BALANCES)
    normalBalance?: string

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    description?: string

    @IsOptional()
    @IsBoolean()
    isPostingAccount?: boolean

    @IsOptional()
    @IsBoolean()
    allowManualPosting?: boolean

    @IsOptional()
    @IsBoolean()
    allowAutomaticPosting?: boolean

    @IsOptional()
    @IsBoolean()
    isReconciliationAccount?: boolean

    @IsOptional()
    @IsString()
    reconciliationType?: string | null

    @IsOptional()
    @IsBoolean()
    openItemManagement?: boolean

    @IsOptional()
    @IsString()
    @MaxLength(3)
    currencyRestriction?: string | null
}

export class FicoGlAccountImportDto {
    @IsString()
    chartOfAccountsId!: string

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => FicoGlAccountImportRowDto)
    rows!: FicoGlAccountImportRowDto[]

    @IsOptional()
    @IsBoolean()
    dryRun?: boolean
}

export class FicoAccountMappingCreateDto {
    @IsString()
    companyId!: string

    @IsString()
    @MaxLength(64)
    transactionKeyCode!: string

    /** Omit for the default mapping that applies to every valuation class. */
    @IsOptional()
    @IsString()
    valuationClassId?: string | null

    @IsString()
    debitAccountId!: string

    @IsString()
    creditAccountId!: string

    @IsOptional()
    @IsDateString()
    effectiveFrom?: string | null

    @IsOptional()
    @IsDateString()
    effectiveTo?: string | null
}

export class FicoAccountMappingUpdateDto {
    @IsOptional()
    @IsString()
    debitAccountId?: string

    @IsOptional()
    @IsString()
    creditAccountId?: string

    @IsOptional()
    @IsDateString()
    effectiveFrom?: string | null

    @IsOptional()
    @IsDateString()
    effectiveTo?: string | null

    @IsOptional()
    @IsIn(FICO_CHART_STATUSES)
    status?: string
}

export class FicoCompanyGlAccountDto {
    @IsBoolean()
    postingEnabled!: boolean

    @IsOptional()
    @IsBoolean()
    manualPostingBlocked?: boolean

    @IsOptional()
    @IsDateString()
    effectiveFrom?: string | null

    @IsOptional()
    @IsDateString()
    effectiveTo?: string | null
}

export class FicoFiscalVariantCreateDto {
    @IsString()
    @MinLength(1)
    @MaxLength(32)
    code!: string

    @IsString()
    @MinLength(1)
    @MaxLength(160)
    name!: string

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    description?: string

    @IsInt()
    @Min(1)
    @Max(12)
    startMonth!: number

    @IsInt()
    @Min(1)
    @Max(31)
    startDay!: number

    @IsOptional()
    @IsIn(FICO_NORMAL_PERIOD_COUNTS)
    normalPeriodCount?: number

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(4)
    specialPeriodCount?: number

    /** Derived from the start date; accepted for backward compatibility only. */
    @IsOptional()
    @IsBoolean()
    calendarYearBased?: boolean

    @IsOptional()
    @IsIn(FICO_YEAR_ASSIGNMENTS)
    yearAssignment?: string
}

export class FicoFiscalVariantUpdateDto {
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(160)
    name?: string

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    description?: string

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(12)
    startMonth?: number

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(31)
    startDay?: number

    @IsOptional()
    @IsIn(FICO_NORMAL_PERIOD_COUNTS)
    normalPeriodCount?: number

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(4)
    specialPeriodCount?: number

    /** Derived from the start date; accepted for backward compatibility only. */
    @IsOptional()
    @IsBoolean()
    calendarYearBased?: boolean

    @IsOptional()
    @IsIn(FICO_YEAR_ASSIGNMENTS)
    yearAssignment?: string

    @IsOptional()
    @IsIn(FICO_CHART_STATUSES)
    status?: string
}

export class FicoFiscalVariantDuplicateDto {
    @IsString()
    @MinLength(1)
    @MaxLength(32)
    code!: string

    @IsString()
    @MinLength(1)
    @MaxLength(160)
    name!: string

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    description?: string
}

/** Preview a saved variant (`fiscalYearVariantId`) or an unsaved configuration. */
export class FicoFiscalYearPreviewDto {
    @IsInt()
    @Min(2000)
    @Max(2100)
    fiscalYear!: number

    @IsOptional()
    @IsString()
    fiscalYearVariantId?: string

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(12)
    startMonth?: number

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(31)
    startDay?: number

    @IsOptional()
    @IsIn(FICO_NORMAL_PERIOD_COUNTS)
    normalPeriodCount?: number

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(4)
    specialPeriodCount?: number

    @IsOptional()
    @IsIn(FICO_YEAR_ASSIGNMENTS)
    yearAssignment?: string
}

export class FicoPostingVariantCreateDto {
    @IsString()
    @MinLength(1)
    @MaxLength(32)
    code!: string

    @IsString()
    @MinLength(1)
    @MaxLength(160)
    name!: string

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    description?: string

    @IsOptional()
    @IsBoolean()
    allowSpecialPeriods?: boolean

    @IsOptional()
    @IsObject()
    closeChecklist?: Record<string, unknown> | null
}

export class FicoPostingVariantUpdateDto {
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(160)
    name?: string

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    description?: string

    @IsOptional()
    @IsBoolean()
    allowSpecialPeriods?: boolean

    @IsOptional()
    @IsObject()
    closeChecklist?: Record<string, unknown> | null

    @IsOptional()
    @IsIn(FICO_CHART_STATUSES)
    status?: string
}

export class FicoFiscalYearGenerateDto {
    @IsString()
    companyId!: string

    @IsString()
    fiscalYearVariantId!: string

    @IsOptional()
    @IsString()
    postingPeriodVariantId?: string

    @IsInt()
    @Min(2000)
    @Max(2100)
    fiscalYear!: number

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(4)
    specialPeriodCount?: number
}

export class FicoPeriodListQueryDto {
    @IsString()
    companyId!: string

    @IsOptional()
    @IsInt()
    fiscalYear?: number

    @IsOptional()
    @IsIn(FICO_PERIOD_STATUSES)
    status?: string

    @IsOptional()
    @IsIn(FICO_PERIOD_TYPES)
    periodType?: string
}

export class FicoPeriodResolveQueryDto {
    @IsString()
    companyId!: string

    @IsDateString()
    postingDate!: string
}

export class FicoPeriodActionDto {
    @IsString()
    companyId!: string

    @IsOptional()
    @IsString()
    @MinLength(3)
    reason?: string
}

export class FicoPostingValidationLineDto {
    @IsString()
    glAccountId!: string

    @IsOptional()
    @Min(0)
    debitAmount?: number

    @IsOptional()
    @Min(0)
    creditAmount?: number

    @IsOptional()
    @IsString()
    @MaxLength(3)
    currency?: string
}

export class FicoPostingValidationDto {
    @IsString()
    companyId!: string

    @IsDateString()
    postingDate!: string

    @IsOptional()
    @IsIn(['MANUAL', 'AUTOMATIC'])
    source?: 'MANUAL' | 'AUTOMATIC'

    @IsOptional()
    @IsString()
    @MaxLength(3)
    currencyCode?: string

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => FicoPostingValidationLineDto)
    lines?: FicoPostingValidationLineDto[]
}

export class FicoAccountingEventQueryDto {
    @IsString()
    companyId!: string

    @IsOptional()
    @IsIn(['PENDING', 'CONSUMED', 'FAILED'])
    status?: string

    @IsOptional()
    @IsString()
    @MaxLength(64)
    sourceModule?: string

    @IsOptional()
    @IsString()
    @MaxLength(120)
    search?: string

    @IsOptional()
    @IsInt()
    @Min(1)
    page?: number

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(100)
    pageSize?: number
}

export class FicoAuditQueryDto {
    @IsOptional()
    @IsString()
    companyId?: string

    @IsOptional()
    @IsString()
    action?: string

    @IsOptional()
    @IsString()
    entityType?: string

    @IsOptional()
    @IsString()
    entityId?: string

    @IsOptional()
    @IsString()
    actorId?: string

    @IsOptional()
    @IsDateString()
    dateFrom?: string

    @IsOptional()
    @IsDateString()
    dateTo?: string

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
