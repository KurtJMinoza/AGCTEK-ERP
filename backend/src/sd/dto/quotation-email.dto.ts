import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'
import { QUOTATION_EMAIL_TEMPLATE_KEY_PATTERN } from '../quotation-email-template'

const TEMPLATE_KEY = { message: 'Invalid email template key' } as const

/** Composer payload; omitted fields fall back to the selected template. */
export class SendQuotationEmailDto {
    @IsOptional()
    @IsString()
    @Matches(QUOTATION_EMAIL_TEMPLATE_KEY_PATTERN, TEMPLATE_KEY)
    templateKey?: string

    @IsOptional()
    @IsString()
    @MaxLength(300)
    subject?: string

    @IsOptional()
    @IsString()
    @MaxLength(20_000)
    bodyText?: string

    @IsOptional()
    @IsString()
    @MaxLength(50_000)
    bodyHtml?: string

    @IsOptional()
    @IsBoolean()
    isResend?: boolean
}

export class QuotationEmailPreviewQueryDto {
    @IsOptional()
    @IsString()
    @Matches(QUOTATION_EMAIL_TEMPLATE_KEY_PATTERN, TEMPLATE_KEY)
    templateKey?: string
}

/** Saves the composer's current copy as a reusable template (placeholders are restored server-side). */
export class SaveQuotationEmailTemplateDto {
    @IsString()
    @MinLength(1)
    @MaxLength(120)
    name!: string

    @IsString()
    @MinLength(1)
    @MaxLength(300)
    subject!: string

    @IsString()
    @MinLength(1)
    @MaxLength(20_000)
    bodyText!: string
}

/** Template copy only; the key and module are immutable. */
export class UpdateQuotationEmailTemplateDto {
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(120)
    name?: string

    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(300)
    subject?: string

    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(20_000)
    bodyText?: string

    /** Empty string clears an authored HTML body. */
    @IsOptional()
    @IsString()
    @MaxLength(50_000)
    bodyHtml?: string

    @IsOptional()
    @IsBoolean()
    isDefault?: boolean

    @IsOptional()
    @IsBoolean()
    isActive?: boolean
}
