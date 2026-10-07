import {
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

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value

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
