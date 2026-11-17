import {
    ArrayNotEmpty,
    ArrayUnique,
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
    MinLength,
} from 'class-validator'
import {
    FICO_DOCUMENT_ACCOUNT_TYPES,
    FICO_DOCUMENT_CATEGORIES,
    FICO_DOCUMENT_NUMBER_ASSIGNMENTS,
    FICO_DOCUMENT_TYPE_STATUSES,
} from '../fico.constants'

export class FicoDocumentTypeListQueryDto {
    @IsString()
    companyId!: string

    @IsOptional()
    @IsString()
    search?: string

    @IsOptional()
    @IsString()
    status?: string

    @IsOptional()
    @IsString()
    documentCategory?: string

    @IsOptional()
    @IsIn(['true', 'false'])
    reversalAllowed?: string

    @IsOptional()
    @IsString()
    numberRangeId?: string

    @IsOptional()
    @IsIn([
        'code',
        'name',
        'documentCategory',
        'status',
        'updatedAt',
        'createdAt',
    ])
    sortBy?: string

    @IsOptional()
    @IsIn(['asc', 'desc'])
    sortOrder?: 'asc' | 'desc'

    @IsOptional()
    @IsInt()
    @Min(1)
    page?: number

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(500)
    pageSize?: number
}

export class FicoDocumentTypeCreateDto {
    @IsString()
    companyId!: string

    @IsString()
    @MinLength(1)
    @MaxLength(16)
    @Matches(/^[A-Za-z0-9_-]+$/, {
        message:
            'Document type code may contain only letters, numbers, underscores, and hyphens.',
    })
    code!: string

    @IsString()
    @MinLength(1)
    @MaxLength(160)
    name!: string

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    description?: string | null

    @IsIn(FICO_DOCUMENT_CATEGORIES)
    documentCategory!: string

    @IsOptional()
    @IsString()
    numberRangeId?: string | null

    @IsOptional()
    @IsIn(FICO_DOCUMENT_NUMBER_ASSIGNMENTS)
    numberAssignment?: string

    @IsOptional()
    @IsBoolean()
    externalNumberAllowed?: boolean

    @IsOptional()
    @IsBoolean()
    numberRangeRequired?: boolean

    @IsArray()
    @ArrayNotEmpty()
    @ArrayUnique()
    @IsIn(FICO_DOCUMENT_ACCOUNT_TYPES, { each: true })
    allowedAccountTypes!: string[]

    @IsOptional()
    @IsBoolean()
    debitPostingAllowed?: boolean

    @IsOptional()
    @IsBoolean()
    creditPostingAllowed?: boolean

    @IsOptional()
    @IsBoolean()
    negativePostingAllowed?: boolean

    @IsOptional()
    @IsBoolean()
    reversalAllowed?: boolean

    @IsOptional()
    @IsString()
    reversalDocumentTypeId?: string | null

    @IsOptional()
    @IsBoolean()
    originalDocumentReferenceRequired?: boolean

    @IsOptional()
    @IsBoolean()
    reversalReasonRequired?: boolean

    @IsOptional()
    @IsBoolean()
    referenceRequired?: boolean

    @IsOptional()
    @IsBoolean()
    headerTextRequired?: boolean

    @IsOptional()
    @IsBoolean()
    lineTextRequired?: boolean

    @IsOptional()
    @IsIn(FICO_DOCUMENT_TYPE_STATUSES)
    status?: string

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    remarks?: string | null
}

export class FicoDocumentTypeUpdateDto {
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(160)
    name?: string

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    description?: string | null

    @IsOptional()
    @IsIn(FICO_DOCUMENT_CATEGORIES)
    documentCategory?: string

    @IsOptional()
    @IsString()
    numberRangeId?: string | null

    @IsOptional()
    @IsIn(FICO_DOCUMENT_NUMBER_ASSIGNMENTS)
    numberAssignment?: string

    @IsOptional()
    @IsBoolean()
    externalNumberAllowed?: boolean

    @IsOptional()
    @IsBoolean()
    numberRangeRequired?: boolean

    @IsOptional()
    @IsArray()
    @ArrayNotEmpty()
    @ArrayUnique()
    @IsIn(FICO_DOCUMENT_ACCOUNT_TYPES, { each: true })
    allowedAccountTypes?: string[]

    @IsOptional()
    @IsBoolean()
    debitPostingAllowed?: boolean

    @IsOptional()
    @IsBoolean()
    creditPostingAllowed?: boolean

    @IsOptional()
    @IsBoolean()
    negativePostingAllowed?: boolean

    @IsOptional()
    @IsBoolean()
    reversalAllowed?: boolean

    @IsOptional()
    @IsString()
    reversalDocumentTypeId?: string | null

    @IsOptional()
    @IsBoolean()
    originalDocumentReferenceRequired?: boolean

    @IsOptional()
    @IsBoolean()
    reversalReasonRequired?: boolean

    @IsOptional()
    @IsBoolean()
    referenceRequired?: boolean

    @IsOptional()
    @IsBoolean()
    headerTextRequired?: boolean

    @IsOptional()
    @IsBoolean()
    lineTextRequired?: boolean

    @IsOptional()
    @IsIn(FICO_DOCUMENT_TYPE_STATUSES)
    status?: string

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    remarks?: string | null
}

export class FicoDocumentTypeStatusDto {
    @IsOptional()
    @IsString()
    @MaxLength(500)
    reason?: string
}

export class FicoDocumentTypeHistoryQueryDto {
    @IsOptional()
    @IsInt()
    @Min(1)
    page?: number

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(200)
    pageSize?: number
}
