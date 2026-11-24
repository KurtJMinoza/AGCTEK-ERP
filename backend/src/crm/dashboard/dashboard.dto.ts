import {
    IsDate,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
} from 'class-validator'
import { Type } from 'class-transformer'

export const DASHBOARD_DEFAULT_PERIOD_DAYS = 90
export const CADENCE_SCOPES = ['mine', 'all'] as const
export type CadenceScope = (typeof CADENCE_SCOPES)[number]

export class CrmDashboardQueryDto {
    /** Rolling window for win/loss and lead conversion; live counts ignore it. */
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(365)
    days?: number
}

/** `GET /crm/dashboard/cadence` — personal “what to do today” queue. */
export class CrmDashboardCadenceQueryDto {
    /** Default mine = current user. `all` = no owner filter (managers). */
    @IsOptional()
    @IsIn(CADENCE_SCOPES)
    scope?: CadenceScope

    /** Overrides mine when set (still ignored when scope=all). */
    @IsOptional()
    @IsString()
    @MaxLength(64)
    assignedTo?: string
}

/**
 * `GET /crm/dashboard/pipeline` — open-stage funnel + win rate for a period.
 * Open stage totals are live; `from`/`to`/`days` only bound closed deals for win rate.
 */
export class CrmDashboardPipelineQueryDto {
    @IsOptional()
    @IsIn(CADENCE_SCOPES)
    scope?: CadenceScope

    @IsOptional()
    @IsString()
    @MaxLength(64)
    assignedTo?: string

    /** Rolling window when `from` is omitted (default 90). Ignored when `from` is set. */
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(365)
    days?: number

    /** Inclusive lower bound for win/loss (`closedAt`). */
    @IsOptional()
    @Type(() => Date)
    @IsDate()
    from?: Date

    /** Inclusive upper bound for win/loss (`closedAt`). Defaults to now. */
    @IsOptional()
    @Type(() => Date)
    @IsDate()
    to?: Date
}

export const STALL_DEFAULT_THRESHOLD_DAYS = 14
export const STALL_MAX_THRESHOLD_DAYS = 365

/** `GET /crm/dashboard/stalled` — open opportunities past stage-age threshold. */
export class CrmDashboardStalledQueryDto {
    @IsOptional()
    @IsIn(CADENCE_SCOPES)
    scope?: CadenceScope

    @IsOptional()
    @IsString()
    @MaxLength(64)
    assignedTo?: string

    /** Days in current stage before an open opp is stalled (default 14). */
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(STALL_MAX_THRESHOLD_DAYS)
    thresholdDays?: number
}

/**
 * `GET /crm/dashboard/lead-sources` — leads created in period by source,
 * conversion rate, and won amount from linked opportunities closed in period.
 */
export class CrmDashboardLeadSourcesQueryDto {
    @IsOptional()
    @IsIn(CADENCE_SCOPES)
    scope?: CadenceScope

    @IsOptional()
    @IsString()
    @MaxLength(64)
    assignedTo?: string

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(365)
    days?: number

    @IsOptional()
    @Type(() => Date)
    @IsDate()
    from?: Date

    @IsOptional()
    @Type(() => Date)
    @IsDate()
    to?: Date
}
