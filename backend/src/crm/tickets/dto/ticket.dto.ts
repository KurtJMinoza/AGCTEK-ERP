import {
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
} from 'class-validator'
import { Transform } from 'class-transformer'
import { ACTIVITY_FILTERS, type ActivityFilter } from '../../activities/activity-status'

export const TICKET_STATUSES = [
    'OPEN',
    'IN_PROGRESS',
    'WAITING_CUSTOMER',
    'RESOLVED',
    'CLOSED',
    'CANCELLED',
] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]

export const TICKET_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const
export type TicketPriority = (typeof TICKET_PRIORITIES)[number]

export const TICKET_CATEGORIES = [
    'GENERAL',
    'PRODUCT',
    'DELIVERY',
    'BILLING',
    'RETURN',
    'COMPLAINT',
    'TECHNICAL',
    'OTHER',
] as const
export type TicketCategory = (typeof TICKET_CATEGORIES)[number]

/** Default work queue when no status filter is given. */
export const TICKET_DEFAULT_QUEUE_STATUSES = ['OPEN', 'WAITING_CUSTOMER'] as const satisfies readonly TicketStatus[]
/** Highest first. */
export const TICKET_PRIORITY_ORDER = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as const satisfies readonly TicketPriority[]
export const TICKET_QUEUES = ['DEFAULT', 'ALL'] as const
export const TICKET_SORTS = ['priority', 'newest'] as const

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value

export class ListTicketsQueryDto {
    @IsOptional()
    @IsString()
    @MaxLength(100)
    search?: string

    /** Overrides `queue` when set. */
    @IsOptional()
    @IsIn(TICKET_STATUSES)
    status?: TicketStatus

    /** DEFAULT (when omitted) = OPEN + WAITING_CUSTOMER; ALL = every status. */
    @IsOptional()
    @IsIn(TICKET_QUEUES)
    queue?: (typeof TICKET_QUEUES)[number]

    /** priority (default) = URGENT → LOW, oldest first within a priority; newest = created desc. */
    @IsOptional()
    @IsIn(TICKET_SORTS)
    sort?: (typeof TICKET_SORTS)[number]

    @IsOptional()
    @IsIn(TICKET_PRIORITIES)
    priority?: TicketPriority

    @IsOptional()
    @IsIn(TICKET_CATEGORIES)
    category?: TicketCategory

    @IsOptional()
    @IsString()
    customerId?: string

    @IsOptional()
    @IsString()
    assignedTo?: string

    /** OVERDUE = non-terminal tickets with an open activity past due (combine with queue=ALL for every such ticket). */
    @IsOptional()
    @IsIn(ACTIVITY_FILTERS)
    activity?: ActivityFilter

    @IsOptional()
    @IsInt()
    @Min(1)
    page?: number

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(100)
    pageSize?: number
}

/** New tickets always start OPEN. */
export class CreateTicketDto {
    @IsString()
    @IsNotEmpty()
    customerId!: string

    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    subject!: string

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(4000)
    description?: string

    @IsOptional()
    @IsIn(TICKET_PRIORITIES)
    priority?: TicketPriority

    @IsOptional()
    @IsIn(TICKET_CATEGORIES)
    category?: TicketCategory

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    assignedTo?: string

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(100)
    rmaReference?: string
}

/** Nullable fields accept `null` to clear. The customer of a ticket cannot change. */
export class UpdateTicketDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    subject?: string

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(4000)
    description?: string | null

    @IsOptional()
    @IsIn(TICKET_STATUSES)
    status?: TicketStatus

    @IsOptional()
    @IsIn(TICKET_PRIORITIES)
    priority?: TicketPriority

    @IsOptional()
    @IsIn(TICKET_CATEGORIES)
    category?: TicketCategory

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    assignedTo?: string | null

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(100)
    rmaReference?: string | null
}

export class CreateTicketCommentDto {
    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(4000)
    body!: string
}
