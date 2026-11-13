import { Transform, Type } from 'class-transformer'
import {
    IsBoolean,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator'
import {
    QUOTATION_PDF_DISCLAIMER_MAX,
    QUOTATION_PDF_MARGIN_MAX,
    QUOTATION_PDF_MARGIN_MIN,
} from '../quotation-pdf-layout'

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)

export class QuotationPdfLayoutConfigDto {
    @IsOptional()
    @IsBoolean()
    showTin?: boolean

    @IsOptional()
    @IsBoolean()
    showOpportunity?: boolean

    @IsOptional()
    @IsBoolean()
    showPaymentTerms?: boolean

    @IsOptional()
    @IsInt()
    @Min(QUOTATION_PDF_MARGIN_MIN)
    @Max(QUOTATION_PDF_MARGIN_MAX)
    marginTop?: number

    @IsOptional()
    @IsInt()
    @Min(QUOTATION_PDF_MARGIN_MIN)
    @Max(QUOTATION_PDF_MARGIN_MAX)
    marginSide?: number

    /** Empty string restores the default disclaimer. */
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(QUOTATION_PDF_DISCLAIMER_MAX)
    disclaimer?: string
}

/** Layout changes only; the key stays fixed so the default profile keeps resolving. */
export class UpdatePdfLayoutProfileDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    name?: string

    @IsOptional()
    @ValidateNested()
    @Type(() => QuotationPdfLayoutConfigDto)
    config?: QuotationPdfLayoutConfigDto
}
