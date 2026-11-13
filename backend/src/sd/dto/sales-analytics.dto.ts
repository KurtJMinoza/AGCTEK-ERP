import { IsDateString, IsIn, IsOptional, ValidateIf } from 'class-validator'

export const SALES_ANALYTICS_RANGES = [
    'today',
    '7days',
    'month',
    'ytd',
    'custom',
] as const
export type SalesAnalyticsRange = (typeof SALES_ANALYTICS_RANGES)[number]

export const SALES_ANALYTICS_CHANNELS = ['ALL', 'ECOMMERCE', 'POS'] as const
export type SalesAnalyticsChannel = (typeof SALES_ANALYTICS_CHANNELS)[number]

export class SalesAnalyticsQueryDto {
    @IsOptional()
    @IsIn(SALES_ANALYTICS_RANGES)
    range?: SalesAnalyticsRange

    @IsOptional()
    @IsIn(SALES_ANALYTICS_CHANNELS)
    channel?: SalesAnalyticsChannel

    /** Manila calendar start (YYYY-MM-DD) when `range` is `custom`. */
    @ValidateIf((q) => q.range === 'custom')
    @IsDateString()
    from?: string

    /** Manila calendar end (YYYY-MM-DD) when `range` is `custom`. */
    @ValidateIf((q) => q.range === 'custom')
    @IsDateString()
    to?: string
}
