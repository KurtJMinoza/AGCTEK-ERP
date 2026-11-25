import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsNumber, IsArray, ValidateNested, Min, Max, IsBoolean } from 'class-validator'
import { Type, Transform } from 'class-transformer'

export class FicoPeriodQueryDto {
    @IsString()
    companyId!: string
}

export class UpsertFicoPeriodDto {
    @IsString()
    companyId!: string

    @IsInt()
    @Min(2000)
    fiscalYear!: number

    @IsInt()
    @Min(1)
    periodNumber!: number

    @IsDateString()
    startDate!: string

    @IsDateString()
    endDate!: string

    @IsOptional()
    @IsIn(['OPEN', 'CLOSED'])
    status?: 'OPEN' | 'CLOSED'
}

export class SetFicoPeriodStatusDto {
    @IsString()
    companyId!: string

    @IsInt()
    fiscalYear!: number

    @IsInt()
    periodNumber!: number

    @IsIn(['OPEN', 'CLOSED'])
    status!: 'OPEN' | 'CLOSED'
}

export class FicoReconciliationQueryDto {
    @IsString()
    companyId!: string

    @IsOptional()
    @IsString()
    materialId?: string

    @IsOptional()
    @IsDateString()
    dateFrom?: string

    @IsOptional()
    @IsDateString()
    dateTo?: string
}
export class UpdateJournalEntryDto {
    @IsString()
    companyId!: string

    @IsOptional()
    @IsDateString()
    postingDate?: string

    @IsOptional()
    @IsString()
    description?: string

    @IsOptional()
    @IsString()
    currencyCode?: string

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateJournalLineDto)
    lines?: CreateJournalLineDto[]
}

export class CancelJournalEntryDto {
    @IsString()
    companyId!: string

    @IsOptional()
    @IsString()
    reason?: string
}

export class WithdrawJournalEntryDto {
    @IsString()
    companyId!: string
}

export class CreateJournalEntryDto {
    @IsString()
    companyId!: string

    @IsDateString()
    postingDate!: string

    @IsOptional()
    @IsString()
    description?: string

    @IsOptional()
    @IsString()
    currencyCode?: string

    @IsOptional()
    @IsBoolean()
    requiresApproval?: boolean

    @IsOptional()
    @IsBoolean()
    autoPost?: boolean

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateJournalLineDto)
    lines!: CreateJournalLineDto[]
}

export class CreateJournalLineDto {
    @IsString()
    glAccountId!: string

    @IsOptional()
    @IsNumber()
    @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
    @Min(0)
    debitAmount?: number

    @IsOptional()
    @IsNumber()
    @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
    @Min(0)
    creditAmount?: number

    @IsOptional()
    @IsString()
    description?: string
}

export class FicoTrialBalanceQueryDto {
    @IsString()
    companyId!: string

    @IsOptional()
    @IsDateString()
    dateFrom?: string

    @IsOptional()
    @IsDateString()
    dateTo?: string

    @IsOptional()
    @IsString()
    accountType?: string

    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value === true || value === 'true')
    includeZeroBalances?: boolean

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(500)
    pageSize?: number
}

export class FicoJournalIntegrityQueryDto {
    @IsOptional()
    @IsString()
    companyId?: string

    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value === true || value === 'true')
    dryRun?: boolean
}

export class JournalEntryListQueryDto {
    @IsString()
    companyId!: string

    @IsOptional()
    @IsString()
    tab?: string

    @IsOptional()
    @IsString()
    status?: string

    @IsOptional()
    @IsString()
    approvalStatus?: string

    @IsOptional()
    @IsString()
    documentType?: string

    @IsOptional()
    @IsString()
    documentNumber?: string

    @IsOptional()
    @IsString()
    sourceModule?: string

    @IsOptional()
    @IsString()
    sourceDocumentId?: string

    @IsOptional()
    @IsString()
    glAccountId?: string

    @IsOptional()
    @IsString()
    currencyCode?: string

    @IsOptional()
    @IsString()
    createdBy?: string

    @IsOptional()
    @IsString()
    postedBy?: string

    @IsOptional()
    @IsString()
    search?: string

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    fiscalYear?: number

    @IsOptional()
    @IsString()
    fiscalPeriodId?: string

    @IsOptional()
    @IsDateString()
    dateFrom?: string

    @IsOptional()
    @IsDateString()
    dateTo?: string

    @IsOptional()
    @IsDateString()
    documentDateFrom?: string

    @IsOptional()
    @IsDateString()
    documentDateTo?: string

    @IsOptional()
    @IsString()
    sortBy?: string

    @IsOptional()
    @IsIn(['asc', 'desc'])
    sortDir?: 'asc' | 'desc'

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    pageSize?: number = 20
}

export class JournalEntrySummaryQueryDto {
    @IsString()
    companyId!: string

    @IsOptional()
    @IsDateString()
    dateFrom?: string

    @IsOptional()
    @IsDateString()
    dateTo?: string
}

export class JournalEntryDetailQueryDto {
    @IsString()
    companyId!: string

    @IsString()
    id!: string
}

export class ReverseJournalEntryDto {
    @IsString()
    companyId!: string

    @IsOptional()
    @IsString()
    journalEntryId?: string

    @IsString()
    reason!: string

    @IsOptional()
    @IsDateString()
    postingDate?: string
}

export class SubmitJournalEntryDto {
    @IsOptional()
    @IsString()
    reason?: string
}

export class ApproveJournalEntryDto {
    @IsOptional()
    @IsString()
    reason?: string
}

export class RejectJournalEntryDto {
    @IsString()
    reason!: string
}
