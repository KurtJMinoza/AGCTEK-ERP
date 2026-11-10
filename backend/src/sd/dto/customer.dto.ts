import {
    IsEmail,
    IsIn,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
    ValidateIf,
} from 'class-validator'
import { Transform } from 'class-transformer'

export const CUSTOMER_STATUSES = ['ACTIVE', 'BLOCKED', 'INACTIVE'] as const
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number]

export const CUSTOMER_ACCOUNT_TYPES = ['NON_CREDIT', 'CREDIT'] as const
export type CustomerAccountType = (typeof CUSTOMER_ACCOUNT_TYPES)[number]

export const CUSTOMER_CATEGORIES = ['RETAIL', 'CORPORATE', 'EMPLOYEE', 'WHOLESALE'] as const
export type CustomerCategory = (typeof CUSTOMER_CATEGORIES)[number]

export const PAYMENT_TERMS = ['IMMEDIATE', 'NET_30'] as const
export type PaymentTerm = (typeof PAYMENT_TERMS)[number]

export const CREDIT_STATUSES = ['NOT_APPLICABLE', 'PENDING', 'APPROVED', 'SUSPENDED'] as const
export type CreditStatus = (typeof CREDIT_STATUSES)[number]

const MAX_CREDIT_LIMIT = 999_999_999_999.99

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value

const normalizeEmail = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value

export class ListCustomersQueryDto {
    @IsOptional()
    @IsString()
    @MaxLength(100)
    search?: string

    @IsOptional()
    @IsIn(CUSTOMER_STATUSES)
    status?: CustomerStatus
}

export class CreateCustomerDto {
    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    companyName!: string

    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    contactName!: string

    @Transform(normalizeEmail)
    @IsEmail()
    @MaxLength(200)
    email!: string

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(40)
    phone?: string

    /** Required for CREDIT account type; NON_CREDIT customers carry no credit (omit or send 0). */
    @ValidateIf(
        (o: CreateCustomerDto) =>
            o.customerAccountType !== 'CREDIT' || o.creditLimit !== undefined,
    )
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(MAX_CREDIT_LIMIT)
    creditLimit?: number

    @IsOptional()
    @IsIn(CUSTOMER_STATUSES)
    status?: CustomerStatus

    /** Defaults to NON_CREDIT. */
    @IsOptional()
    @IsIn(CUSTOMER_ACCOUNT_TYPES)
    customerAccountType?: CustomerAccountType

    /** Defaults to RETAIL. */
    @IsOptional()
    @IsIn(CUSTOMER_CATEGORIES)
    customerCategory?: CustomerCategory

    /** Defaults to IMMEDIATE for NON_CREDIT, NET_30 for CREDIT. */
    @IsOptional()
    @IsIn(PAYMENT_TERMS)
    paymentTerms?: PaymentTerm

    /** Defaults to NOT_APPLICABLE for NON_CREDIT, PENDING for CREDIT. */
    @IsOptional()
    @IsIn(CREDIT_STATUSES)
    creditStatus?: CreditStatus

    @IsOptional()
    @IsString()
    createdBy?: string
}

export class UpdateCustomerDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    companyName?: string

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

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(MAX_CREDIT_LIMIT)
    creditLimit?: number

    @IsOptional()
    @IsIn(CUSTOMER_STATUSES)
    status?: CustomerStatus

    @IsOptional()
    @IsIn(CUSTOMER_ACCOUNT_TYPES)
    customerAccountType?: CustomerAccountType

    @IsOptional()
    @IsIn(CUSTOMER_CATEGORIES)
    customerCategory?: CustomerCategory

    @IsOptional()
    @IsIn(PAYMENT_TERMS)
    paymentTerms?: PaymentTerm

    @IsOptional()
    @IsIn(CREDIT_STATUSES)
    creditStatus?: CreditStatus

    @IsOptional()
    @IsString()
    updatedBy?: string
}
