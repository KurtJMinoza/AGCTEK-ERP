import { IsIn, IsOptional } from 'class-validator'

export const SALES_ANALYTICS_RANGES = [
    'today',
    '7days',
    'month',
    'ytd',
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
}
