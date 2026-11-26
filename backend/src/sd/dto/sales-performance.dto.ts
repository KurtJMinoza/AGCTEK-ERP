import { Type } from 'class-transformer'
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsIn,
    IsInt,
    IsNumber,
    IsOptional,
    Matches,
    Max,
    Min,
    ValidateNested,
} from 'class-validator'
import {
    SALES_ANALYTICS_CHANNELS,
    type SalesAnalyticsChannel,
} from './sales-analytics.dto'

export class SalesPerformanceQueryDto {
    /** Manila calendar month `YYYY-MM`; defaults to the current month. */
    @IsOptional()
    @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
        message: '`month` must look like YYYY-MM.',
    })
    month?: string

    @IsOptional()
    @IsIn(SALES_ANALYTICS_CHANNELS)
    channel?: SalesAnalyticsChannel
}

export class SalesTargetsQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(2000)
    @Max(2100)
    year?: number
}

export class SalesTargetMonthDto {
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(12)
    month!: number

    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(999_999_999_999)
    salesTarget!: number

    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(999_999_999_999)
    collectionQuota!: number
}

export class SaveSalesTargetsDto {
    @Type(() => Number)
    @IsInt()
    @Min(2000)
    @Max(2100)
    year!: number

    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(12)
    @ValidateNested({ each: true })
    @Type(() => SalesTargetMonthDto)
    months!: SalesTargetMonthDto[]
}
