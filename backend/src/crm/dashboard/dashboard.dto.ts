import { IsInt, IsOptional, Max, Min } from 'class-validator'
import { Type } from 'class-transformer'

export const DASHBOARD_DEFAULT_PERIOD_DAYS = 90

export class CrmDashboardQueryDto {
    /** Rolling window for win/loss and lead conversion; live counts ignore it. */
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(365)
    days?: number
}
