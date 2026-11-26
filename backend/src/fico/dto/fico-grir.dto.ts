import { Transform } from 'class-transformer'
import {
    IsBoolean,
    IsDateString,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Max,
    Min,
} from 'class-validator'
import {
    FICO_GRIR_OPEN_STATUSES,
    FICO_GRIR_RECONCILIATION_STATUSES,
} from '../fico-grir.constants'

export class FicoGrIrWorkbenchQueryDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsOptional()
    @IsString()
    supplierId?: string

    @IsOptional()
    @IsString()
    purchaseOrderId?: string

    @IsOptional()
    @IsString()
    materialId?: string

    @IsOptional()
    @IsString()
    plantId?: string

    @IsOptional()
    @IsString()
    @IsIn([...FICO_GRIR_OPEN_STATUSES])
    status?: string

    @IsOptional()
    @IsString()
    @IsIn([...FICO_GRIR_RECONCILIATION_STATUSES])
    reconciliationStatus?: string

    @IsOptional()
    @IsInt()
    @Min(0)
  @Max(3650)
    agingDaysMin?: number

    @IsOptional()
    @IsDateString()
    asOfDate?: string

    @IsOptional()
    @Transform(({ value }) => value === true || value === 'true')
    @IsBoolean()
    outstandingOnly?: boolean

    @IsOptional()
    @Transform(({ value }) => value === true || value === 'true')
    @IsBoolean()
    backfill?: boolean

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(500)
    limit?: number
}