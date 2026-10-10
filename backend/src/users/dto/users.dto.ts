import {
    IsBoolean,
    IsEmail,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Max,
    Matches,
    MaxLength,
    Min,
    MinLength,
} from 'class-validator'
import { Transform, Type } from 'class-transformer'
import { ROLE_CODE_PATTERN } from '../../auth/auth.constants'

const ROLE_CODE_MESSAGE = 'role must be a valid role code'
const STATUS_VALUES = ['active', 'inactive'] as const

export class UserQueryDto {
    @IsOptional()
    @IsString()
    search?: string

    @IsOptional()
    @Matches(ROLE_CODE_PATTERN, { message: ROLE_CODE_MESSAGE })
    role?: string

    @IsOptional()
    @IsIn(STATUS_VALUES)
    status?: (typeof STATUS_VALUES)[number]

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    pageSize?: number = 10
}

export class CreateUserDto {
    @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
    @IsEmail()
    email!: string

    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    @IsString()
    @MinLength(1)
    @MaxLength(64)
    userName!: string

    @IsOptional()
    @IsString()
    @MaxLength(100)
    firstName?: string

    @IsOptional()
    @IsString()
    @MaxLength(100)
    lastName?: string

    @IsOptional()
    @IsString()
    @MaxLength(100)
    jobPosition?: string

    @IsString()
    @MinLength(6)
    password!: string

    @Matches(ROLE_CODE_PATTERN, { message: ROLE_CODE_MESSAGE })
    role!: string

    /** Initial (default) company. Required unless role is super_admin. */
    @IsOptional()
    @IsString()
    @MinLength(1)
    companyId?: string
}

export class UpdateUserDto {
    @IsOptional()
    @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
    @IsEmail()
    email?: string

    @IsOptional()
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    @IsString()
    @MinLength(1)
    @MaxLength(64)
    userName?: string

    @IsOptional()
    @IsString()
    @MaxLength(100)
    firstName?: string

    @IsOptional()
    @IsString()
    @MaxLength(100)
    lastName?: string

    @IsOptional()
    @IsString()
    @MaxLength(100)
    jobPosition?: string

    @IsOptional()
    @Matches(ROLE_CODE_PATTERN, { message: ROLE_CODE_MESSAGE })
    role?: string
}

export class UpdateUserStatusDto {
    @IsBoolean()
    isActive!: boolean
}

export class AssignCompanyDto {
    @IsString()
    @MinLength(1)
    companyId!: string
}
