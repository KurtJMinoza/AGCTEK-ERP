import { Transform } from 'class-transformer'
import {
    IsOptional,
    IsString,
    Length,
    Matches,
    MaxLength,
    MinLength,
} from 'class-validator'
import { assertGmailAddress, normalizeShopEmail } from '../gmail.util'

export class ShopEmailRequestDto {
    @Transform(({ value }) =>
        typeof value === 'string' ? normalizeShopEmail(value) : value,
    )
    @IsString()
    @MinLength(3)
    email!: string

    validateGmail() {
        assertGmailAddress(this.email)
    }
}

export class ShopEmailVerifyDto {
    @Transform(({ value }) =>
        typeof value === 'string' ? normalizeShopEmail(value) : value,
    )
    @IsString()
    email!: string

    @IsString()
    @Length(6, 6)
    @Matches(/^\d{6}$/)
    code!: string

    @IsOptional()
    @IsString()
    @MaxLength(120)
    firstName?: string

    validateGmail() {
        assertGmailAddress(this.email)
    }
}

export class ShopGoogleSignInDto {
    @IsString()
    @MinLength(10)
    credential!: string
}
