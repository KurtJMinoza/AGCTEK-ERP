import { IsDateString, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator'

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
