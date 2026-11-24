import {
    IsBoolean,
    IsDate,
    IsIn,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
    ValidateNested,
} from 'class-validator'
import { Transform, Type } from 'class-transformer'

export const ACTIVITY_TYPES = ['CALL', 'EMAIL', 'MEETING', 'TODO'] as const
export type ActivityType = (typeof ACTIVITY_TYPES)[number]

export const CALENDAR_SCOPES = ['mine', 'all'] as const
export type CalendarScope = (typeof CALENDAR_SCOPES)[number]

/** Inclusive range for `GET /crm/activities` — max 62 days (month grid with padding). */
export const CALENDAR_MAX_RANGE_DAYS = 62
export const CALENDAR_MAX_ITEMS = 500

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value

const toBoolean = ({ value }: { value: unknown }) => {
    if (value === true || value === 'true' || value === '1') return true
    if (value === false || value === 'false' || value === '0') return false
    return value
}

/** Calendar feed: activities with `dueAt` in `[from, to]` (Asia/Manila day policy on the client). */
export class CalendarActivitiesQueryDto {
    @Type(() => Date)
    @IsDate()
    from!: Date

    @Type(() => Date)
    @IsDate()
    to!: Date

    /** Default mine = current user. `all` = no owner filter. */
    @IsOptional()
    @IsIn(CALENDAR_SCOPES)
    scope?: CalendarScope

    @IsOptional()
    @IsString()
    @MaxLength(64)
    assignedTo?: string

    /** Include completed activities (default false — open only). */
    @IsOptional()
    @Transform(toBoolean)
    @IsBoolean()
    includeDone?: boolean
}

/** `assignedTo` defaults to the signed-in user. */
export class CreateActivityDto {
    @IsIn(ACTIVITY_TYPES)
    type!: ActivityType

    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(500)
    summary!: string

    @Type(() => Date)
    @IsDate()
    dueAt!: Date

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    assignedTo?: string
}

/** Optionally schedules the follow-up in the same transaction ("done → schedule next"). */
export class CompleteActivityDto {
    @IsOptional()
    @ValidateNested()
    @Type(() => CreateActivityDto)
    next?: CreateActivityDto
}
