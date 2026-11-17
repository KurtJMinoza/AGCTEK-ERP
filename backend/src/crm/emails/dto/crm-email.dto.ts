import { Transform, Type } from 'class-transformer'
import {
    IsBase64,
    IsBoolean,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
} from 'class-validator'

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)

export const CRM_EMAIL_FOLDERS = ['sent', 'drafts', 'starred', 'inbox', 'spam'] as const
export type CrmEmailFolder = (typeof CRM_EMAIL_FOLDERS)[number]

export class ListCrmEmailsQueryDto {
    @IsOptional()
    @IsIn(CRM_EMAIL_FOLDERS)
    folder?: CrmEmailFolder

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(200)
    q?: string

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(200)
    limit?: number
}

export class SetCrmEmailStarredDto {
    @IsBoolean()
    starred!: boolean
}

export class SetCrmEmailSpamDto {
    @IsBoolean()
    isSpam!: boolean
}

export class UpsertCrmEmailDraftDto {
    @IsOptional()
    @IsString()
    id?: string

    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(320)
    toEmail!: string

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(200)
    toName?: string

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(500)
    subject?: string

    @IsOptional()
    @IsString()
    @MaxLength(50_000)
    bodyText?: string

    @IsOptional()
    @IsString()
    @MaxLength(100_000)
    bodyHtml?: string

    @IsOptional()
    @IsString()
    customerId?: string

    @IsOptional()
    @IsString()
    opportunityId?: string

    @IsOptional()
    @IsString()
    quotationId?: string

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(120)
    templateKey?: string
}

export class UpdateCrmEmailDraftDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(320)
    toEmail?: string

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(200)
    toName?: string | null

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(500)
    subject?: string

    @IsOptional()
    @IsString()
    @MaxLength(50_000)
    bodyText?: string

    @IsOptional()
    @IsString()
    @MaxLength(100_000)
    bodyHtml?: string | null

    @IsOptional()
    @IsString()
    customerId?: string | null

    @IsOptional()
    @IsString()
    opportunityId?: string | null

    @IsOptional()
    @IsString()
    quotationId?: string | null

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(120)
    templateKey?: string | null
}

export class UploadCrmEmailAttachmentDto {
    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    fileName!: string

    @IsOptional()
    @IsString()
    @MaxLength(120)
    mimeType?: string

    @IsString()
    @IsNotEmpty()
    @IsBase64()
    contentBase64!: string
}
