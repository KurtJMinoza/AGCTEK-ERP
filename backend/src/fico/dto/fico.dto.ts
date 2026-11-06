import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsNumber, IsArray, ValidateNested, Min, Max } from 'class-validator'
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

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateJournalLineDto)
    lines!: CreateJournalLineDto[]
}

export class CreateJournalLineDto {
    @IsString()
    glAccountId!: string

    @IsOptional()
    @IsNumber({}, { allowString: true })
    @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
    @Min(0)
    debitAmount?: number

    @IsOptional()
    @IsNumber({}, { allowString: true })
    @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
    @Min(0)
    creditAmount?: number

    @IsOptional()
    @IsString()
    description?: string
}

export class JournalEntryListQueryDto {
    @IsString()
    companyId!: string

    @IsOptional()
    @IsString()
    status?: string

    @IsOptional()
    @IsDateString()
    dateFrom?: string

    @IsOptional()
    @IsDateString()
    dateTo?: string

    @IsOptional()
    @IsInt()
    @Min(1)
    page?: number = 1

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(100)
    pageSize?: number = 20
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

    @IsString()
    journalEntryId!: string

    @IsString()
    reason!: string
}
