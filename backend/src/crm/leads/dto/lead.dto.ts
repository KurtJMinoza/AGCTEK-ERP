import {
    IsDate,
    IsEmail,
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
import {
    MAX_AMOUNT,
    OPPORTUNITY_OPEN_STAGES,
    type OpportunityOpenStage,
} from '../../opportunities/dto/opportunity.dto'

const upper = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value

export const LEAD_STATUSES = [
    'NEW',
    'CONTACTED',
    'QUALIFIED',
    'UNQUALIFIED',
    'CONVERTED',
    'LOST',
] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

export const LEAD_SOURCES = [
    'WEBSITE',
    'REFERRAL',
    'WALK_IN',
    'CAMPAIGN',
    'EVENT',
    'COLD_CALL',
    'OTHER',
] as const
export type LeadSource = (typeof LEAD_SOURCES)[number]

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value

const normalizeEmail = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value

export class ListLeadsQueryDto {
    @IsOptional()
    @IsString()
    @MaxLength(100)
    search?: string

    @IsOptional()
    @IsIn(LEAD_STATUSES)
    status?: LeadStatus

    @IsOptional()
    @IsIn(LEAD_SOURCES)
    source?: LeadSource

    @IsOptional()
    @IsString()
    assignedTo?: string

    @IsOptional()
    @IsString()
    customerId?: string

    /** Created at or after this instant. */
    @IsOptional()
    @Type(() => Date)
    @IsDate()
    createdFrom?: Date

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

export class CreateLeadDto {
    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    name!: string

    @IsOptional()
    @Transform(normalizeEmail)
    @IsEmail()
    @MaxLength(200)
    email?: string

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(40)
    phone?: string

    @IsOptional()
    @IsIn(LEAD_SOURCES)
    source?: LeadSource

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    customerId?: string

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    assignedTo?: string

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(100)
    score?: number
}

/** `customerId` / `assignedTo` accept `null` to unlink. */
export class UpdateLeadDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    name?: string

    @IsOptional()
    @Transform(normalizeEmail)
    @IsEmail()
    @MaxLength(200)
    email?: string | null

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(40)
    phone?: string | null

    @IsOptional()
    @IsIn(LEAD_SOURCES)
    source?: LeadSource

    @IsOptional()
    @IsIn(LEAD_STATUSES)
    status?: LeadStatus

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    customerId?: string | null

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    assignedTo?: string | null

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(100)
    score?: number | null
}

/** Created through SD's CustomerService; contact/email/phone default from the lead. */
export class ConvertLeadNewCustomerDto {
    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    companyName!: string

    @IsOptional()
    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    contactName?: string

    @IsOptional()
    @Transform(normalizeEmail)
    @IsEmail()
    @MaxLength(200)
    email?: string

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(40)
    phone?: string
}

export class ConvertLeadOpportunityDto {
    /** Defaults to the lead name. */
    @IsOptional()
    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    name?: string

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
    @Type(() => Date)
    @IsDate()
    expectedCloseDate?: Date
}

/**
 * Customer resolution: `customerId` links an existing SdCustomer, `newCustomer` asks SD to
 * create one; both may be omitted when the lead is already linked.
 */
export class ConvertLeadDto {
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    customerId?: string

    @IsOptional()
    @ValidateNested()
    @Type(() => ConvertLeadNewCustomerDto)
    newCustomer?: ConvertLeadNewCustomerDto

    @IsOptional()
    @ValidateNested()
    @Type(() => ConvertLeadOpportunityDto)
    opportunity?: ConvertLeadOpportunityDto
}
