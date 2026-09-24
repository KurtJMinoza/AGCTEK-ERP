import {
    IsBoolean,
    IsDateString,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Min,
} from 'class-validator'
import { Transform, Type } from 'class-transformer'
import {
    MM_EXCEPTION_DOMAINS,
    MM_EXCEPTION_SEVERITIES,
} from '../exception-center.types'

export class ExceptionCenterQueryDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsOptional()
    @IsString()
    plantId?: string

    @IsOptional()
    @IsString()
    warehouseId?: string

    @IsOptional()
    @IsIn(MM_EXCEPTION_SEVERITIES as unknown as string[])
    severity?: (typeof MM_EXCEPTION_SEVERITIES)[number]

    @IsOptional()
    @IsIn(MM_EXCEPTION_DOMAINS as unknown as string[])
    domain?: (typeof MM_EXCEPTION_DOMAINS)[number]

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
    @Transform(({ value }) => value === true || value === 'true' || value === '1')
    @IsBoolean()
    includeStale?: boolean

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    limit?: number

    @IsOptional()
    @IsString()
    role?: string

    @IsOptional()
    @IsString()
    authority?: string
}
