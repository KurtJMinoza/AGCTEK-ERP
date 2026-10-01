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
} from 'class-validator'
import { Transform } from 'class-transformer'

export const CUSTOMER_STATUSES = ['ACTIVE', 'BLOCKED'] as const
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number]

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

    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(MAX_CREDIT_LIMIT)
    creditLimit!: number

    @IsOptional()
    @IsIn(CUSTOMER_STATUSES)
    status?: CustomerStatus

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
    @IsString()
    updatedBy?: string
}
