import {
    IsArray,
    IsBoolean,
    IsDateString,
    IsIn,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator'
import { Transform, Type } from 'class-transformer'

export class FicoArCompanyQueryDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string
}

export class FicoArDashboardQueryDto extends FicoArCompanyQueryDto {
    @IsOptional()
    @IsDateString()
    asOfDate?: string

    @IsOptional()
    @IsDateString()
    fromDate?: string

    @IsOptional()
    @IsDateString()
    toDate?: string
}

export class FicoArOpenItemQueryDto extends FicoArCompanyQueryDto {
    @IsOptional()
    @IsString()
    customerId?: string

    @IsOptional()
    @IsString()
    @MaxLength(120)
    search?: string

    @IsOptional()
    @IsString()
    status?: string

    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value === true || value === 'true')
    overdueOnly?: boolean

    @IsOptional()
    @IsDateString()
    asOfDate?: string
}

export class FicoArDocumentQueryDto extends FicoArCompanyQueryDto {
    @IsOptional()
    @IsString()
    customerId?: string

    @IsOptional()
    @IsString()
    status?: string

    @IsOptional()
    @IsString()
    @MaxLength(120)
    search?: string
}

export class FicoArAgingQueryDto extends FicoArCompanyQueryDto {
    @IsOptional()
    @IsDateString()
    asOfDate?: string
}

export class FicoArPaymentAllocationDto {
    @IsString()
    @IsNotEmpty()
    openItemId!: string

    @IsNumber()
    @Min(0.0001)
    amount!: number
}

export class CreateFicoArCollectionDto extends FicoArCompanyQueryDto {
    @IsString()
    @IsNotEmpty()
    customerId!: string

    @IsDateString()
    paymentDate!: string

    @IsString()
    @IsNotEmpty()
    @MaxLength(3)
    currencyCode!: string

    @IsNumber()
    @Min(0.0001)
    totalAmount!: number

    @IsOptional()
    @IsString()
    paymentMethodCode?: string

    @IsOptional()
    @IsString()
    bankAccountId?: string

    @IsOptional()
    @IsString()
    treasuryAccountId?: string

    @IsOptional()
    @IsString()
    @MaxLength(160)
    paymentReference?: string

    @IsOptional()
    @IsString()
    @MaxLength(240)
    idempotencyKey?: string

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => FicoArPaymentAllocationDto)
    allocations?: FicoArPaymentAllocationDto[]
}

export class CreateFicoArAdjustmentDto extends FicoArCompanyQueryDto {
    @IsIn(['CREDIT_MEMO', 'DEBIT_MEMO', 'ADVANCE', 'WRITE_OFF'])
    documentType!: 'CREDIT_MEMO' | 'DEBIT_MEMO' | 'ADVANCE' | 'WRITE_OFF'

    @IsString()
    @IsNotEmpty()
    customerId!: string

    @IsDateString()
    documentDate!: string

    @IsDateString()
    postingDate!: string

    @IsOptional()
    @IsDateString()
    dueDate?: string

    @IsString()
    @IsNotEmpty()
    @MaxLength(3)
    currencyCode!: string

    @IsNumber()
    @Min(0.0001)
    amount!: number

    @IsOptional()
    @IsString()
    @MaxLength(160)
    referenceNumber?: string

    @IsOptional()
    @IsString()
    @MaxLength(500)
    reason?: string

    @IsOptional()
    @IsString()
    @MaxLength(240)
    idempotencyKey?: string
}

export class UpsertCustomerCompanyAccountDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsOptional()
    @IsString()
    @MaxLength(80)
    customerAccountGroup?: string

    @IsOptional()
    @IsString()
    reconciliationAccountId?: string | null

    @IsOptional()
    @IsString()
    paymentTermsId?: string | null

    @IsOptional()
    @IsNumber()
    @Min(0)
    creditLimit?: number | null

    @IsOptional()
    @IsBoolean()
    postingBlocked?: boolean

    @IsOptional()
    @IsBoolean()
    collectionBlocked?: boolean

    @IsOptional()
    @IsIn(['ACTIVE', 'INACTIVE'])
    status?: 'ACTIVE' | 'INACTIVE'
}
