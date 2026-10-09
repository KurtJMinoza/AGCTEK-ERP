import {
    IsArray,
    IsEmail,
    IsIn,
    IsInt,
    IsObject,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    Min,
    MinLength,
    ValidateNested,
} from 'class-validator'
import { Transform, Type } from 'class-transformer'

const OPTIONAL_PHILIPPINE_MOBILE = /^(?:$|(?:\+63|0)9\d{9})$/
const normalizeMobile = (value: unknown) =>
    typeof value === 'string' ? value.trim().replace(/[\s()-]/g, '') : value

export class RetailRegisterDto {
    @Transform(({ value }) =>
        typeof value === 'string' ? value.trim().toLowerCase() : value,
    )
    @IsEmail()
    email!: string

    @IsString()
    @MinLength(8, { message: 'Password must be at least 8 characters.' })
    @MaxLength(72, { message: 'Password must be at most 72 characters.' })
    @Matches(/^(?=.*[A-Za-z])(?=.*\d)/, {
        message: 'Password must include at least one letter and one number.',
    })
    password!: string

    @Transform(({ value }) =>
        typeof value === 'string' ? value.trim() : value,
    )
    @IsString()
    @MinLength(1)
    @MaxLength(120)
    firstName!: string
}

export class RetailLoginDto {
    @IsEmail()
    email!: string

    @IsString()
    @MinLength(1)
    @MaxLength(128)
    password!: string
}

export class RetailUpdateProfileDto {
    @IsOptional()
    @Transform(({ value }) =>
        typeof value === 'string' ? value.trim() : value,
    )
    @IsString()
    @MinLength(1)
    @MaxLength(120)
    firstName?: string

    @IsOptional()
    @Transform(({ value }) => normalizeMobile(value))
    @IsString()
    @Matches(OPTIONAL_PHILIPPINE_MOBILE, {
        message: 'Enter a valid Philippine mobile number.',
    })
    phone?: string
}

export class RetailCartItemDto {
    @IsString()
    @MinLength(1)
    sku!: string

    @IsInt()
    @Min(1)
    quantity!: number

    @IsObject()
    product!: Record<string, unknown>
}

export class RetailReplaceCartDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RetailCartItemDto)
    items!: RetailCartItemDto[]
}
