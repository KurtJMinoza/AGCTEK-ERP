import {
    IsArray,
    IsEmail,
    IsInt,
    IsObject,
    IsOptional,
    IsString,
    Min,
    MinLength,
    ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'

export class RetailRegisterDto {
    @IsEmail()
    email!: string

    @IsString()
    @MinLength(6)
    password!: string

    @IsString()
    @MinLength(1)
    fullName!: string

    @IsString()
    @MinLength(1)
    phone!: string

    @IsString()
    @MinLength(1)
    addressLine1!: string

    @IsString()
    @MinLength(1)
    city!: string

    @IsString()
    @MinLength(1)
    region!: string

    @IsString()
    @MinLength(1)
    postalCode!: string

    @IsOptional()
    @IsString()
    country?: string
}

export class RetailLoginDto {
    @IsEmail()
    email!: string

    @IsString()
    @MinLength(1)
    password!: string
}

export class RetailUpdateProfileDto {
    @IsString()
    @MinLength(1)
    clientId!: string

    @IsOptional()
    @IsString()
    @MinLength(1)
    fullName?: string

    @IsOptional()
    @IsString()
    phone?: string

    @IsOptional()
    @IsString()
    addressLine1?: string

    @IsOptional()
    @IsString()
    city?: string

    @IsOptional()
    @IsString()
    region?: string

    @IsOptional()
    @IsString()
    postalCode?: string

    @IsOptional()
    @IsString()
    country?: string
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
    @IsString()
    @MinLength(1)
    clientId!: string

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RetailCartItemDto)
    items!: RetailCartItemDto[]
}
