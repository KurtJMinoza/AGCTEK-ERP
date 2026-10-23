import { Type } from 'class-transformer'
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
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
import type { CatalogLineInput } from '../sd-catalog-pricing'
import {
    QUOTATION_SECTION_TITLE_MAX,
    QUOTATION_STATUSES,
    REVISION_REASONS,
    type RevisionReason,
} from '../quotation.rules'

/** Free-text heading shown above product line `beforeLineNumber` (1-based); never priced. */
export interface QuotationSectionInput {
    title: string
    beforeLineNumber: number
}

/** New DRAFT quotation (revision 1) for a CRM opportunity; CRM resolves the customer. */
export interface CreateQuotationInput {
    crmOpportunityId: string
    customerId: string
    lines: CatalogLineInput[]
    sections?: QuotationSectionInput[]
    notes?: string
    createdBy: string
}

/**
 * DRAFT edit; omitted `lines` keep the current products and quantities (still re-priced).
 * Sending `lines` replaces the section headings too (omitted `sections` = none).
 */
export interface UpdateQuotationDraftInput {
    lines?: CatalogLineInput[]
    sections?: QuotationSectionInput[]
    /** Empty string clears the notes. */
    notes?: string
}

export interface SendQuotationInput {
    /** Last valid day (YYYY-MM-DD, Manila); defaults to 30 days after today. */
    validUntil?: string
}

export interface ReviseQuotationInput {
    reason: RevisionReason
    /** Required when `reason` is OTHER. */
    notes?: string
}

export class QuotationLineDto {
    @IsString()
    @IsNotEmpty()
    productId!: string

    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 3 })
    @Min(0.001)
    @Max(1_000_000)
    quantity!: number
}

/** Lines to check for indicative stock (same shape as quotation lines). */
export class QuotationStockCheckDto {
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(100)
    @ValidateNested({ each: true })
    @Type(() => QuotationLineDto)
    lines!: QuotationLineDto[]
}

export class QuotationSectionDto implements QuotationSectionInput {
    @IsString()
    @MaxLength(QUOTATION_SECTION_TITLE_MAX)
    title!: string

    @Type(() => Number)
    @IsInt()
    @Min(1)
    beforeLineNumber!: number
}

export class UpdateQuotationDraftDto implements UpdateQuotationDraftInput {
    @IsOptional()
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(100)
    @ValidateNested({ each: true })
    @Type(() => QuotationLineDto)
    lines?: QuotationLineDto[]

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(100)
    @ValidateNested({ each: true })
    @Type(() => QuotationSectionDto)
    sections?: QuotationSectionDto[]

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    notes?: string
}

export class SendQuotationDto implements SendQuotationInput {
    @IsOptional()
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'validUntil must be a date (YYYY-MM-DD)' })
    validUntil?: string
}

export class ReviseQuotationDto implements ReviseQuotationInput {
    @IsIn(REVISION_REASONS)
    reason!: RevisionReason

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    notes?: string
}

export class AcceptQuotationDto {
    @IsOptional()
    @IsString()
    @MaxLength(2000)
    note?: string
}

export class RejectQuotationDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(2000)
    reason!: string
}

export class CancelQuotationDto {
    @IsOptional()
    @IsString()
    @MaxLength(2000)
    reason?: string
}

export class ListQuotationsQueryDto {
    @IsOptional()
    @IsString()
    crmOpportunityId?: string

    @IsOptional()
    @IsString()
    customerId?: string

    @IsOptional()
    @IsIn(QUOTATION_STATUSES)
    status?: string

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    @Max(200)
    limit?: number
}
