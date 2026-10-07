import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsDate,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator'
import { Transform, Type } from 'class-transformer'
import { ACTIVITY_FILTERS, type ActivityFilter } from '../../activities/activity-status'
import { LOST_REASONS, type LostReason } from '../opportunity-stages'

export const OPPORTUNITY_OPEN_STAGES = [
    'PROSPECTING',
    'QUALIFICATION',
    'PROPOSAL',
    'NEGOTIATION',
] as const
export const OPPORTUNITY_STAGES = [
    ...OPPORTUNITY_OPEN_STAGES,
    'CLOSED_WON',
    'CLOSED_LOST',
] as const
export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number]
export type OpportunityOpenStage = (typeof OPPORTUNITY_OPEN_STAGES)[number]

export const MAX_AMOUNT = 999_999_999_999.99

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value

const upper = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value

export class ListOpportunitiesQueryDto {
    @IsOptional()
    @IsString()
    @MaxLength(100)
    search?: string

    @IsOptional()
    @IsIn(OPPORTUNITY_STAGES)
    stage?: OpportunityStage

    @IsOptional()
    @IsString()
    customerId?: string

    @IsOptional()
    @IsString()
    assignedTo?: string

    @IsOptional()
    @IsString()
    leadId?: string

    /** OVERDUE = open-stage opportunities with an open activity past due. */
    @IsOptional()
    @IsIn(ACTIVITY_FILTERS)
    activity?: ActivityFilter

    @IsOptional()
    @IsIn(LOST_REASONS)
    lostReason?: LostReason

    /** Closed (won or lost) at or after this instant. */
    @IsOptional()
    @Type(() => Date)
    @IsDate()
    closedFrom?: Date

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

/** New opportunities enter the pipeline in an open stage; closing goes through PATCH. */
export class CreateOpportunityDto {
    @IsString()
    @IsNotEmpty()
    customerId!: string

    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    name!: string

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(4000)
    description?: string

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(MAX_AMOUNT)
    amount?: number

    @IsOptional()
    @Transform(upper)
    @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO code' })
    currency?: string

    @IsOptional()
    @IsIn(OPPORTUNITY_OPEN_STAGES)
    stage?: OpportunityOpenStage

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(100)
    probability?: number

    @IsOptional()
    @Type(() => Date)
    @IsDate()
    expectedCloseDate?: Date

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    assignedTo?: string

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    leadId?: string
}

/** Nullable fields accept `null` to clear. `sdSalesOrderId` is never client-writable. */
export class UpdateOpportunityDto {
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    customerId?: string

    @IsOptional()
    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    name?: string

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(4000)
    description?: string | null

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(MAX_AMOUNT)
    amount?: number | null

    @IsOptional()
    @Transform(upper)
    @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO code' })
    currency?: string

    @IsOptional()
    @IsIn(OPPORTUNITY_STAGES)
    stage?: OpportunityStage

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(100)
    probability?: number | null

    @IsOptional()
    @Type(() => Date)
    @IsDate()
    expectedCloseDate?: Date | null

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    assignedTo?: string | null

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    leadId?: string | null

    /** Required when moving to CLOSED_LOST; only accepted on lost opportunities. */
    @IsOptional()
    @IsIn(LOST_REASONS)
    lostReason?: LostReason | null

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(1000)
    lostNotes?: string | null
}

/** Same filters as the list, minus stage (the summary is broken down by stage). */
export class OpportunityPipelineQueryDto {
    @IsOptional()
    @IsString()
    @MaxLength(100)
    search?: string

    @IsOptional()
    @IsString()
    customerId?: string

    @IsOptional()
    @IsString()
    assignedTo?: string
}

export class HandoffLineDto {
    @IsString()
    @IsNotEmpty()
    productId!: string

    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 3 })
    @Min(0.001)
    @Max(1_000_000)
    quantity!: number
}

/**
 * Close as won. The SD order comes from the opportunity's SENT / ACCEPTED quotation
 * (`quotationId`, or the active one when neither field is sent) or, without an active
 * quotation, from `lines` (SD catalog products only). Not both. Neither is needed when the
 * opportunity already has its SD sales order (re-winning after a reopen).
 */
export class WinOpportunityDto {
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(100)
    @ValidateNested({ each: true })
    @Type(() => HandoffLineDto)
    lines?: HandoffLineDto[]

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    quotationId?: string

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    notes?: string
}

/** Retry ERP handoff for a Closed Won opportunity without an SD order; same sources as win. */
export class CreateOpportunitySalesOrderDto extends WinOpportunityDto {}

/** New SD quotation (DRAFT) for the opportunity's customer, priced from the SD catalog. */
export class CreateOpportunityQuotationDto {
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(100)
    @ValidateNested({ each: true })
    @Type(() => HandoffLineDto)
    lines!: HandoffLineDto[]

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    notes?: string
}
